import Database from "better-sqlite3";
import { ensureDir } from "@/lib/images/files";
import { loadConfig, resolveFromRoot } from "@/lib/config/load";

export type Db = Database.Database;

let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const config = await loadConfig();
  const dbPath = resolveFromRoot(config.databasePath);
  await ensureDir(resolveFromRoot(config.dataDir));

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
  cachedDb = db;
  return db;
}

export function initializeSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      current_path TEXT NOT NULL,
      preview_path TEXT,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER,
      mime_type TEXT,
      caption TEXT,
      description TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'uncategorized',
      visual_style TEXT,
      vibe TEXT,
      people_json TEXT NOT NULL DEFAULT '[]',
      objects_json TEXT NOT NULL DEFAULT '[]',
      setting TEXT,
      action TEXT,
      suggested_folder TEXT,
      searchable_text TEXT,
      embedding_json TEXT,
      ai_model TEXT,
      embedding_model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      cost_estimate_usd REAL,
      duplicate_of_sha256 TEXT,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
    CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
    CREATE INDEX IF NOT EXISTS idx_images_filename ON images(original_filename);
    CREATE INDEX IF NOT EXISTS idx_images_duplicate ON images(is_duplicate);

    CREATE TABLE IF NOT EXISTS query_embedding_cache (
      id TEXT PRIMARY KEY,
      normalized_query TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      input_tokens INTEGER,
      total_tokens INTEGER,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_query_embedding_cache_lookup
      ON query_embedding_cache(normalized_query, embedding_model);
    CREATE INDEX IF NOT EXISTS idx_query_embedding_cache_last_used_at
      ON query_embedding_cache(last_used_at);

    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      source_url TEXT,
      working_dir TEXT,
      imported_json TEXT NOT NULL DEFAULT '[]',
      rejected_json TEXT NOT NULL DEFAULT '[]',
      messages_json TEXT NOT NULL DEFAULT '[]',
      summary_json TEXT,
      error TEXT,
      total INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      dismissed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_import_jobs_status_next_attempt
      ON import_jobs(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_import_jobs_updated_at
      ON import_jobs(updated_at);
  `);

  const importJobColumns = db.prepare("PRAGMA table_info(import_jobs)").all() as Array<{ name: string }>;
  if (!importJobColumns.some((column) => column.name === "dismissed_at")) {
    db.exec("ALTER TABLE import_jobs ADD COLUMN dismissed_at TEXT");
  }
}
