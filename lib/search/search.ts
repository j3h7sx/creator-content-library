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

type ScoredImage = RankedImage & {
  primaryTextScore: number;
  semanticScore: number;
  textScore: number;
};

type TextScores = {
  primary: number;
  combined: number;
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

const SEMANTIC_COHORT_RATIO = 0.12;
const SEMANTIC_RELATIVE_FLOOR = 0.88;

function normalizeToken(value: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (cleaned.length > 4 && cleaned.endsWith("ies")) {
    return `${cleaned.slice(0, -3)}y`;
  }
  if (cleaned.length > 3 && cleaned.endsWith("es")) {
    return cleaned.slice(0, -2);
  }
  if (cleaned.length > 3 && cleaned.endsWith("s")) {
    return cleaned.slice(0, -1);
  }

  return cleaned;
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .map(normalizeToken)
    .filter((token) => token.length > 1);
}

function getQueryTerms(query: string): string[] {
  return tokenize(query).filter((term) => !STOP_WORDS.has(term));
}

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

function textScores(image: ImageRecord, terms: string[]): TextScores {
  if (terms.length === 0) {
    return { primary: 0, combined: 0 };
  }

  const primaryTokens = new Set(
    [
      image.current_path,
      image.caption,
      image.category,
      image.setting,
      image.action,
      ...image.tags,
      ...image.people,
      ...image.objects,
    ]
      .filter(Boolean)
      .flatMap((value) => tokenize(String(value))),
  );
  const fallbackTokens = new Set(
    [
      image.original_filename,
      image.description,
      image.visual_style,
      image.vibe,
      image.searchable_text,
    ]
      .filter(Boolean)
      .flatMap((value) => tokenize(String(value))),
  );

  const primaryMatches = terms.filter((term) => primaryTokens.has(term)).length;
  const fallbackOnlyMatches = terms.filter(
    (term) => !primaryTokens.has(term) && fallbackTokens.has(term),
  ).length;

  return {
    primary: primaryMatches / terms.length,
    combined: (primaryMatches + fallbackOnlyMatches * 0.35) / terms.length,
  };
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

function getSemanticCutoff(images: ScoredImage[], hasQueryEmbedding: boolean): number {
  if (!hasQueryEmbedding) {
    return Number.POSITIVE_INFINITY;
  }

  const scores = images
    .map((image) => image.semanticScore)
    .filter((score) => score > 0)
    .sort((a, b) => b - a);

  if (scores.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const topScore = scores[0];
  const cohortIndex = Math.min(
    scores.length - 1,
    Math.max(0, Math.ceil(scores.length * SEMANTIC_COHORT_RATIO) - 1),
  );

  return Math.max(scores[cohortIndex], topScore * SEMANTIC_RELATIVE_FLOOR);
}

export function searchImages(images: ImageRecord[], params: SearchParams): RankedImage[] {
  const query = params.query?.trim() ?? "";
  const terms = getQueryTerms(query);
  const hasQueryEmbedding = Boolean(params.queryEmbedding?.length);
  const filtered = images.filter((image) => {
    if (params.category && image.category !== params.category) {
      return false;
    }
    if (params.tag && !image.tags.includes(params.tag)) {
      return false;
    }
    return true;
  });

  const scored: ScoredImage[] = filtered.map((image) => {
    const semanticScore =
      hasQueryEmbedding && params.queryEmbedding && image.embedding
        ? cosineSimilarity(params.queryEmbedding, image.embedding)
        : 0;
    const keywordScores = textScores(image, terms);
    const textScore = keywordScores.combined;
    const relevance = textScore > 0 ? textScore + semanticScore * 0.25 : semanticScore * 0.75;
    return {
      ...image,
      relevance: query ? relevance : 0,
      primaryTextScore: keywordScores.primary,
      semanticScore,
      textScore,
    };
  });

  const semanticCutoff = getSemanticCutoff(scored, Boolean(query && hasQueryEmbedding));
  const hasPrimaryTextMatches = scored.some((image) => image.primaryTextScore > 0);
  const shouldUseExactSingleTerm = terms.length === 1 && hasPrimaryTextMatches;
  const ranked = scored.filter((image) => {
    if (!query) {
      return true;
    }

    if (shouldUseExactSingleTerm) {
      return image.primaryTextScore > 0;
    }

    if (image.textScore > 0) {
      return true;
    }

    return image.semanticScore >= semanticCutoff;
  });

  const sort = params.sort ?? (query ? "relevance" : "newest");
  return ranked
    .sort((a, b) => {
      if (sort === "filename") {
        return a.original_filename.localeCompare(b.original_filename);
      }
      if (sort === "relevance") {
        return b.relevance - a.relevance || b.created_at.localeCompare(a.created_at);
      }
      return b.created_at.localeCompare(a.created_at);
    })
    .map(
      ({
        primaryTextScore: _primaryTextScore,
        semanticScore: _semanticScore,
        textScore: _textScore,
        ...image
      }) => image,
    );
}
