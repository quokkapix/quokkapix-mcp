import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MCP_ADAPTER_VERSION } from "../src/version.mjs";

test("runtime version matches the npm package version", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(MCP_ADAPTER_VERSION, packageJson.version);
});
