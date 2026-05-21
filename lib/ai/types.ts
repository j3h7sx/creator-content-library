import type { TaxonomyCategory } from "@/lib/config/defaults";

export type CatalogMetadata = {
  caption: string;
  description: string;
  tags: string[];
  visualStyle: string;
  vibe: string;
  people: string[];
  objects: string[];
  setting: string;
  action: string;
  suggestedCategory: string;
  suggestedFolder: string;
  searchableText: string;
};

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costEstimateUsd: number | null;
};

export type CatalogResult = {
  metadata: CatalogMetadata;
  model: string | null;
  usage: AiUsage;
};

export type CatalogImageInput = {
  imagePath: string;
  originalPath: string;
  originalFileName: string;
  taxonomy: TaxonomyCategory[];
};

export type CatalogAiProvider = {
  name: "openai" | "manual";
  enabled: boolean;
  catalogImage(input: CatalogImageInput): Promise<CatalogResult>;
  embedText(text: string): Promise<{
    embedding: number[] | null;
    model: string | null;
    usage: AiUsage;
  }>;
};

export const ZERO_USAGE: AiUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  costEstimateUsd: null,
};
