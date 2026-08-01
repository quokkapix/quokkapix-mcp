import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { createBridgeExecutor } from "./bridge-executor.mjs";
import { MCP_ADAPTER_VERSION } from "./version.mjs";

const CONFIG_VERSION = 1;
const DEFAULT_CONTROL_PLANE = "https://quokkapix.com";

export async function runBridge(options = {}) {
  const configPath = path.resolve(options.config || defaultConfigPath());
  const existingConfig = await readBridgeConfig(configPath);
  let config = mergeBridgeConfig(existingConfig, options);
  if (options.reset && existingConfig?.deviceId && existingConfig?.deviceSecret) {
    try {
      await bridgeRequest(
        existingConfig,
        `/bridge/v1/devices/${encodeURIComponent(existingConfig.deviceId)}/revoke`,
        { method: "POST", body: {}, allowNoContent: true },
      );
      options.log?.("Previous QuokkaPix bridge authorization revoked.");
    } catch (error) {
      options.log?.(`Could not revoke the previous bridge remotely: ${error.message}`);
    }
    delete config.deviceId;
    delete config.deviceSecret;
    delete config.pairing;
  }
  await validateBridgeRoots(config);

  if (!config?.deviceId || !config?.deviceSecret) {
    config = await registerBridge(config, options);
    await writeBridgeConfig(configPath, config);
  } else if (options.pair) {
    const pairing = await bridgeRequest(config, `/bridge/v1/devices/${encodeURIComponent(config.deviceId)}/pairing`, {
      method: "POST",
      body: {},
    });
    await presentPairing(pairing, config, options);
  }

  let status = await getPairingStatus(config);
  if (status.status !== "active") {
    if (!config.pairing) {
      throw new Error("Bridge is not approved. Run again with --pair to create a new pairing code.");
    }
    await presentPairing(config.pairing, config, options);
    status = await waitForApproval(config, config.pairing);
    delete config.pairing;
    await writeBridgeConfig(configPath, config);
  } else if (config.pairing) {
    delete config.pairing;
    await writeBridgeConfig(configPath, config);
  }

  options.log?.(`QuokkaPix bridge connected. Remote MCP: ${status.mcpUrl || `${config.controlPlane}/mcp`}`);
  const executor = createBridgeExecutor(config);
  await pollJobs(config, executor, options);
  return { ok: true, deviceId: config.deviceId };
}

export function parseBridgeArgs(argv = []) {
  const options = { headless: undefined, openBrowser: true, log: (message) => console.log(message) };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--control-plane":
        options.controlPlane = next();
        break;
      case "--input-root":
        options.inputRoot = next();
        break;
      case "--output-root":
        options.outputRoot = next();
        break;
      case "--app-url":
        options.appUrl = next();
        break;
      case "--name":
        options.name = next();
        break;
      case "--config":
        options.config = next();
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--headless":
        options.headless = true;
        break;
      case "--no-open":
        options.openBrowser = false;
        break;
      case "--pair":
        options.pair = true;
        break;
      case "--reset":
        options.reset = true;
        break;
      case "--once":
        options.once = true;
        break;
      default:
        throw new Error(`Unknown bridge option: ${arg}`);
    }
  }
  return options;
}

export function bridgeHelpText() {
  return `QuokkaPix cloud-to-local execution bridge

Usage:
  quokkapix-mcp bridge --input-root ./images --output-root ./quokkapix-output

Options:
  --input-root       Only files inside this directory can be processed remotely.
  --output-root      Results are written only inside this directory.
  --control-plane    Control plane URL, default https://quokkapix.com.
  --name             Device name shown during OAuth authorization.
  --app-url          QuokkaPix browser URL override for trusted development.
  --config           Local bridge config path.
  --headed           Show Chromium while processing.
  --no-open          Print the pairing URL without opening it.
  --pair             Create a fresh browser pairing approval.
  --reset            Revoke the configured device, then pair a new one.
  --once             Poll once and exit (diagnostics/tests).
`;
}

