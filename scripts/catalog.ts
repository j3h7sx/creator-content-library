#!/usr/bin/env tsx
import { Command } from "commander";
import { catalogImages } from "@/lib/catalog/catalog";
import { loadProjectEnv } from "@/lib/config/env";

process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG = "1";
loadProjectEnv();

const program = new Command();

program
  .name("catalog")
  .description("Catalog images from the inbox or one or more scan folders.")
  .option("--move", "move cataloged files into library/originals/<category>")
  .option("--scan <path...>", "scan one or more folders instead of the configured inbox")
  .option("--limit <count>", "limit the number of files processed")
  .option("--force", "recatalog files that already exist in the database")
  .option("--manual", "disable OpenAI even if OPENAI_API_KEY exists")
  .option("--include-existing", "scan inbox and originals")
  .parse(process.argv);

const options = program.opts<{
  move?: boolean;
  scan?: string[];
  limit?: string;
  force?: boolean;
  manual?: boolean;
  includeExisting?: boolean;
}>();

const summary = await catalogImages({
  move: Boolean(options.move),
  scan: options.scan,
  limit: options.limit ? Number(options.limit) : undefined,
  force: Boolean(options.force),
  manual: Boolean(options.manual),
  includeExisting: Boolean(options.includeExisting),
  onProgress: (message) => console.log(message),
});

console.log("");
console.log("Catalog complete");
console.table(summary);
