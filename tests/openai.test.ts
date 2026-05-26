import { describe, expect, test } from "bun:test";
import {
  CatalogMetadataParseError,
  isCatalogMetadataParseError,
  parseCatalogMetadataResponse,
} from "@/lib/ai/openai";

describe("OpenAI catalog response parsing", () => {
  test("normalizes valid JSON metadata", () => {
    const metadata = parseCatalogMetadataResponse(JSON.stringify({
      caption: "  Bright kitchen shelf  ",
      tags: ["Kitchen", "  Shelf  ", ""],
      suggested_category: "interiors",
    }));

    expect(metadata.caption).toBe("Bright kitchen shelf");
    expect(metadata.tags).toEqual(["kitchen", "shelf"]);
    expect(metadata.suggestedCategory).toBe("interiors");
  });

  test("classifies empty or malformed model output as an AI parse error", () => {
    expect(() => parseCatalogMetadataResponse("")).toThrow(CatalogMetadataParseError);

    try {
      parseCatalogMetadataResponse("{");
    } catch (error) {
      expect(isCatalogMetadataParseError(error)).toBe(true);
      return;
    }

    throw new Error("Expected malformed JSON to throw.");
  });
});
