import nextEnv from "@next/env";

let loaded = false;

export function loadProjectEnv() {
  if (loaded) {
    return;
  }

  nextEnv.loadEnvConfig(process.cwd());
  loaded = true;
}
