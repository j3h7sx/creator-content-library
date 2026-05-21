import path from "node:path";
import { slugify } from "@/lib/images/files";
import type { CatalogAiProvider, CatalogImageInput, CatalogResult } from "./types";
import { ZERO_USAGE } from "./types";

function wordsFromPath(filePath: string): string[] {
  return slugify(filePath)
    .split("-")
    .filter((word) => word.length > 2 && !/^[0-9a-f]{6,}$/.test(word))
    .slice(0, 14);
}

function categoryFromPath(input: CatalogImageInput): string {
  const haystack = `${input.originalPath} ${input.originalFileName}`.toLowerCase();
  const match = input.taxonomy.find((category) => haystack.includes(category.slug));
  return match?.slug ?? "uncategorized";
}

export function createManualProvider(): CatalogAiProvider {
  return {
    name: "manual",
    enabled: false,
    async catalogImage(input: CatalogImageInput): Promise<CatalogResult> {
      const baseName = path.basename(input.originalFileName, path.extname(input.originalFileName));
      const words = wordsFromPath(baseName);
      const caption = words.length > 0 ? words.join(" ") : "Unlabeled image";
      const category = categoryFromPath(input);

      return {
        metadata: {
          caption,
          description:
            "Cataloged without AI. Add OPENAI_API_KEY and rerun cataloging for richer captions, tags, and semantic search.",
          tags: words.slice(0, 8),
          visualStyle: "",
          vibe: "",
          people: [],
          objects: words.slice(0, 6),
          setting: "",
          action: "",
          suggestedCategory: category,
          suggestedFolder: category,
          searchableText: [caption, category, ...words].join(" "),
        },
        model: null,
        usage: ZERO_USAGE,
      };
    },
    async embedText() {
      return {
        embedding: null,
        model: null,
        usage: ZERO_USAGE,
      };
    },
  };
}
