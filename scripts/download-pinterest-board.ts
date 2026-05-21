#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { Command } from "commander";
import { loadConfig, resolveFromRoot } from "@/lib/config/load";
import { ensureDir } from "@/lib/images/files";

process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG = "1";

const program = new Command();

program
  .name("pinterest:board")
  .argument("<board-url>", "Pinterest board URL")
  .requiredOption("--out <path>", "output folder for downloaded media")
  .description("Run a configured third-party Pinterest downloader into an output folder.")
  .parse(process.argv);

const options = program.opts<{ out: string }>();
const [boardUrl] = program.args;

if (!/^https?:\/\/(www\.)?pinterest\./i.test(boardUrl)) {
  console.error("The URL does not look like a Pinterest board URL.");
  process.exit(1);
}

const config = await loadConfig();
const command = process.env.PINTEREST_DOWNLOADER_COMMAND || config.pinterestDownloader?.command;
const argsTemplate =
  process.env.PINTEREST_DOWNLOADER_ARGS?.split(" ").filter(Boolean) ??
  config.pinterestDownloader?.args;

if (!command || !argsTemplate?.length) {
  console.error("No Pinterest downloader is configured.");
  console.error("");
  console.error("This project does not ship an official Pinterest API integration.");
  console.error("Configure a downloader you are allowed to use via content-library.config.json or:");
  console.error("PINTEREST_DOWNLOADER_COMMAND=python3");
  console.error("PINTEREST_DOWNLOADER_ARGS=/absolute/path/to/downloader.py {url} --out {out}");
  console.error("");
  console.error("You are responsible for copyright, usage rights, and Pinterest/platform terms.");
  process.exit(1);
}

const outPath = resolveFromRoot(options.out);
await ensureDir(outPath);

const args = argsTemplate.map((arg) =>
  arg.replaceAll("{url}", boardUrl).replaceAll("{out}", outPath),
);

console.log("Running configured Pinterest downloader.");
console.log("This is not an official Pinterest API integration.");
console.log("You are responsible for rights, creator permissions, and platform terms.");
console.log("");
console.log(`${command} ${args.join(" ")}`);

const child = spawn(command, args, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

const exitCode = await new Promise<number | null>((resolve) => {
  child.on("close", resolve);
});

process.exit(exitCode ?? 1);
