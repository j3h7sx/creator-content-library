import type { ContentLibraryConfig } from "@/lib/config/defaults";
import type { CatalogAiProvider } from "./types";
import { createManualProvider } from "./manual";
import { createOpenAiProvider } from "./openai";

export function createAiProvider(config: ContentLibraryConfig, forceManual = false): CatalogAiProvider {
  if (forceManual || !config.ai.enabled || !process.env.OPENAI_API_KEY) {
    return createManualProvider();
  }

  return createOpenAiProvider(config);
}
