import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

describe("Tauri desktop dev wiring", () => {
  it("starts the Vite dev server on the same URL Tauri loads", () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>("package.json");
    const tauriConfig = readJson<{
      build: {
        beforeBuildCommand?: string;
        beforeDevCommand?: string;
        devUrl: string;
      };
    }>("src-tauri/tauri.conf.json");

    expect(packageJson.scripts.dev).toContain("--host 127.0.0.1");
    expect(packageJson.scripts.dev).toContain("--port 4173");
    expect(packageJson.scripts.dev).toContain("--strictPort");
    expect(tauriConfig.build.devUrl).toBe("http://127.0.0.1:4173");
    expect(tauriConfig.build.beforeDevCommand).toBe("pnpm dev");
    expect(tauriConfig.build.beforeBuildCommand).toBe("pnpm build");
  });
});
