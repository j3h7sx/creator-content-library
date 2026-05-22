import type { CatalogSummary } from "@/lib/catalog/catalog";
import type { Db } from "./schema";

export type ImportJobStatus = "queued" | "running" | "retrying" | "completed" | "failed";
export type ImportJobSource = "files" | "pinterest";

export type ImportJob = {
  id: string;
  status: ImportJobStatus;
  source: ImportJobSource;
  sourceUrl: string | null;
  workingDir: string | null;
  imported: string[];
  rejected: string[];
  total: number;
  processed: number;
  attempts: number;
  messages: string[];
  summary: CatalogSummary | null;
  error: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  dismissedAt: string | null;
};

type ImportJobRow = {
  id: string;
  source: ImportJobSource;
  status: ImportJobStatus;
  source_url: string | null;
  working_dir: string | null;
  imported_json: string;
  rejected_json: string;
  messages_json: string;
  summary_json: string | null;
  error: string | null;
  total: number;
  processed: number;
  attempts: number;
  next_attempt_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CreateImportJobInput = {
  id: string;
  source: ImportJobSource;
  status: ImportJobStatus;
  sourceUrl?: string | null;
  workingDir?: string | null;
  imported?: string[];
  rejected?: string[];
  total?: number;
  processed?: number;
  messages?: string[];
  summary?: CatalogSummary | null;
  error?: string | null;
  nextAttemptAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImportJobUpdate = Partial<{
  status: ImportJobStatus;
  sourceUrl: string | null;
  workingDir: string | null;
  imported: string[];
  rejected: string[];
  messages: string[];
  summary: CatalogSummary | null;
  error: string | null;
  total: number;
  processed: number;
  attempts: number;
  nextAttemptAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  dismissedAt: string | null;
  updatedAt: string;
}>;

function nowIso() {
  return new Date().toISOString();
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSummary(value: string | null): CatalogSummary | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as CatalogSummary;
  } catch {
    return null;
  }
}

function rowToImportJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    sourceUrl: row.source_url,
    workingDir: row.working_dir,
    imported: parseStringArray(row.imported_json),
    rejected: parseStringArray(row.rejected_json),
    total: row.total,
    processed: row.processed,
    attempts: row.attempts,
    messages: parseStringArray(row.messages_json),
    summary: parseSummary(row.summary_json),
    error: row.error,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    dismissedAt: row.dismissed_at,
  };
}

export function createImportJob(db: Db, input: CreateImportJobInput): ImportJob {
  db.prepare(`
    INSERT INTO import_jobs (
      id, source, status, source_url, working_dir, imported_json, rejected_json,
      messages_json, summary_json, error, total, processed, attempts,
      next_attempt_at, started_at, finished_at, dismissed_at, created_at, updated_at
    ) VALUES (
      @id, @source, @status, @source_url, @working_dir, @imported_json, @rejected_json,
      @messages_json, @summary_json, @error, @total, @processed, @attempts,
      @next_attempt_at, @started_at, @finished_at, @dismissed_at, @created_at, @updated_at
    )
  `).run({
    id: input.id,
    source: input.source,
    status: input.status,
    source_url: input.sourceUrl ?? null,
    working_dir: input.workingDir ?? null,
    imported_json: JSON.stringify(input.imported ?? []),
    rejected_json: JSON.stringify(input.rejected ?? []),
    messages_json: JSON.stringify(input.messages ?? []),
    summary_json: input.summary ? JSON.stringify(input.summary) : null,
    error: input.error ?? null,
    total: input.total ?? 0,
    processed: input.processed ?? 0,
    attempts: 0,
    next_attempt_at: input.nextAttemptAt ?? null,
    started_at: input.startedAt ?? null,
    finished_at: input.finishedAt ?? null,
    dismissed_at: input.dismissedAt ?? null,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  });

  const job = getImportJobById(db, input.id);
  if (!job) {
    throw new Error("Could not create import job.");
  }

  return job;
}

export function getImportJobById(db: Db, id: string): ImportJob | null {
  const row = db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(id) as ImportJobRow | undefined;
  return row ? rowToImportJob(row) : null;
}

export function listImportJobs(db: Db, limit = 12): ImportJob[] {
  const rows = db.prepare(`
    SELECT *
    FROM import_jobs
    WHERE dismissed_at IS NULL
    ORDER BY
      CASE status
        WHEN 'running' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'retrying' THEN 2
        WHEN 'failed' THEN 3
        ELSE 4
      END,
      updated_at DESC
    LIMIT @limit
  `).all({ limit }) as ImportJobRow[];

  return rows.map(rowToImportJob);
}

