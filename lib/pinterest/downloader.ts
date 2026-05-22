import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ContentLibraryConfig } from "@/lib/config/defaults";
import { loadConfig, resolveFromRoot, toRootRelative } from "@/lib/config/load";
import { ensureDir } from "@/lib/images/files";

const BUNDLED_DOWNLOADER_PATH = "vendor/pinterest-downloader/pinterest-downloader.py";
const BUNDLED_REQUIREMENTS_PATH = "vendor/pinterest-downloader/requirements.txt";
const LOCAL_PINTEREST_VENV_PYTHON = ".venv-pinterest/bin/python";
const PINTEREST_PYTHON_DEPS = [
  "brotli",
  "colorama",
  "fake_useragent",
  "lxml",
  "requests",
  "socks",
  "termcolor",
];

type DownloaderResolution = {
  command: string;
  argsTemplate: string[];
  usingBundledDownloader: boolean;
  bundledDownloader: string;
  bundledRequirements: string;
};

function nonBlankEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseArgsTemplate(value: string | undefined): string[] | undefined {
  const args = nonBlankEnv(value)?.split(" ").filter(Boolean);
  return args?.length ? args : undefined;
}

export type PinterestDownloadResult = {
  outputPath: string;
  outputRelativePath: string;
};

export function isPinterestUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    const host = hostname.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }

    return (
      host === "pin.it" ||
      host.endsWith(".pin.it") ||
      /^(.+\.)?pinterest\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(host)
    );
  } catch {
    return false;
  }
}

export async function downloadPinterestBoard(input: {
  boardUrl: string;
  outDir: string;
  config?: ContentLibraryConfig;
  onProgress?: (message: string) => void;
}): Promise<PinterestDownloadResult> {
  if (!isPinterestUrl(input.boardUrl)) {
    throw new Error("The URL does not look like a Pinterest board URL.");
  }

  const config = input.config ?? await loadConfig();
  const resolution = await resolveDownloader(config);
  const outPath = resolveFromRoot(input.outDir);
  await ensureDir(outPath);

  const args = resolution.argsTemplate.map((arg) =>
    arg.replaceAll("{url}", input.boardUrl).replaceAll("{out}", outPath),
  );

  input.onProgress?.("Running Pinterest downloader.");
  if (resolution.usingBundledDownloader) {
    input.onProgress?.(
      `Using bundled downloader: ${path.relative(process.cwd(), resolution.bundledDownloader)}`,
    );
  }

  await runDownloader({
    command: resolution.command,
    args,
    onProgress: input.onProgress,
  });

  return {
    outputPath: outPath,
    outputRelativePath: toRootRelative(outPath),
  };
}

async function resolveDownloader(config: ContentLibraryConfig): Promise<DownloaderResolution> {
  const configuredCommand =
    nonBlankEnv(process.env.PINTEREST_DOWNLOADER_COMMAND) || config.pinterestDownloader?.command;
  const configuredArgsTemplate =
    parseArgsTemplate(process.env.PINTEREST_DOWNLOADER_ARGS) ??
    config.pinterestDownloader?.args;
  const bundledDownloader = resolveFromRoot(BUNDLED_DOWNLOADER_PATH);
  const bundledRequirements = resolveFromRoot(BUNDLED_REQUIREMENTS_PATH);
  const bundledVenvPython = resolveFromRoot(LOCAL_PINTEREST_VENV_PYTHON);
  const hasBundledDownloader = existsSync(bundledDownloader);

  if (
    (configuredCommand && !configuredArgsTemplate?.length) ||
    (!configuredCommand && configuredArgsTemplate?.length)
  ) {
    throw new Error(
      "Pinterest downloader configuration is incomplete. Set both PINTEREST_DOWNLOADER_COMMAND and PINTEREST_DOWNLOADER_ARGS, or remove both to use the bundled downloader.",
    );
  }

  const command =
    configuredCommand ?? (existsSync(bundledVenvPython) ? bundledVenvPython : "python3");
  const argsTemplate =
    configuredArgsTemplate ??
    (hasBundledDownloader ? [bundledDownloader, "{url}", "-d", "{out}"] : undefined);
  const usingBundledDownloader =
    !configuredCommand && !configuredArgsTemplate && hasBundledDownloader;

  if (!argsTemplate?.length) {
    throw new Error(
      `No Pinterest downloader is configured. Run bun run pinterest:setup, or configure PINTEREST_DOWNLOADER_COMMAND and PINTEREST_DOWNLOADER_ARGS. You are responsible for rights, creator permissions, and platform terms.`,
    );
  }

  if (usingBundledDownloader) {
    const missingDeps = await getMissingPythonDeps(command);
    if (missingDeps.length > 0) {
      throw new Error(
        `The bundled Pinterest downloader is present, but dependencies are missing: ${missingDeps.join(", ")}. Run bun run pinterest:setup to install ${path.relative(process.cwd(), bundledRequirements)} into ${LOCAL_PINTEREST_VENV_PYTHON}.`,
      );
    }
  }

  return {
    command,
    argsTemplate,
    usingBundledDownloader,
    bundledDownloader,
    bundledRequirements,
  };
}

async function runDownloader(input: {
  command: string;
  args: string[];
  onProgress?: (message: string) => void;
}) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      recordOutput(chunk.toString(), input.onProgress);
    });
    child.stderr.on("data", (chunk) => {
      recordOutput(chunk.toString(), input.onProgress);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`Pinterest downloader exited with code ${exitCode ?? 1}.`));
    });
  });
}

function recordOutput(output: string, onProgress?: (message: string) => void) {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) {
      onProgress?.(trimmed.slice(0, 220));
    }
  }
}

async function getMissingPythonDeps(pythonCommand: string): Promise<string[]> {
  const code = [
    "import importlib.util, json",
    `deps = ${JSON.stringify(PINTEREST_PYTHON_DEPS)}`,
    "print(json.dumps([dep for dep in deps if importlib.util.find_spec(dep) is None]))",
  ].join("; ");

  const output = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
    let stdout = "";
    const child = spawn(pythonCommand, ["-c", code], { stdio: ["ignore", "pipe", "ignore"] });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve({ code: 1, stdout: "" }));
    child.on("close", (exitCode) => resolve({ code: exitCode, stdout }));
  });

  if (output.code !== 0) {
    return PINTEREST_PYTHON_DEPS;
  }

  try {
    return JSON.parse(output.stdout.trim()) as string[];
  } catch {
    return PINTEREST_PYTHON_DEPS;
  }
}
