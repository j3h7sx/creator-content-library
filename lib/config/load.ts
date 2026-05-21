import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, type ContentLibraryConfig } from "./defaults";

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? U[]
    : T[K] extends object
      ? PartialDeep<T[K]>
      : T[K];
};

const ROOT = process.cwd();

function mergeConfig(
  base: ContentLibraryConfig,
  override: PartialDeep<ContentLibraryConfig>,
): ContentLibraryConfig {
  return {
    ...base,
    ...override,
    ai: {
      ...base.ai,
      ...override.ai,
      catalogModel:
        process.env.OPENAI_CATALOG_MODEL ??
        override.ai?.catalogModel ??
        base.ai.catalogModel,
      embeddingModel:
        process.env.OPENAI_EMBEDDING_MODEL ??
        override.ai?.embeddingModel ??
        base.ai.embeddingModel,
    },
    pinterestDownloader: {
      ...base.pinterestDownloader,
      ...override.pinterestDownloader,
    },
    taxonomy: override.taxonomy ?? base.taxonomy,
    imageExtensions: override.imageExtensions ?? base.imageExtensions,
  };
}

function normalizeConfig(config: ContentLibraryConfig): ContentLibraryConfig {
  return {
    ...config,
    imageExtensions: config.imageExtensions.map((ext) =>
      ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
    ),
  };
}

async function loadTypescriptConfig(): Promise<PartialDeep<ContentLibraryConfig> | null> {
  const tsConfigPath = path.join(ROOT, "content-library.config.ts");
  if (!existsSync(tsConfigPath)) {
    return null;
  }

  if (!("Bun" in globalThis) && process.env.CONTENT_LIBRARY_LOAD_TS_CONFIG !== "1") {
    return null;
  }

  const runtimeImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{
    default?: PartialDeep<ContentLibraryConfig>;
    config?: PartialDeep<ContentLibraryConfig>;
  }>;
  const imported = await runtimeImport(`${pathToFileURL(tsConfigPath).href}?t=${Date.now()}`);
  return imported.default ?? imported.config ?? null;
}

function loadJsonConfig(): PartialDeep<ContentLibraryConfig> | null {
  const jsonConfigPath = path.join(ROOT, "content-library.config.json");
  if (!existsSync(jsonConfigPath)) {
    return null;
  }

  return JSON.parse(readFileSync(jsonConfigPath, "utf8")) as PartialDeep<ContentLibraryConfig>;
}

export async function loadConfig(): Promise<ContentLibraryConfig> {
  const jsonConfig = loadJsonConfig();
  const tsConfig = await loadTypescriptConfig();
  const override = tsConfig ?? jsonConfig ?? {};
  return normalizeConfig(mergeConfig(DEFAULT_CONFIG, override));
}

export function resolveFromRoot(relativeOrAbsolutePath: string): string {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), relativeOrAbsolutePath);
}

export function toRootRelative(absolutePath: string): string {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

export function appRoot(): string {
  return ROOT;
}
