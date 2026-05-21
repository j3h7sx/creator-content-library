import path from "node:path";
import { loadConfig, resolveFromRoot, toRootRelative } from "@/lib/config/load";
import { ensureDir, hashFile, moveFile, uniqueTargetPath, walkImageFiles } from "@/lib/images/files";

export type DuplicateItem = {
  sha256: string;
  keepPath: string;
  duplicatePath: string;
  movedTo: string | null;
};

export type DedupeSummary = {
  scanned: number;
  duplicates: DuplicateItem[];
};

export async function dedupeImages(options: {
  move?: boolean;
  scan?: string[];
} = {}): Promise<DedupeSummary> {
  const config = await loadConfig();
  const scanRoots = options.scan?.length ? options.scan : [config.libraryRoot];
  const candidates = await walkImageFiles(scanRoots, config);
  const seen = new Map<string, string>();
  const duplicates: DuplicateItem[] = [];

  if (options.move) {
    await ensureDir(resolveFromRoot(config.duplicatesDir));
  }

  for (const candidate of candidates) {
    const digest = await hashFile(candidate.absolutePath);
    const existing = seen.get(digest);
    if (!existing) {
      seen.set(digest, candidate.relativePath);
      continue;
    }

    let movedTo: string | null = null;
    if (options.move) {
      const parsed = path.parse(candidate.absolutePath);
      const target = await uniqueTargetPath(
        resolveFromRoot(
          path.join(
            config.duplicatesDir,
            `${parsed.name}__duplicate-of-${digest.slice(0, 10)}${parsed.ext.toLowerCase()}`,
          ),
        ),
      );
      await moveFile(candidate.absolutePath, target);
      movedTo = toRootRelative(target);
    }

    duplicates.push({
      sha256: digest,
      keepPath: existing,
      duplicatePath: candidate.relativePath,
      movedTo,
    });
  }

  return {
    scanned: candidates.length,
    duplicates,
  };
}
