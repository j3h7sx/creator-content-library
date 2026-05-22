import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { ContentLibraryConfig } from "@/lib/config/defaults";
import { resolveFromRoot, toRootRelative } from "@/lib/config/load";
import { ensureDir, fileExists, extensionToMime } from "./files";

const execFileAsync = promisify(execFile);

export type ImageInspection = {
  width: number | null;
  height: number | null;
  mimeType: string;
  sizeBytes: number | null;
};

export type PreviewResult = {
  previewPath: string | null;
  previewRelativePath: string | null;
  error: string | null;
};

export async function inspectImage(filePath: string): Promise<ImageInspection> {
  const { stat } = await import("node:fs/promises");
  const [metadata, stats] = await Promise.all([
    sharp(filePath, { failOn: "none" }).metadata(),
    stat(filePath).catch(() => null),
  ]);

  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    mimeType: metadata.format ? `image/${metadata.format}` : extensionToMime(filePath),
    sizeBytes: stats?.size ?? null,
  };
}

export async function createPreview(input: {
  sourcePath: string;
  sha256: string;
  config: ContentLibraryConfig;
}): Promise<PreviewResult> {
  const previewPath = resolveFromRoot(
    path.join(input.config.previewsDir, `${input.sha256.slice(0, 16)}.webp`),
  );

  if (await fileExists(previewPath)) {
    return {
      previewPath,
      previewRelativePath: toRootRelative(previewPath),
      error: null,
    };
  }

  try {
    await ensureDir(path.dirname(previewPath));
    await sharp(input.sourcePath, { failOn: "none" })
      .rotate()
      .resize({
        width: input.config.previewMaxSize,
        height: input.config.previewMaxSize,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toFile(previewPath);

    return {
      previewPath,
      previewRelativePath: toRootRelative(previewPath),
      error: null,
    };
  } catch (error) {
    if (isHeicPath(input.sourcePath)) {
      const fallback = await createHeicPreviewWithSips(input).catch(() => null);
      if (fallback) {
        return fallback;
      }
    }

    return {
      previewPath: null,
      previewRelativePath: null,
      error: error instanceof Error ? error.message : "Preview generation failed",
    };
  }
}

function isHeicPath(filePath: string) {
  return [".heic", ".heif"].includes(path.extname(filePath).toLowerCase());
}

async function createHeicPreviewWithSips(input: {
  sourcePath: string;
  sha256: string;
  config: ContentLibraryConfig;
}): Promise<PreviewResult> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "content-library-heic-"));
  const intermediatePath = path.join(tempDir, `${input.sha256.slice(0, 16)}.jpg`);
  const previewPath = resolveFromRoot(
    path.join(input.config.previewsDir, `${input.sha256.slice(0, 16)}.webp`),
  );

  try {
    await execFileAsync("sips", ["-s", "format", "jpeg", input.sourcePath, "--out", intermediatePath]);
    await ensureDir(path.dirname(previewPath));
    await sharp(intermediatePath, { failOn: "none" })
      .rotate()
      .resize({
        width: input.config.previewMaxSize,
        height: input.config.previewMaxSize,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toFile(previewPath);

    return {
      previewPath,
      previewRelativePath: toRootRelative(previewPath),
      error: null,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
