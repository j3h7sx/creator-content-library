import path from "node:path";
import { basename } from "node:path";
import { getDb } from "@/lib/db/schema";
import { findImageBySha, upsertImage } from "@/lib/db/images";
import { createAiProvider } from "@/lib/ai/provider";
import { createManualProvider } from "@/lib/ai/manual";
import { loadConfig, resolveFromRoot, toRootRelative } from "@/lib/config/load";
import {
  ensureDir,
  hashFile,
  moveFile,
  semanticFileName,
  uniqueTargetPath,
  walkImageFiles,
} from "@/lib/images/files";
import { createPreview, inspectImage } from "@/lib/images/process";
import { normalizeCategorySlug } from "./category";

export type CatalogOptions = {
  move?: boolean;
  scan?: string[];
  limit?: number;
  force?: boolean;
  manual?: boolean;
  includeExisting?: boolean;
  onProgress?: (message: string) => void;
};

export type CatalogSummary = {
  scanned: number;
  cataloged: number;
  skippedExisting: number;
  duplicates: number;
  previewErrors: number;
  aiErrors: number;
  aiProvider: "openai" | "manual";
};

function nowIso(): string {
  return new Date().toISOString();
}

function isUnsupportedImageInputError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const apiError = error as Error & { status?: number; code?: string };
  return (
    apiError.status === 400 &&
    apiError.code === "invalid_value" &&
    /valid image|supported image formats|image data/i.test(error.message)
  );
}

async function moveDuplicate(input: {
  sourcePath: string;
  duplicateOfSha: string;
  configDuplicatesDir: string;
}): Promise<string> {
  const parsed = path.parse(input.sourcePath);
  const target = await uniqueTargetPath(
    resolveFromRoot(
      path.join(
        input.configDuplicatesDir,
        `${parsed.name}__duplicate-of-${input.duplicateOfSha.slice(0, 10)}${parsed.ext.toLowerCase()}`,
      ),
    ),
  );
  await moveFile(input.sourcePath, target);
  return toRootRelative(target);
}

export async function catalogImages(options: CatalogOptions = {}): Promise<CatalogSummary> {
  const config = await loadConfig();
  const scanRoots = options.scan?.length
    ? options.scan
    : options.includeExisting
      ? [config.inboxDir, config.originalsDir]
      : [config.inboxDir];
  const db = await getDb();
  const provider = createAiProvider(config, options.manual);
  const manualProvider = createManualProvider();
  const candidates = await walkImageFiles(scanRoots, config);
  const limitedCandidates = options.limit ? candidates.slice(0, options.limit) : candidates;

  await Promise.all([
    ensureDir(resolveFromRoot(config.inboxDir)),
    ensureDir(resolveFromRoot(config.originalsDir)),
    ensureDir(resolveFromRoot(config.previewsDir)),
    ensureDir(resolveFromRoot(config.duplicatesDir)),
  ]);

  const summary: CatalogSummary = {
    scanned: limitedCandidates.length,
    cataloged: 0,
    skippedExisting: 0,
    duplicates: 0,
    previewErrors: 0,
    aiErrors: 0,
    aiProvider: provider.name,
  };

  for (const candidate of limitedCandidates) {
    const digest = await hashFile(candidate.absolutePath);
    const existing = findImageBySha(db, digest);

    if (existing && !options.force) {
      summary.skippedExisting += 1;
      const samePath = existing.current_path === candidate.relativePath;
      if (!samePath && options.move) {
        summary.duplicates += 1;
        await moveDuplicate({
          sourcePath: candidate.absolutePath,
          duplicateOfSha: digest,
          configDuplicatesDir: config.duplicatesDir,
        });
      }
      options.onProgress?.(`skip ${candidate.relativePath}`);
      continue;
    }

    const inspection = await inspectImage(candidate.absolutePath).catch(() => ({
      width: null,
      height: null,
      mimeType: "application/octet-stream",
      sizeBytes: null,
    }));
    const preview = await createPreview({
      sourcePath: candidate.absolutePath,
      sha256: digest,
      config,
    });

    if (preview.error) {
      summary.previewErrors += 1;
    }

    const catalogInputPath = preview.previewPath ?? candidate.absolutePath;
    const catalogInput = {
      imagePath: catalogInputPath,
      originalPath: candidate.relativePath,
      originalFileName: basename(candidate.absolutePath),
      taxonomy: config.taxonomy,
    };
    const catalog = await provider.catalogImage(catalogInput).catch(async (error: unknown) => {
      if (!isUnsupportedImageInputError(error)) {
        throw error;
      }

      summary.aiErrors += 1;
      options.onProgress?.(`ai skipped unsupported image ${candidate.relativePath}`);
      return manualProvider.catalogImage(catalogInput);
    });

    const category = normalizeCategorySlug(
      catalog.metadata.suggestedCategory || catalog.metadata.suggestedFolder,
      config.taxonomy,
    );
    const semanticName = semanticFileName({
      caption: catalog.metadata.caption,
      originalPath: candidate.absolutePath,
      sha256: digest,
    });
    let currentAbsolutePath = candidate.absolutePath;

    if (options.move) {
      const target = await uniqueTargetPath(
        resolveFromRoot(path.join(config.originalsDir, category, semanticName)),
      );
      await moveFile(candidate.absolutePath, target);
      currentAbsolutePath = target;
    }

    const embedding = await provider.embedText(catalog.metadata.searchableText);
    const timestamp = nowIso();

    upsertImage(db, {
      id: digest.slice(0, 16),
      sha256: digest,
      original_filename: basename(candidate.absolutePath),
      original_path: candidate.relativePath,
      current_path: toRootRelative(currentAbsolutePath),
      preview_path: preview.previewRelativePath,
      width: inspection.width,
      height: inspection.height,
      size_bytes: inspection.sizeBytes,
      mime_type: inspection.mimeType,
      caption: catalog.metadata.caption,
      description: catalog.metadata.description,
      tags: catalog.metadata.tags,
      category,
      visual_style: catalog.metadata.visualStyle,
      vibe: catalog.metadata.vibe,
      people: catalog.metadata.people,
      objects: catalog.metadata.objects,
      setting: catalog.metadata.setting,
      action: catalog.metadata.action,
      suggested_folder: catalog.metadata.suggestedFolder,
      searchable_text: catalog.metadata.searchableText,
      embedding: embedding.embedding,
      ai_model: catalog.model,
      embedding_model: embedding.model,
      input_tokens:
        (catalog.usage.inputTokens ?? 0) + (embedding.usage.inputTokens ?? 0) || null,
      output_tokens:
        (catalog.usage.outputTokens ?? 0) + (embedding.usage.outputTokens ?? 0) || null,
      total_tokens:
        (catalog.usage.totalTokens ?? 0) + (embedding.usage.totalTokens ?? 0) || null,
      cost_estimate_usd: null,
      duplicate_of_sha256: null,
      is_duplicate: 0,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
      processed_at: timestamp,
    });

    summary.cataloged += 1;
    options.onProgress?.(`cataloged ${semanticName}`);
  }

  return summary;
}
