import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { ContentLibraryConfig } from "@/lib/config/defaults";
import { extensionToMime } from "@/lib/images/files";
import type {
  CatalogAiProvider,
  CatalogImageInput,
  CatalogMetadata,
  CatalogResult,
} from "./types";
import { ZERO_USAGE } from "./types";

type ResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

export class CatalogMetadataParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CatalogMetadataParseError";
  }
}

export function isCatalogMetadataParseError(error: unknown): error is CatalogMetadataParseError {
  return error instanceof CatalogMetadataParseError;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 18);
}

function normalizeMetadata(value: unknown): CatalogMetadata {
  const source = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    caption: typeof source.caption === "string" ? source.caption.trim().slice(0, 160) : "Untitled image",
    description:
      typeof source.description === "string" ? source.description.trim().slice(0, 1200) : "",
    tags: cleanStringArray(source.tags),
    visualStyle:
      typeof source.visual_style === "string"
        ? source.visual_style.trim()
        : typeof source.visualStyle === "string"
          ? source.visualStyle.trim()
          : "",
    vibe: typeof source.vibe === "string" ? source.vibe.trim() : "",
    people: cleanStringArray(source.people),
    objects: cleanStringArray(source.objects),
    setting: typeof source.setting === "string" ? source.setting.trim() : "",
    action: typeof source.action === "string" ? source.action.trim() : "",
    suggestedCategory:
      typeof source.suggested_category === "string"
        ? source.suggested_category.trim()
        : typeof source.suggestedCategory === "string"
          ? source.suggestedCategory.trim()
          : "uncategorized",
    suggestedFolder:
      typeof source.suggested_folder === "string"
        ? source.suggested_folder.trim()
        : typeof source.suggestedFolder === "string"
          ? source.suggestedFolder.trim()
          : "uncategorized",
    searchableText:
      typeof source.searchable_text === "string"
        ? source.searchable_text.trim()
        : typeof source.searchableText === "string"
          ? source.searchableText.trim()
          : "",
  };
}

export function parseCatalogMetadataResponse(outputText: string | null | undefined): CatalogMetadata {
  const trimmed = outputText?.trim();
  if (!trimmed) {
    throw new CatalogMetadataParseError("AI catalog response was empty.");
  }

  try {
    return normalizeMetadata(JSON.parse(trimmed) as unknown);
  } catch (error) {
    throw new CatalogMetadataParseError("AI catalog response was not valid JSON.", {
      cause: error,
    });
  }
}

function usageFromResponse(usage: ResponseUsage | undefined) {
  return {
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    costEstimateUsd: null,
  };
}

async function imageDataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const mime = extensionToMime(filePath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function taxonomyPrompt(input: CatalogImageInput): string {
  const categories = input.taxonomy
    .map((category) => `- ${category.slug}: ${category.description}`)
    .join("\n");

  return `You catalog visual inspiration images for creators building social media carousels, Figma/Canva moodboards, TikTok/Instagram concepts, app marketing references, and workshop projects.

Return compact JSON only. Be concrete and visual. Avoid guessing identity, medical diagnosis, age, or sensitive traits. Use neutral descriptors for people.

Choose exactly one suggested_category from this taxonomy:
${categories}

Image filename: ${path.basename(input.originalFileName)}

JSON fields:
caption: concise natural caption under 14 words
description: detailed visual description useful for search
tags: 6-14 short lowercase tags
visual_style: visual style or format
vibe: mood or vibe
people: visible people descriptors, empty if none
objects: important visible objects
setting: location/environment
action: visible action
suggested_category: one taxonomy slug
suggested_folder: stable folder slug, normally same as category
searchable_text: rich keyword text for semantic and keyword search`;
}

export function createOpenAiProvider(config: ContentLibraryConfig): CatalogAiProvider {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });

  return {
    name: "openai",
    enabled: true,
    async catalogImage(input: CatalogImageInput): Promise<CatalogResult> {
      const imageUrl = await imageDataUrl(input.imagePath);
      const response = await client.responses.create({
        model: config.ai.catalogModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: taxonomyPrompt(input),
              },
              {
                type: "input_image",
                image_url: imageUrl,
                detail: "low",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_object",
          },
        },
      });

      const responseWithOutput = response as typeof response & {
        output_text?: string;
        usage?: ResponseUsage;
      };
      const metadata = parseCatalogMetadataResponse(responseWithOutput.output_text);
      const searchableText =
        metadata.searchableText ||
        [
          metadata.caption,
          metadata.description,
          metadata.tags.join(" "),
          metadata.visualStyle,
          metadata.vibe,
          metadata.people.join(" "),
          metadata.objects.join(" "),
          metadata.setting,
          metadata.action,
        ]
          .filter(Boolean)
          .join(" ");

      return {
        metadata: {
          ...metadata,
          searchableText,
        },
        model: config.ai.catalogModel,
        usage: usageFromResponse(responseWithOutput.usage),
      };
    },
    async embedText(text: string) {
      if (!text.trim()) {
        return {
          embedding: null,
          model: config.ai.embeddingModel,
          usage: ZERO_USAGE,
        };
      }

      const response = await client.embeddings.create({
        model: config.ai.embeddingModel,
        input: text,
      });
      const usage = response.usage as { prompt_tokens?: number; total_tokens?: number } | undefined;

      return {
        embedding: response.data[0]?.embedding ?? null,
        model: config.ai.embeddingModel,
        usage: {
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: null,
          totalTokens: usage?.total_tokens ?? null,
          costEstimateUsd: null,
        },
      };
    },
  };
}
