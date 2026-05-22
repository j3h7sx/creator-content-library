import { randomUUID } from "node:crypto";
import path from "node:path";
import { catalogImages } from "@/lib/catalog/catalog";
import { loadConfig, resolveFromRoot, toRootRelative } from "@/lib/config/load";
import {
  appendImportJobMessage,
  claimNextDueImportJob,
  createImportJob,
  dismissImportJob as dismissStoredImportJob,
  getImportJobById,
  getNextImportJobAttemptAt,
  listImportJobs as listStoredImportJobs,
  recordImportJobProgress,
  recoverRunningImportJobs,
  updateImportJob,
  type ImportJob,
  type ImportJobSource,
  type ImportJobStatus,
} from "@/lib/db/import-jobs";
import { getDb } from "@/lib/db/schema";
import { slugify, walkImageFiles } from "@/lib/images/files";
import { downloadPinterestBoard } from "@/lib/pinterest/downloader";

export type { ImportJob, ImportJobSource, ImportJobStatus };

type WorkerState = {
  activeCount: number;
  draining: boolean;
  recovered: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const WORKER_STATE_KEY = "__creatorContentLibraryImportWorker";
const RETRY_DELAYS_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000,
];
const MAX_ATTEMPTS = 8;

function getWorkerState(): WorkerState {
  const globalStore = globalThis as typeof globalThis & {
    [WORKER_STATE_KEY]?: WorkerState;
  };

  globalStore[WORKER_STATE_KEY] ??= {
    activeCount: 0,
    draining: false,
    recovered: false,
    timer: null,
  };
  return globalStore[WORKER_STATE_KEY];
}

function nowIso() {
  return new Date().toISOString();
}

export function getImportWorkerConcurrency() {
  const configured = Number.parseInt(
    process.env.CONTENT_LIBRARY_IMPORT_CONCURRENCY ?? process.env.IMPORT_WORKER_CONCURRENCY ?? "",
    10,
  );

  if (!Number.isFinite(configured) || configured < 1) {
    return 2;
  }

  return Math.min(configured, 6);
}

