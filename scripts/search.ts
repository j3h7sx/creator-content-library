#!/usr/bin/env tsx
import { Command } from "commander";
import { createAiProvider } from "@/lib/ai/provider";
import { loadProjectEnv } from "@/lib/config/env";
import { loadConfig } from "@/lib/config/load";
import { getAllImages } from "@/lib/db/images";
import { getDb } from "@/lib/db/schema";
import { searchImages, type SortMode } from "@/lib/search/search";

process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG = "1";
loadProjectEnv();

const program = new Command();

program
  .name("search")
  .argument("[query...]", "search query")
  .option("--category <slug>", "filter by category")
  .option("--tag <tag>", "filter by tag")
  .option("--sort <mode>", "newest, relevance, or filename", "relevance")
  .option("--limit <count>", "number of results to print", "20")
  .option("--manual", "disable query embeddings even if OpenAI is configured")
  .description("Search the local image catalog.")
  .parse(process.argv);

const options = program.opts<{
  category?: string;
  tag?: string;
  sort: SortMode;
  limit: string;
  manual?: boolean;
}>();
const query = program.args.join(" ").trim();
const [db, config] = await Promise.all([getDb(), loadConfig()]);
const images = getAllImages(db);
const provider = createAiProvider(config, Boolean(options.manual));
const queryEmbedding =
  query && provider.enabled && images.some((image) => image.embedding)
    ? (await provider.embedText(query)).embedding
    : null;
const results = searchImages(images, {
  query,
  category: options.category,
  tag: options.tag,
  sort: options.sort,
  queryEmbedding,
}).slice(0, Number(options.limit));

if (results.length === 0) {
  console.log("No images matched.");
  process.exit(0);
}

for (const [index, image] of results.entries()) {
  console.log(`${index + 1}. ${image.caption ?? image.original_filename}`);
  console.log(`   ${image.current_path}`);
  console.log(`   category=${image.category} tags=${image.tags.slice(0, 8).join(", ")}`);
  if (query) {
    console.log(`   relevance=${image.relevance.toFixed(3)}`);
  }
}
