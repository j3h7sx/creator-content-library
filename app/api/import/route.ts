import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadConfig, resolveFromRoot } from "@/lib/config/load";
import { ensureDir, isImagePath, safeFileName, uniqueTargetPath } from "@/lib/images/files";

export const runtime = "nodejs";

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

  return NextResponse.json({
    imported,
    rejected,
    message:
      imported.length > 0
        ? `Imported ${imported.length} file(s). Run bun run catalog to process them.`
        : "No supported image files were imported.",
  });
}
