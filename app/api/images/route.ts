import { NextResponse } from "next/server";
import { createAiProvider } from "@/lib/ai/provider";
import { loadConfig } from "@/lib/config/load";
import { getAllImages, getImageStats } from "@/lib/db/images";
import { getDb } from "@/lib/db/schema";
import { buildFacets, searchImages, type SortMode } from "@/lib/search/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const tag = url.searchParams.get("tag") ?? "";
  const sort = (url.searchParams.get("sort") ?? "newest") as SortMode;
  const limit = Number(url.searchParams.get("limit") ?? "120");

  const [db, config] = await Promise.all([getDb(), loadConfig()]);
  const allImages = getAllImages(db);
  const provider = createAiProvider(config);
  const shouldEmbedQuery =
    Boolean(query.trim()) &&
    provider.enabled &&
    allImages.some((image) => image.embedding && image.embedding.length > 0);
  const queryEmbedding = shouldEmbedQuery ? (await provider.embedText(query)).embedding : null;
  const images = searchImages(allImages, {
    query,
    category: category || undefined,
    tag: tag || undefined,
    sort,
    queryEmbedding,
  }).slice(0, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 120);

  return NextResponse.json({
    images,
    facets: buildFacets(allImages),
    stats: getImageStats(db),
    ai: {
      provider: provider.name,
      semanticSearch: shouldEmbedQuery,
      catalogModel: config.ai.catalogModel,
      embeddingModel: config.ai.embeddingModel,
    },
  });
}
