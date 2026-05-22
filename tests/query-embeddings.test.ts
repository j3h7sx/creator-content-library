import { describe, expect, test } from "bun:test";
import {
  getCachedQueryEmbedding,
  normalizeQueryForCache,
  saveQueryEmbedding,
} from "@/lib/db/query-embeddings";
import type { Db } from "@/lib/db/schema";

type CacheRow = {
  id: string;
  normalized_query: string;
  embedding_model: string;
  embedding_json: string;
  input_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
  last_used_at: string;
};

class FakeQueryEmbeddingDb {
  rows = new Map<string, CacheRow>();

  prepare(sql: string) {
    if (sql.includes("SELECT *") && sql.includes("FROM query_embedding_cache")) {
      return {
        get: (normalizedQuery: string, embeddingModel: string) =>
          [...this.rows.values()].find(
            (row) =>
              row.normalized_query === normalizedQuery &&
              row.embedding_model === embeddingModel,
          ),
      };
    }

    if (sql.includes("UPDATE query_embedding_cache SET last_used_at")) {
      return {
        run: (lastUsedAt: string, id: string) => {
          const row = this.rows.get(id);
          if (row) {
            row.last_used_at = lastUsedAt;
          }
        },
      };
    }

    if (sql.includes("INSERT INTO query_embedding_cache")) {
      return {
        run: (row: CacheRow) => {
          this.rows.set(row.id, { ...row });
        },
      };
    }

    throw new Error(`Unexpected SQL in fake query embedding DB: ${sql}`);
  }
}

describe("query embedding cache", () => {
  test("normalizes query text before lookup", () => {
    expect(normalizeQueryForCache("  Tea   Cup  ")).toBe("tea cup");
  });

  test("reuses cached embeddings for normalized query and model", () => {
    const db = new FakeQueryEmbeddingDb() as unknown as Db;

    saveQueryEmbedding(db, "  Tea   Cup  ", "text-embedding-3-small", [0.1, 0.2], {
      inputTokens: 2,
      totalTokens: 2,
    });

    const cached = getCachedQueryEmbedding(db, "tea cup", "text-embedding-3-small");
    const missingForOtherModel = getCachedQueryEmbedding(db, "tea cup", "other-model");

    expect(cached?.embedding).toEqual([0.1, 0.2]);
    expect(cached?.inputTokens).toBe(2);
    expect(missingForOtherModel).toBeNull();
  });
});
