#!/usr/bin/env tsx
import { Command } from "commander";
import { loadProjectEnv } from "@/lib/config/env";
import { downloadPinterestBoard, isPinterestUrl } from "@/lib/pinterest/downloader";

process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG = "1";
loadProjectEnv();

const program = new Command();

program
  .name("pinterest:board")
  .argument("<board-url>", "Pinterest board URL")
  .requiredOption("--out <path>", "output folder for downloaded media")
  .description("Run a configured third-party Pinterest downloader into an output folder.")
  .parse(process.argv);

const options = program.opts<{ out: string }>();
const [boardUrl] = program.args;

console.log("Running configured Pinterest downloader.");
console.log("This is not an official Pinterest API integration.");
console.log("You are responsible for rights, creator permissions, and platform terms.");
console.log("");

if (!isPinterestUrl(boardUrl)) {
  console.error("The URL does not look like a Pinterest board URL.");
  process.exit(1);
}

await downloadPinterestBoard({
  boardUrl,
  outDir: options.out,
  onProgress: (message) => console.log(message),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Pinterest download failed.");
  process.exit(1);
});
