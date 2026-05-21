#!/usr/bin/env tsx
import { Command } from "commander";
import { dedupeImages } from "@/lib/catalog/dedupe";

process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG = "1";

const program = new Command();

program
  .name("dedupe")
  .description("Find exact duplicate image files by SHA-256 hash.")
  .option("--move", "move duplicates into the configured duplicates folder")
  .option("--scan <path...>", "scan one or more folders instead of the configured library root")
  .parse(process.argv);

const options = program.opts<{
  move?: boolean;
  scan?: string[];
}>();

const summary = await dedupeImages({
  move: Boolean(options.move),
  scan: options.scan,
});

console.log(`Scanned ${summary.scanned} image file(s).`);
if (summary.duplicates.length === 0) {
  console.log("No exact duplicates found.");
  process.exit(0);
}

for (const duplicate of summary.duplicates) {
  console.log("");
  console.log(`Duplicate: ${duplicate.duplicatePath}`);
  console.log(`Keep:      ${duplicate.keepPath}`);
  if (duplicate.movedTo) {
    console.log(`Moved to:  ${duplicate.movedTo}`);
  }
}

console.log("");
console.log(`${summary.duplicates.length} duplicate file(s) ${options.move ? "moved" : "found"}.`);
