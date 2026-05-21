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
  `);
}
