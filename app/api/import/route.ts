import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadConfig, resolveFromRoot } from "@/lib/config/load";
import { ensureDir, isImagePath, safeFileName, uniqueTargetPath } from "@/lib/images/files";
import { getImportWorkerConcurrency, listImportJobs, startImportJob } from "@/lib/import/jobs";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listImportJobs();

  return NextResponse.json({
    jobs,
    worker: {
      concurrency: getImportWorkerConcurrency(),
    },
  });
}

export async function POST(request: Request) {
  const config = await loadConfig();
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  const inboxPath = resolveFromRoot(config.inboxDir);
  await ensureDir(inboxPath);

  const imported: string[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    const fileName = safeFileName(file.name);
    if (!isImagePath(fileName, config)) {
      rejected.push(file.name);
      continue;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const target = await uniqueTargetPath(path.join(inboxPath, fileName));
    await writeFile(target, bytes);
    imported.push(path.relative(process.cwd(), target).split(path.sep).join("/"));
  }

  const job = await startImportJob({ imported, rejected });

  return NextResponse.json(
    {
      imported,
      rejected,
      job,
      message:
        imported.length > 0
          ? `Queued ${imported.length} file(s) for cataloging.`
          : "No supported image files were imported.",
    },
    { status: imported.length > 0 ? 202 : 200 },
  );
}
