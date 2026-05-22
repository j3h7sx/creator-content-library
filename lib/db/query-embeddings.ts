import { createHash } from "node:crypto";
import type { Db } from "./schema";

type QueryEmbeddingCacheRow = {
  id: string;
  normalized_query: string;
  embedding_model: string;
  embedding_json: string;
  input_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
  last_used_at: string;
};

export type CachedQueryEmbedding = {
  id: string;
  normalizedQuery: string;
  embeddingModel: string;
  embedding: number[];
  inputTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
  lastUsedAt: string;
};

export type QueryEmbeddingUsage = {
  inputTokens?: number | null;
  totalTokens?: number | null;
};

export function normalizeQueryForCache(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheId(normalizedQuery: string, embeddingModel: string): string {
  return createHash("sha256").update(`${embeddingModel}\n${normalizedQuery}`).digest("hex");
}

function parseEmbedding(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number") : [];
  } catch {
    return [];
  }
}

function rowToCachedEmbedding(row: QueryEmbeddingCacheRow): CachedQueryEmbedding | null {
  const embedding = parseEmbedding(row.embedding_json);
  if (embedding.length === 0) {
    return null;
  }

  return {
    id: row.id,
    normalizedQuery: row.normalized_query,
    embeddingModel: row.embedding_model,
    embedding,
    inputTokens: row.input_tokens,
    totalTokens: row.total_tokens,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function getCachedQueryEmbedding(
  db: Db,
  query: string,
  embeddingModel: string,
): CachedQueryEmbedding | null {
  const normalizedQuery = normalizeQueryForCache(query);
  if (!normalizedQuery) {
    return null;
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM query_embedding_cache
        WHERE normalized_query = ? AND embedding_model = ?
      `,
    )
    .get(normalizedQuery, embeddingModel) as QueryEmbeddingCacheRow | undefined;

  if (!row) {
    return null;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE query_embedding_cache SET last_used_at = ? WHERE id = ?").run(now, row.id);

  return rowToCachedEmbedding({ ...row, last_used_at: now });
}

export function saveQueryEmbedding(
  db: Db,
  query: string,
  embeddingModel: string,
  embedding: number[],
  usage: QueryEmbeddingUsage = {},
): CachedQueryEmbedding | null {
  const normalizedQuery = normalizeQueryForCache(query);
  if (!normalizedQuery || embedding.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const id = cacheId(normalizedQuery, embeddingModel);

  db.prepare(
    `
      INSERT INTO query_embedding_cache (
        id, normalized_query, embedding_model, embedding_json,
        input_tokens, total_tokens, created_at, last_used_at
      ) VALUES (
        @id, @normalized_query, @embedding_model, @embedding_json,
        @input_tokens, @total_tokens, @created_at, @last_used_at
      )
      ON CONFLICT(normalized_query, embedding_model) DO UPDATE SET
        embedding_json = excluded.embedding_json,
        input_tokens = excluded.input_tokens,
        total_tokens = excluded.total_tokens,
        last_used_at = excluded.last_used_at
    `,
  ).run({
    id,
    normalized_query: normalizedQuery,
    embedding_model: embeddingModel,
    embedding_json: JSON.stringify(embedding),
    input_tokens: usage.inputTokens ?? null,
    total_tokens: usage.totalTokens ?? null,
    created_at: now,
    last_used_at: now,
  });

  return getCachedQueryEmbedding(db, query, embeddingModel);
}