export async function readBridgeConfig(configPath = defaultConfigPath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
    return parsed.version === CONFIG_VERSION ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read bridge config: ${error.message}`);
  }
}

export async function writeBridgeConfig(configPath, config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporaryPath, configPath);
  await fs.chmod(configPath, 0o600).catch(() => {});
}

export function defaultConfigPath() {
  return path.join(os.homedir(), ".quokkapix", "bridge.json");
}

async function registerBridge(baseConfig, options) {
  const config = mergeBridgeConfig(baseConfig, options);
  if (!config.inputRoot) throw new Error("--input-root is required when pairing a new bridge.");
  const deviceSecret = crypto.randomBytes(32).toString("base64url");
  const pairing = await publicBridgeRequest(config.controlPlane, "/bridge/v1/pairings", {
    method: "POST",
    body: {
      secret: deviceSecret,
      name: config.name,
      capabilities: {
        adapterVersion: MCP_ADAPTER_VERSION,
        platform: process.platform,
        arch: process.arch,
        node: process.versions.node,
        localBrowserProcessing: true,
        imageBytesRelayed: false,
      },
    },
  });
  validatePairingUrl(pairing?.verificationUriComplete, config.controlPlane);
  if (!/^dev_[A-Za-z0-9_-]{1,120}$/.test(String(pairing?.deviceId || ""))) {
    throw new Error("Bridge returned an invalid device id.");
  }
  return {
    ...config,
    version: CONFIG_VERSION,
    deviceId: pairing.deviceId,
    deviceSecret,
    pairing,
  };
}

function mergeBridgeConfig(current, options) {
  const controlPlane = normalizeControlPlane(options.controlPlane || current?.controlPlane || DEFAULT_CONTROL_PLANE);
  const inputRoot = options.inputRoot ? path.resolve(options.inputRoot) : current?.inputRoot || "";
  const outputRoot = options.outputRoot
    ? path.resolve(options.outputRoot)
    : current?.outputRoot || (inputRoot ? path.join(inputRoot, "quokkapix-output") : "");
  return {
    ...(current || {}),
    version: CONFIG_VERSION,
    controlPlane,
    inputRoot,
    outputRoot,
    appUrl: options.appUrl || current?.appUrl || "https://quokkapix.com/#agent=1",
    name: String(options.name || current?.name || `${os.hostname()} QuokkaPix bridge`).slice(0, 80),
    headless: options.headless ?? current?.headless ?? true,
  };
}

async function validateBridgeRoots(config) {
  if (!config.inputRoot || !config.outputRoot) {
    throw new Error("Bridge inputRoot and outputRoot must be configured.");
  }
  const inputStat = await fs.stat(config.inputRoot).catch(() => null);
  if (!inputStat?.isDirectory()) throw new Error(`Bridge input root does not exist: ${config.inputRoot}`);
  await fs.mkdir(config.outputRoot, { recursive: true });
}

async function presentPairing(pairing, config, options) {
  const url = validatePairingUrl(pairing?.verificationUriComplete, config.controlPlane);
  options.log?.(`Pairing code: ${pairing.code}`);
  options.log?.(`Approve this device: ${url}`);
  if (options.openBrowser !== false) await openExternalUrl(url);
}

function validatePairingUrl(value, controlPlane) {
  let pairingUrl;
  try {
    pairingUrl = new URL(String(value || ""));
  } catch {
    throw new Error("Bridge returned an invalid pairing URL.");
  }
  const controlPlaneUrl = new URL(normalizeControlPlane(controlPlane));
  if (pairingUrl.origin !== controlPlaneUrl.origin) {
    throw new Error("Bridge pairing URL must use the configured control-plane origin.");
  }
  return pairingUrl.toString();
}

async function waitForApproval(config, pairing) {
  const expiresAt = Date.parse(pairing.expiresAt || "") || Date.now() + 10 * 60_000;
  while (Date.now() < expiresAt) {
    const status = await getPairingStatus(config);
    if (status.status === "active") return status;
    await delay(Math.max(1, Number(pairing.pollInterval || 2)) * 1000);
  }
  throw new Error("Bridge pairing code expired. Run with --pair to try again.");
}

async function getPairingStatus(config) {
  return bridgeRequest(config, `/bridge/v1/pairings/${encodeURIComponent(config.deviceId)}`);
}

async function pollJobs(config, executor, options) {
  let retryMs = 1000;
  while (!options.signal?.aborted) {
    try {
      const job = await bridgeRequest(config, `/bridge/v1/devices/${encodeURIComponent(config.deviceId)}/poll`, {
        method: "POST",
        body: { waitMs: options.once ? 0 : 25_000 },
        allowNoContent: true,
        signal: options.signal,
      });
      retryMs = 1000;
      if (job) await executeBridgeJob(config, executor, job, options);
      if (options.once) return;
    } catch (error) {
      if (options.signal?.aborted) return;
      options.log?.(`Bridge connection error: ${error.message}. Retrying...`);
      await delay(retryMs);
      retryMs = Math.min(30_000, retryMs * 2);
      if (options.once) throw error;
    }
  }
}

export async function executeBridgeJob(config, executor, job, options = {}) {
  await retryJobRequest(config, job, "start", {}, 3);
  options.log?.(`Running ${job.tool} (${job.id})`);
  let completion;
  try {
    const result = await executor.execute(job.tool, job.args, {
      jobId: job.id,
      onLifecycle: async (event, detail) => {
        if (event === "processing_started") {
          await jobRequest(config, job, "events", { event, detail }).catch(() => {});
        }
      },
    });
    completion = { ok: true, result };
  } catch (error) {
    completion = {
      ok: false,
      error: {
        code: String(error?.code || "bridge-execution-failed").slice(0, 80),
        message: sanitizeRemoteErrorMessage(error?.message || error, config).slice(0, 500),
      },
    };
  }
  await retryComplete(config, job, completion);
  if (completion.ok) options.log?.(`Completed ${job.id}`);
  else options.log?.(`Failed ${job.id}: ${completion.error.message}`);
}

async function retryComplete(config, job, payload) {
  return retryJobRequest(config, job, "complete", payload, 6);
}

async function retryJobRequest(config, job, action, payload, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await jobRequest(config, job, action, payload);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await delay(Math.min(8_000, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

function jobRequest(config, job, action, body) {
  return bridgeRequest(config, `/bridge/v1/jobs/${encodeURIComponent(job.id)}/${action}`, {
    method: "POST",
    headers: { "x-bridge-job-token": job.jobToken },
    body,
    allowNoContent: true,
  });
}

function bridgeRequest(config, pathname, options = {}) {
  return publicBridgeRequest(config.controlPlane, pathname, {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: `Bridge ${config.deviceId}.${config.deviceSecret}`,
    },
  });
}

async function publicBridgeRequest(controlPlane, pathname, options = {}) {
  const response = await fetch(`${normalizeControlPlane(controlPlane)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (response.status === 204 && options.allowNoContent) return null;
  const text = await response.text();
  const value = text ? parseJson(text) : {};
  if (!response.ok) {
    throw new Error(value?.error || `Bridge request failed with HTTP ${response.status}.`);
  }
  return value;
}

function normalizeControlPlane(value) {
  const url = new URL(String(value || DEFAULT_CONTROL_PLANE));
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Control plane must use HTTPS outside localhost.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Bridge returned an invalid JSON response.");
  }
}

function sanitizeRemoteErrorMessage(value, config) {
  let message = String(value || "Local execution failed.");
  for (const [root, replacement] of [
    [config.inputRoot, "input://"],
    [config.outputRoot, "output://"],
    [os.homedir(), "home://"],
    [os.tmpdir(), "temp://"],
    [process.cwd(), "cwd://"],
  ]) {
    if (!root) continue;
    message = message.split(String(root)).join(replacement);
    message = message.split(String(root).replace(/\\/g, "/")).join(replacement);
  }
  return message;
}

async function openExternalUrl(url) {
  const command =
    process.platform === "win32"
      ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  await new Promise((resolve) => {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", resolve);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
