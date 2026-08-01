#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bridgeHelpText, parseBridgeArgs, runBridge } from "./bridge-client.mjs";

export async function runBridgeCli(argv = process.argv.slice(2)) {
  const options = parseBridgeArgs(argv);
  if (options.help) {
    console.log(bridgeHelpText());
    return;
  }
  await runBridge(options);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runBridgeCli().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
