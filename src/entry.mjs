#!/usr/bin/env node

if (process.argv[2] === "bridge") {
  const { runBridgeCli } = await import("./bridge-cli.mjs");
  await runBridgeCli(process.argv.slice(3));
} else {
  await import("./server.mjs");
}
