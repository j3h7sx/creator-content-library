import type { Db } from "./schema";

export type ImageRow = {
  id: string;
  sha256: string;
  original_filename: string;
  original_path: string;
  current_path: string;
  preview_path: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  caption: string | null;
  description: string | null;
  tags_json: string;
  category: string;
  visual_style: string | null;
  vibe: string | null;
  people_json: string;
  objects_json: string;
  setting: string | null;
  action: string | null;
  suggested_folder: string | null;
  searchable_text: string | null;
  embedding_json: string | null;
  ai_model: string | null;
  embedding_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_estimate_usd: number | null;
  duplicate_of_sha256: string | null;
  is_duplicate: number;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type ImageRecordInput = Omit<ImageRow, "tags_json" | "people_json" | "objects_json" | "embedding_json"> & {
  tags: string[];
  people: string[];
  objects: string[];
  embedding: number[] | null;
};

export type ImageRecord = Omit<ImageRow, "tags_json" | "people_json" | "objects_json" | "embedding_json"> & {
  tags: string[];
  people: string[];
  objects: string[];
  embedding: number[] | null;
};

function parseJsonArray(value: string | null): string[] {
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

function parseEmbedding(value: string | null): number[] | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number") : null;
  } catch {
    return null;
  }
}

export function rowToRecord(row: ImageRow): ImageRecord {
  const { tags_json, people_json, objects_json, embedding_json, ...rest } = row;
  return {
    ...rest,
    tags: parseJsonArray(tags_json),
    people: parseJsonArray(people_json),
    objects: parseJsonArray(objects_json),
    embedding: parseEmbedding(embedding_json),
  };
}

export function upsertImage(db: Db, input: ImageRecordInput): void {
  db.prepare(`
    INSERT INTO images (
      id, sha256, original_filename, original_path, current_path, preview_path,
      width, height, size_bytes, mime_type, caption, description, tags_json,
      category, visual_style, vibe, people_json, objects_json, setting, action,
      suggested_folder, searchable_text, embedding_json, ai_model, embedding_model,
      input_tokens, output_tokens, total_tokens, cost_estimate_usd,
      duplicate_of_sha256, is_duplicate, created_at, updated_at, processed_at
    ) VALUES (
      @id, @sha256, @original_filename, @original_path, @current_path, @preview_path,
      @width, @height, @size_bytes, @mime_type, @caption, @description, @tags_json,
      @category, @visual_style, @vibe, @people_json, @objects_json, @setting, @action,
      @suggested_folder, @searchable_text, @embedding_json, @ai_model, @embedding_model,
      @input_tokens, @output_tokens, @total_tokens, @cost_estimate_usd,
      @duplicate_of_sha256, @is_duplicate, @created_at, @updated_at, @processed_at
    )
    ON CONFLICT(sha256) DO UPDATE SET
      original_filename = excluded.original_filename,
      original_path = excluded.original_path,
      current_path = excluded.current_path,
      preview_path = excluded.preview_path,
      width = excluded.width,
      height = excluded.height,
      size_bytes = excluded.size_bytes,
      mime_type = excluded.mime_type,
      caption = excluded.caption,
      description = excluded.description,
      tags_json = excluded.tags_json,
      category = excluded.category,
      visual_style = excluded.visual_style,
      vibe = excluded.vibe,
      people_json = excluded.people_json,
      objects_json = excluded.objects_json,
      setting = excluded.setting,
      action = excluded.action,
      suggested_folder = excluded.suggested_folder,
      searchable_text = excluded.searchable_text,
      embedding_json = excluded.embedding_json,
      ai_model = excluded.ai_model,
      embedding_model = excluded.embedding_model,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      total_tokens = excluded.total_tokens,
      cost_estimate_usd = excluded.cost_estimate_usd,
      duplicate_of_sha256 = excluded.duplicate_of_sha256,
      is_duplicate = excluded.is_duplicate,
      updated_at = excluded.updated_at,
      processed_at = excluded.processed_at
  `).run({
    ...input,
    tags_json: JSON.stringify(input.tags),
    people_json: JSON.stringify(input.people),
    objects_json: JSON.stringify(input.objects),
    embedding_json: input.embedding ? JSON.stringify(input.embedding) : null,
  });
}

export function findImageBySha(db: Db, sha256: string): ImageRecord | null {
  const row = db
    .prepare("SELECT * FROM images WHERE sha256 = ?")
    .get(sha256) as ImageRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getImageById(db: Db, id: string): ImageRecord | null {
  const row = db.prepare("SELECT * FROM images WHERE id = ?").get(id) as ImageRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function getAllImages(db: Db): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM images WHERE is_duplicate = 0 ORDER BY created_at DESC")
    .all() as ImageRow[];
  return rows.map(rowToRecord);
}

export type ImageStats = {
  total: number;
  cataloged: number;
  withEmbeddings: number;
  duplicates: number;
  latestProcessedAt: string | null;
};

export function getImageStats(db: Db): ImageStats {
  return db
    .prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN processed_at IS NOT NULL AND is_duplicate = 0 THEN 1 ELSE 0 END), 0) as cataloged,
        COALESCE(SUM(CASE WHEN embedding_json IS NOT NULL AND is_duplicate = 0 THEN 1 ELSE 0 END), 0) as withEmbeddings,
        COALESCE(SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END), 0) as duplicates,
        MAX(processed_at) as latestProcessedAt
      FROM images
    `)
    .get() as ImageStats;
}