export function updateImportJob(db: Db, id: string, update: ImportJobUpdate): ImportJob | null {
  const current = getImportJobById(db, id);
  if (!current) {
    return null;
  }

  db.prepare(`
    UPDATE import_jobs
    SET
      status = @status,
      source_url = @source_url,
      working_dir = @working_dir,
      imported_json = @imported_json,
      rejected_json = @rejected_json,
      messages_json = @messages_json,
      summary_json = @summary_json,
      error = @error,
      total = @total,
      processed = @processed,
      attempts = @attempts,
      next_attempt_at = @next_attempt_at,
      started_at = @started_at,
      finished_at = @finished_at,
      dismissed_at = @dismissed_at,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    status: update.status ?? current.status,
    source_url: "sourceUrl" in update ? update.sourceUrl : current.sourceUrl,
    working_dir: "workingDir" in update ? update.workingDir : current.workingDir,
    imported_json: JSON.stringify(update.imported ?? current.imported),
    rejected_json: JSON.stringify(update.rejected ?? current.rejected),
    messages_json: JSON.stringify(update.messages ?? current.messages),
    summary_json:
      "summary" in update
        ? update.summary
          ? JSON.stringify(update.summary)
          : null
        : current.summary
          ? JSON.stringify(current.summary)
          : null,
    error: "error" in update ? update.error : current.error,
    total: update.total ?? current.total,
    processed: update.processed ?? current.processed,
    attempts: update.attempts ?? current.attempts,
    next_attempt_at: "nextAttemptAt" in update ? update.nextAttemptAt : current.nextAttemptAt,
    started_at: "startedAt" in update ? update.startedAt : current.startedAt,
    finished_at: "finishedAt" in update ? update.finishedAt : current.finishedAt,
    dismissed_at: "dismissedAt" in update ? update.dismissedAt : current.dismissedAt,
    updated_at: update.updatedAt ?? nowIso(),
  });

  return getImportJobById(db, id);
}

export function dismissImportJob(db: Db, id: string): ImportJob | null {
  const current = getImportJobById(db, id);
  if (!current || (current.status !== "completed" && current.status !== "failed")) {
    return current;
  }

  return updateImportJob(db, id, {
    dismissedAt: nowIso(),
  });
}

export function appendImportJobMessage(db: Db, id: string, message: string): ImportJob | null {
  const current = getImportJobById(db, id);
  if (!current) {
    return null;
  }

  return updateImportJob(db, id, {
    messages: [message, ...current.messages].slice(0, 8),
  });
}

export function recordImportJobProgress(db: Db, id: string, message: string): ImportJob | null {
  const current = getImportJobById(db, id);
  if (!current) {
    return null;
  }

  const processed =
    message.startsWith("cataloged ") || message.startsWith("skip ")
      ? Math.min(current.total, current.processed + 1)
      : current.processed;

  return updateImportJob(db, id, {
    messages: [message, ...current.messages].slice(0, 8),
    processed,
  });
}

export function claimNextDueImportJob(db: Db, atIso: string): ImportJob | null {
  const row = db.prepare(`
    SELECT *
    FROM import_jobs
    WHERE
      status = 'queued'
      OR (status = 'retrying' AND (next_attempt_at IS NULL OR next_attempt_at <= @atIso))
    ORDER BY created_at ASC
    LIMIT 1
  `).get({ atIso }) as ImportJobRow | undefined;

  if (!row) {
    return null;
  }

  const now = nowIso();
  const result = db.prepare(`
    UPDATE import_jobs
    SET
      status = 'running',
      attempts = attempts + 1,
      next_attempt_at = NULL,
      error = NULL,
      started_at = @now,
      updated_at = @now
    WHERE id = @id AND (
      status = 'queued'
      OR (status = 'retrying' AND (next_attempt_at IS NULL OR next_attempt_at <= @atIso))
    )
  `).run({ id: row.id, now, atIso });

  if (result.changes === 0) {
    return null;
  }

  return getImportJobById(db, row.id);
}

export function getNextImportJobAttemptAt(db: Db): string | null {
  const row = db.prepare(`
    SELECT next_attempt_at as nextAttemptAt
    FROM import_jobs
    WHERE status = 'retrying' AND next_attempt_at IS NOT NULL
    ORDER BY next_attempt_at ASC
    LIMIT 1
  `).get() as { nextAttemptAt: string | null } | undefined;

  return row?.nextAttemptAt ?? null;
}

export function recoverRunningImportJobs(db: Db): void {
  const now = nowIso();
  db.prepare(`
    UPDATE import_jobs
    SET
      status = 'queued',
      error = 'Recovered after server restart.',
      updated_at = @now
    WHERE status = 'running'
  `).run({ now });
}
