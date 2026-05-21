import type { ImageRecord } from "@/lib/db/images";

export type SortMode = "newest" | "relevance" | "filename";

export type SearchParams = {
  query?: string;
  category?: string;
  tag?: string;
  sort?: SortMode;
  queryEmbedding?: number[] | null;
};

export type RankedImage = ImageRecord & {
  relevance: number;
};

export type SearchFacets = {
  categories: Array<{ slug: string; count: number }>;
  tags: Array<{ slug: string; count: number }>;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "for",
  "from",
  "her",
  "his",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function keywordScore(image: ImageRecord, query: string): number {
  if (!query.trim()) {
    return 0;
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));

  if (terms.length === 0) {
    return 0;
  }

  const haystack = [
    image.original_filename,
    image.current_path,
    image.caption,
    image.description,
    image.category,
    image.visual_style,
    image.vibe,
    image.setting,
    image.action,
    image.searchable_text,
    ...image.tags,
    ...image.people,
    ...image.objects,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matches = terms.filter((term) => haystack.includes(term)).length;
  return matches / terms.length;
}

export function buildFacets(images: ImageRecord[]): SearchFacets {
  const categories = new Map<string, number>();
  const tags = new Map<string, number>();

  for (const image of images) {
    categories.set(image.category, (categories.get(image.category) ?? 0) + 1);
    for (const tag of image.tags) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }

  return {
    categories: [...categories.entries()]
      .map(([slug, count]) => ({ slug, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug)),
    tags: [...tags.entries()]
      .map(([slug, count]) => ({ slug, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
      .slice(0, 80),
  };
}

export function searchImages(images: ImageRecord[], params: SearchParams): RankedImage[] {
  const query = params.query?.trim() ?? "";
  const filtered = images.filter((image) => {
    if (params.category && image.category !== params.category) {
      return false;
    }
    if (params.tag && !image.tags.includes(params.tag)) {
      return false;
    }
    return true;
  });

  const ranked = filtered
    .map((image) => {
      const semanticScore =
        params.queryEmbedding && image.embedding
          ? cosineSimilarity(params.queryEmbedding, image.embedding)
          : 0;
      const textScore = keywordScore(image, query);
      const relevance = textScore > 0 ? textScore + semanticScore * 0.25 : semanticScore * 0.75;
      return {
        ...image,
        relevance: query ? relevance : 0,
      };
    })
    .filter((image) => {
      if (!query) {
        return true;
      }
      return image.relevance > 0 || keywordScore(image, query) > 0;
    });

  const sort = params.sort ?? (query ? "relevance" : "newest");
  return ranked.sort((a, b) => {
    if (sort === "filename") {
      return a.original_filename.localeCompare(b.original_filename);
    }
    if (sort === "relevance") {
      return b.relevance - a.relevance || b.created_at.localeCompare(a.created_at);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}
