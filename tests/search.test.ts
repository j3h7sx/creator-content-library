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
        image({ id: "1", caption: "Salad with avocado and egg", tags: ["food", "avocado"], created_at: "2026-01-01T00:00:00.000Z" }),
        image({ id: "2", caption: "Person holding coffee in bed", tags: ["coffee"], created_at: "2026-02-01T00:00:00.000Z" }),
      ],
      { query: "avocado egg", sort: "relevance" },
    );

    expect(results[0]?.id).toBe("1");
  });

  test("relevance ranking prioritizes keyword matches over newer unrelated images", () => {
    const results = searchImages(
      [
        image({
          id: "older-match",
          caption: "Healthy salad bowl with avocado and boiled eggs",
          tags: ["salad", "avocado", "eggs"],
          created_at: "2026-01-01T00:00:00.000Z",
        }),
        image({
          id: "newer-unrelated",
          caption: "Dim shower scene with water droplets and warm candlelight",
          tags: ["shower", "self-care"],
          created_at: "2026-05-01T00:00:00.000Z",
        }),
      ],
      { query: "salad with avocado and egg", sort: "relevance" },
    );

    expect(results[0]?.id).toBe("older-match");
  });

  test("keyword search uses whole tokens so tea does not match steamed", () => {
    const results = searchImages(
      [
        image({
          id: "tea",
          caption: "Cup of green tea on a bedside table",
          tags: ["tea", "drink"],
        }),
        image({
          id: "steamed",
          caption: "Plate with scrambled eggs and steamed broccoli",
          tags: ["breakfast", "steamed broccoli"],
        }),
      ],
      { query: "tea", sort: "relevance" },
    );

    expect(results.map((result) => result.id)).toEqual(["tea"]);
  });

  test("semantic search filters to the closest cohort instead of returning every positive match", () => {
    const results = searchImages(
      [
        image({
          id: "closest",
          caption: "Quiet ocean shoreline at sunset",
          embedding: [1, 0],
        }),
        image({
          id: "nearby",
          caption: "Beach boardwalk and water",
          embedding: [0.94, 0.06],
        }),
        image({
          id: "unrelated",
          caption: "Desk setup with notebooks",
          embedding: [0.2, 0.98],
        }),
      ],
      { query: "calm sea mood", queryEmbedding: [1, 0], sort: "relevance" },
    );

    expect(results.map((result) => result.id)).toEqual(["closest"]);
  });

  test("keyword matches remain visible even when semantic score is below the cutoff", () => {
    const results = searchImages(
      [
        image({
          id: "semantic-match",
          caption: "Quiet ocean shoreline at sunset",
          embedding: [1, 0],
        }),
        image({
          id: "keyword-match",
          caption: "Ocean note on a desk",
          embedding: [0, 1],
        }),
      ],
      { query: "ocean", queryEmbedding: [1, 0], sort: "relevance" },
    );

    expect(results.map((result) => result.id)).toContain("keyword-match");
  });

  test("single-word searches prefer exact keyword results over semantic-only matches", () => {
    const results = searchImages(
      [
        image({
          id: "tea",
          caption: "Cup of green tea on a bedside table",
          tags: ["tea", "drink"],
          embedding: [0.8, 0.2],
        }),
        image({
          id: "semantic-only-breakfast",
          caption: "Plate with scrambled eggs and steamed broccoli",
          tags: ["breakfast", "steamed broccoli"],
          embedding: [1, 0],
        }),
      ],
      { query: "tea", queryEmbedding: [1, 0], sort: "relevance" },
    );

    expect(results.map((result) => result.id)).toEqual(["tea"]);
  });

  test("single-word searches do not surface noisy raw filenames when primary fields match", () => {
    const results = searchImages(
      [
        image({
          id: "ocean-photo",
          caption: "Woman standing beside the ocean",
          tags: ["ocean", "beach"],
          original_filename: "downloaded-image.jpg",
        }),
        image({
          id: "noisy-filename",
          caption: "Person crouching to open small fridge in cozy kitchen",
          tags: ["kitchen", "fridge"],
          original_filename: "pinterest #ocean #vacation #inspo.jpg",
        }),
      ],
      { query: "ocean", sort: "relevance" },
    );

    expect(results.map((result) => result.id)).toEqual(["ocean-photo"]);
  });

  test("raw filename search still works when no primary field matches", () => {
    const results = searchImages(
      [
        image({
          id: "filename-match",
          caption: "Person crouching to open small fridge in cozy kitchen",
          tags: ["kitchen", "fridge"],
          original_filename: "pinterest #mallorca #vacation.jpg",
        }),
      ],
      { query: "mallorca", sort: "relevance" },
    );

    expect(results.map((result) => result.id)).toEqual(["filename-match"]);
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