function scheduleImportWorker(delayMs = 0) {
  const state = getWorkerState();
  if (state.timer) {
    if (delayMs > 0) {
      return;
    }
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(() => {
    state.timer = null;
    void drainImportJobs();
  }, delayMs);
}

export async function ensureImportWorkerStarted() {
  const state = getWorkerState();
  if (!state.recovered) {
    const db = await getDb();
    recoverRunningImportJobs(db);
    state.recovered = true;
  }

  scheduleImportWorker(0);
}

async function drainImportJobs() {
  const state = getWorkerState();
  if (state.draining) {
    scheduleImportWorker(1_000);
    return;
  }

  state.draining = true;
  try {
    const db = await getDb();
    const concurrency = getImportWorkerConcurrency();

    while (state.activeCount < concurrency) {
      const job = claimNextDueImportJob(db, nowIso());
      if (!job) {
        break;
      }

      state.activeCount += 1;
      void processImportJob(job).finally(() => {
        const latestState = getWorkerState();
        latestState.activeCount = Math.max(0, latestState.activeCount - 1);
        scheduleImportWorker(0);
      });
    }

    const nextAttemptAt = getNextImportJobAttemptAt(db);
    if (nextAttemptAt && state.activeCount < concurrency) {
      const delayMs = Math.max(1_000, Date.parse(nextAttemptAt) - Date.now());
      scheduleImportWorker(delayMs);
    }
  } finally {
    state.draining = false;
  }
}

async function processImportJob(job: ImportJob) {
  if (job.source === "pinterest") {
    await processPinterestImportJob(job);
    return;
  }

  await processFileImportJob(job);
}

async function processFileImportJob(job: ImportJob) {
  const db = await getDb();
  try {
    const summary = await catalogImages({
      scan: job.imported,
      move: true,
      onProgress: (message) => recordImportJobProgress(db, job.id, message),
    });
    const current = getImportJobById(db, job.id) ?? job;
    updateImportJob(db, job.id, {
      status: "completed",
      processed: current.total,
      summary,
      error: null,
      nextAttemptAt: null,
      finishedAt: nowIso(),
    });
  } catch (error) {
    await failOrRetryImportJob(job.id, error);
  }
}

async function processPinterestImportJob(job: ImportJob) {
  const db = await getDb();
  try {
    if (!job.sourceUrl) {
      throw new Error("Pinterest import is missing a board URL.");
    }

    const config = await loadConfig();
    const workingDir = job.workingDir ?? createPinterestWorkingDir(job.id, job.sourceUrl, config.inboxDir);

    updateImportJob(db, job.id, { workingDir });
    appendImportJobMessage(db, job.id, "Downloading Pinterest board.");
    const download = await downloadPinterestBoard({
      boardUrl: job.sourceUrl,
      outDir: workingDir,
      config,
      onProgress: (message) => appendImportJobMessage(db, job.id, message),
    });

    const candidates = await walkImageFiles([download.outputRelativePath], config);
    updateImportJob(db, job.id, {
      imported: candidates.map((candidate) => candidate.relativePath),
      total: candidates.length,
      processed: 0,
    });
    appendImportJobMessage(db, job.id, `Downloaded ${candidates.length} image file(s).`);

    const summary = await catalogImages({
      scan: [download.outputRelativePath],
      move: true,
      onProgress: (message) => recordImportJobProgress(db, job.id, message),
    });
    const current = getImportJobById(db, job.id) ?? job;
    updateImportJob(db, job.id, {
      status: "completed",
      processed: current.total,
      summary,
      error: null,
      nextAttemptAt: null,
      finishedAt: nowIso(),
    });
  } catch (error) {
    await failOrRetryImportJob(job.id, error);
  }
}

function createPinterestWorkingDir(jobId: string, boardUrl: string, inboxDir: string) {
  const boardSlug = slugify(new URL(boardUrl).pathname, "pinterest-board");
  return toRootRelative(
    resolveFromRoot(path.join(inboxDir, "pinterest", `${jobId.slice(0, 8)}-${boardSlug}`)),
  );
}

async function failOrRetryImportJob(jobId: string, error: unknown) {
  const db = await getDb();
  const current = getImportJobById(db, jobId);
  if (!current) {
    return;
  }

  const message = error instanceof Error ? error.message : "Import processing failed.";
  if (!isRetryableImportError(message) || current.attempts >= MAX_ATTEMPTS) {
    updateImportJob(db, jobId, {
      status: "failed",
      error: message,
      finishedAt: nowIso(),
    });
    return;
  }

  const delayMs = RETRY_DELAYS_MS[Math.min(current.attempts - 1, RETRY_DELAYS_MS.length - 1)];
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  updateImportJob(db, jobId, {
    status: "retrying",
    error: message,
    messages: [`Retrying automatically after: ${message}`, ...current.messages].slice(0, 8),
    nextAttemptAt,
  });
  scheduleImportWorker(delayMs);
}

function isRetryableImportError(message: string) {
  return !/configuration|dependencies|missing:|no pinterest downloader|valid pinterest|does not look like/i.test(message);
}

export async function startImportJob(input: { imported: string[]; rejected: string[] }) {
  const db = await getDb();
  const timestamp = nowIso();
  const job = createImportJob(db, {
    id: randomUUID(),
    status: input.imported.length > 0 ? "queued" : "completed",
    source: "files",
    imported: input.imported,
    rejected: input.rejected,
    total: input.imported.length,
    processed: 0,
    finishedAt: input.imported.length > 0 ? null : timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await ensureImportWorkerStarted();
  return job;
}

export async function startPinterestImportJob(input: { boardUrl: string }) {
  const db = await getDb();
  const config = await loadConfig();
  const timestamp = nowIso();
  const id = randomUUID();
  const job = createImportJob(db, {
    id,
    status: "queued",
    source: "pinterest",
    sourceUrl: input.boardUrl,
    workingDir: createPinterestWorkingDir(id, input.boardUrl, config.inboxDir),
    imported: [],
    rejected: [],
    total: 0,
    processed: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await ensureImportWorkerStarted();
  return job;
}

export async function getImportJob(id: string): Promise<ImportJob | null> {
  await ensureImportWorkerStarted();
  const db = await getDb();
  return getImportJobById(db, id);
}

export async function listImportJobs(): Promise<ImportJob[]> {
  await ensureImportWorkerStarted();
  const db = await getDb();
  return listStoredImportJobs(db);
}

export async function dismissImportJob(id: string): Promise<ImportJob | null> {
  const db = await getDb();
  return dismissStoredImportJob(db, id);
}
