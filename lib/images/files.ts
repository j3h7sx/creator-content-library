import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import type { ContentLibraryConfig } from "@/lib/config/defaults";
import { appRoot, resolveFromRoot, toRootRelative } from "@/lib/config/load";

export type ImageFileCandidate = {
  absolutePath: string;
  relativePath: string;
};

const unsafeNamePattern = /[^a-z0-9._-]+/g;

export function isImagePath(filePath: string, config: ContentLibraryConfig): boolean {
  return config.imageExtensions.includes(path.extname(filePath).toLowerCase());
}

export function slugify(value: string, fallback = "image"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 72);

  return slug || fallback;
}

export function safeFileName(fileName: string): string {
  const parsed = path.parse(fileName);
  const base = parsed.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(unsafeNamePattern, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  const ext = parsed.ext.toLowerCase();
  return `${base || "image"}${ext}`;
}

export function semanticFileName(input: {
  caption: string;
  originalPath: string;
  sha256: string;
}): string {
  const originalExt = path.extname(input.originalPath).toLowerCase() || ".jpg";
  const base = slugify(input.caption || path.basename(input.originalPath, originalExt));
  return `${base}__${input.sha256.slice(0, 10)}${originalExt}`;
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function moveFile(source: string, target: string): Promise<void> {
  await ensureDir(path.dirname(target));
  await rename(source, target);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function uniqueTargetPath(targetPath: string): Promise<string> {
  if (!(await fileExists(targetPath))) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!(await fileExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Could not find a unique target path for ${targetPath}`);
}

function shouldSkipDirectory(dirPath: string, config: ContentLibraryConfig): boolean {
  const normalized = toRootRelative(dirPath);
  return [
    config.previewsDir,
    config.duplicatesDir,
    "node_modules",
    ".next",
    "_catalog/api_previews",
  ].some((skipPath) => normalized === skipPath || normalized.startsWith(`${skipPath}/`));
}

export async function walkImageFiles(
  scanRoots: string[],
  config: ContentLibraryConfig,
): Promise<ImageFileCandidate[]> {
  const candidates: ImageFileCandidate[] = [];
  const root = appRoot();

  async function walk(dirPath: string): Promise<void> {
    if (shouldSkipDirectory(dirPath, config)) {
      return;
    }

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && isImagePath(absolutePath, config)) {
        candidates.push({
          absolutePath,
          relativePath: path.relative(root, absolutePath).split(path.sep).join("/"),
        });
      }
    }
  }

  for (const scanRoot of scanRoots) {
    const absoluteRoot = resolveFromRoot(scanRoot);
    if (await fileExists(absoluteRoot)) {
      await walk(absoluteRoot);
    }
  }

  return candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function resolveContentPath(relativeOrAbsolutePath: string): string {
  const resolved = resolveFromRoot(relativeOrAbsolutePath);
  const root = appRoot();
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to access a path outside the project: ${relativeOrAbsolutePath}`);
  }
  return resolved;
}

export function extensionToMime(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}
