import { describe, expect, test } from "bun:test";
import type { ImageRecord } from "@/lib/db/images";
import { buildFacets, searchImages } from "@/lib/search/search";

function image(overrides: Partial<ImageRecord>): ImageRecord {
  return {
    id: "id",
    sha256: "sha",
    original_filename: "image.jpg",
    original_path: "library/00_inbox/image.jpg",
    current_path: "library/originals/uncategorized/image.jpg",
    preview_path: null,
    width: null,
    height: null,
    size_bytes: null,
    mime_type: "image/jpeg",
    caption: null,
    description: null,
    tags: [],
    category: "uncategorized",
    visual_style: null,
    vibe: null,
    people: [],
    objects: [],
    setting: null,
    action: null,
    suggested_folder: null,
    searchable_text: null,
    embedding: null,
    ai_model: null,
    embedding_model: null,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    cost_estimate_usd: null,
    duplicate_of_sha256: null,
    is_duplicate: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    processed_at: null,
    ...overrides,
  };
}

describe("search", () => {
  test("keyword search matches caption and tags", () => {
    const results = searchImages(
      [
        image({ id: "1", caption: "Salad with avocado and egg", tags: ["food", "avocado"] }),
        image({ id: "2", caption: "Person holding coffee in bed", tags: ["coffee"] }),
      ],
      { query: "avocado egg", sort: "relevance" },
    );

    expect(results[0]?.id).toBe("1");
  });

  test("facets hide empty filters by only counting present records", () => {
    const facets = buildFacets([
      image({ category: "food_drink", tags: ["salad", "egg"] }),
      image({ category: "food_drink", tags: ["salad"] }),
    ]);

    expect(facets.categories).toEqual([{ slug: "food_drink", count: 2 }]);
    expect(facets.tags[0]).toEqual({ slug: "salad", count: 2 });
  });
});
