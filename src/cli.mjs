#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { processImagesWithQuokkaPix } from "./quokkapix-browser-runner.mjs";

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedFile === currentFile) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export async function runCli(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return;
  }
  const result = await processImagesWithQuokkaPix(options);
  console.log(JSON.stringify(result, null, 2));
}

export function parseArgs(argv) {
  const options = {
    inputFiles: [],
    headless: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--recipe":
      case "--recipe-id":
        options.recipeId = next();
        break;
      case "--input":
      case "--file":
        options.inputFiles.push(next());
        break;
      case "--output":
      case "--output-dir":
        options.outputDir = next();
        break;
      case "--app-url":
        options.appUrl = next();
        break;
      case "--unlock-token":
        options.unlockToken = next();
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(next());
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--headless":
        options.headless = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.inputFiles.push(arg);
    }
  }
  if (!options.help) {
    if (!options.recipeId) {
      throw new Error("--recipe is required.");
    }
    if (!options.outputDir) {
      throw new Error("--output is required.");
    }
    if (!options.inputFiles.length) {
      throw new Error("At least one --input file is required.");
    }
  }
  return options;
}

function helpText() {
  return `QuokkaPix local browser runner

Usage:
  quokkapix-runner --recipe shopify_product_pack --input ./photo.jpg --output ./out

Options:
  --recipe, --recipe-id   Official recipe id.
  --input, --file         Input image path. Repeat for multiple files.
  --output, --output-dir  Output directory.
  --app-url               QuokkaPix URL, default https://quokkapix.com/#agent=1.
  --unlock-token          Paid x402 unlock token for agent batch/scenario runs above the free small-batch limit.
  --headed                Show browser window.
  --timeout-ms            Timeout in milliseconds.
`;
}
