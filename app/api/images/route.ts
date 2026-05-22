import { NextResponse } from "next/server";
import { createAiProvider } from "@/lib/ai/provider";
import { loadConfig } from "@/lib/config/load";
import { getAllImages, getImageStats, type ImageRecord, type ImageStats } from "@/lib/db/images";
import { getCachedQueryEmbedding, saveQueryEmbedding } from "@/lib/db/query-embeddings";
import { getDb, type Db } from "@/lib/db/schema";
import { ensureImportWorkerStarted } from "@/lib/import/jobs";
import {
  buildFacets,
  canUseKeywordOnlySearch,
  searchImages,
  type SearchFacets,
  type SortMode,
} from "@/lib/search/search";

export const runtime = "nodejs";

function stripPrivateSearchFields<T extends { embedding?: unknown }>(image: T): Omit<T, "embedding"> {
  const { embedding: _embedding, ...publicImage } = image;
  return publicImage;
}

type LibrarySnapshot = {
  key: string;
  images: ImageRecord[];
  facets: SearchFacets;
  stats: ImageStats;
};

let cachedLibrarySnapshot: LibrarySnapshot | null = null;

function snapshotKey(stats: ImageStats): string {
  return [
    stats.total,
    stats.cataloged,
    stats.withEmbeddings,
    stats.duplicates,
    stats.latestProcessedAt ?? "",
    stats.latestUpdatedAt ?? "",
  ].join(":");
}

function getLibrarySnapshot(db: Db): LibrarySnapshot {
  const stats = getImageStats(db);
  const key = snapshotKey(stats);

  if (cachedLibrarySnapshot?.key === key) {
    return cachedLibrarySnapshot;
  }

  const images = getAllImages(db);
  cachedLibrarySnapshot = {
    key,
    images,
    facets: buildFacets(images),
    stats,
  };

  return cachedLibrarySnapshot;
}

export async function GET(request: Request) {
  void ensureImportWorkerStarted();

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const tags = [...new Set(url.searchParams.getAll("tag").filter(Boolean))];
  const requestedSort = url.searchParams.get("sort") as SortMode | null;
  const sort = requestedSort ?? (query.trim() ? "relevance" : "newest");
  const limit = Number(url.searchParams.get("limit") ?? "120");

  const [db, config] = await Promise.all([getDb(), loadConfig()]);
  const snapshot = getLibrarySnapshot(db);
  const allImages = snapshot.images;
  const provider = createAiProvider(config);
  const categoryFilter = category || undefined;
  const tagFilters = tags.length > 0 ? tags : undefined;
  const canUseLocalKeywordOnly = canUseKeywordOnlySearch(allImages, {
    query,
    category: categoryFilter,
    tags: tagFilters,
  });
  const shouldEmbedQuery =
    Boolean(query.trim()) &&
    provider.enabled &&
    !canUseLocalKeywordOnly &&
    allImages.some((image) => image.embedding && image.embedding.length > 0);
  const cachedQueryEmbedding = shouldEmbedQuery
    ? getCachedQueryEmbedding(db, query, config.ai.embeddingModel)
    : null;
  let queryEmbedding: number[] | null = cachedQueryEmbedding?.embedding ?? null;
  if (shouldEmbedQuery && !queryEmbedding) {
    const generatedEmbedding = await provider.embedText(query);
    queryEmbedding = generatedEmbedding.embedding;

    if (generatedEmbedding.embedding) {
      saveQueryEmbedding(
        db,
        query,
        generatedEmbedding.model ?? config.ai.embeddingModel,
        generatedEmbedding.embedding,
        {
          inputTokens: generatedEmbedding.usage.inputTokens,
          totalTokens: generatedEmbedding.usage.totalTokens,
        },
      );
    }
  }
  const images = searchImages(allImages, {
    query,
    category: categoryFilter,
    tags: tagFilters,
    sort,
    queryEmbedding,
  })
    .slice(0, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 120)
    .map(stripPrivateSearchFields);

  return NextResponse.json({
    images,
    facets: snapshot.facets,
    stats: snapshot.stats,
    ai: {
      provider: provider.name,
      semanticSearch: Boolean(queryEmbedding),
      catalogModel: config.ai.catalogModel,
      embeddingModel: config.ai.embeddingModel,
    },
  });
}
