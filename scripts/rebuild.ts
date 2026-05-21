#!/usr/bin/env tsx
import { Command } from "commander";
import { catalogImages } from "@/lib/catalog/catalog";

process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG = "1";

const program = new Command();

program
  .name("rebuild")
  .description("Non-destructively rebuild missing catalog records by scanning inbox and originals.")
  .option("--move", "move inbox files into categorized originals while rebuilding")
  .option("--limit <count>", "limit the number of files processed")
  .option("--force", "recatalog files that already exist in the database")
  .option("--manual", "disable OpenAI even if OPENAI_API_KEY exists")
  .parse(process.argv);

const options = program.opts<{
  move?: boolean;
  limit?: string;
  force?: boolean;
  manual?: boolean;
}>();

const summary = await catalogImages({
  move: Boolean(options.move),
  includeExisting: true,
  limit: options.limit ? Number(options.limit) : undefined,
  force: Boolean(options.force),
  manual: Boolean(options.manual),
  onProgress: (message) => console.log(message),
});

console.log("");
console.log("Rebuild complete");
console.table(summary);
