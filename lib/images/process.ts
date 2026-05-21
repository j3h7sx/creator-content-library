import path from "node:path";
import sharp from "sharp";
import type { ContentLibraryConfig } from "@/lib/config/defaults";
import { resolveFromRoot, toRootRelative } from "@/lib/config/load";
import { ensureDir, fileExists, extensionToMime } from "./files";

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
    return {
      previewPath: null,
      previewRelativePath: null,
      error: error instanceof Error ? error.message : "Preview generation failed",
    };
  }
}
