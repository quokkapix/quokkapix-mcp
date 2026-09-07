import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bridgeHelpText,
  executeBridgeJob,
  parseBridgeArgs,
  readBridgeConfig,
  runBridge,
} from "../src/bridge-client.mjs";
import {
  createBridgeExecutor,
  resolveWithinRoot,
} from "../src/bridge-executor.mjs";

test("bridge CLI keeps local stdio separate and parses explicit roots", () => {
  const options = parseBridgeArgs([
    "--input-root",
    "./input",
    "--output-root",
    "./output",
    "--headed",
    "--no-open",
    "--once",
  ]);
  assert.equal(options.inputRoot, "./input");
  assert.equal(options.outputRoot, "./output");
  assert.equal(options.headless, false);
  assert.equal(options.openBrowser, false);
  assert.equal(options.once, true);
  assert.match(bridgeHelpText(), /quokkapix-mcp bridge/);
});

test("bridge executor rejects paths outside configured roots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-bridge-root-"));
  try {
    assert.equal(resolveWithinRoot(root, "inside/photo.jpg"), path.join(root, "inside", "photo.jpg"));
    assert.throws(
      () => resolveWithinRoot(root, "../secret.jpg"),
      (error) => error.code === "path-outside-allowed-root",
    );

    const executor = createBridgeExecutor({ inputRoot: root, outputRoot: path.join(root, "out") });
    const validation = await executor.execute("validate_recipe", {
      recipe: {
        id: "bridge_test",
        applySettings: { mode: "single", tool: "compress" },
        requires: { maxFiles: 1 },
      },
    });
    assert.equal(validation.valid, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bridge executor rejects input and output symlink escapes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-bridge-symlink-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-bridge-symlink-outside-"));
  const inputRoot = path.join(root, "input");
  const outputRoot = path.join(root, "output");
  await fs.mkdir(inputRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(inputRoot, "photo.jpg"), "not-an-image");
  await fs.writeFile(path.join(outside, "secret.jpg"), "secret");
  await fs.symlink(outside, path.join(inputRoot, "outside"), process.platform === "win32" ? "junction" : "dir");
  await fs.symlink(outside, path.join(outputRoot, "outside"), process.platform === "win32" ? "junction" : "dir");
  const executor = createBridgeExecutor({ inputRoot, outputRoot });

  try {
    await assert.rejects(
      executor.execute("process_images", { inputFiles: ["outside/secret.jpg"] }),
      (error) => error.code === "path-outside-allowed-root",
    );
    await assert.rejects(
      executor.execute("process_images", { inputFiles: ["photo.jpg"], outputDir: "outside/result" }),
      (error) => error.code === "path-outside-allowed-root",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("bridge pairs, stores its secret locally and polls without sending image bytes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-bridge-client-"));
  const inputRoot = path.join(tempDir, "input");
  const outputRoot = path.join(tempDir, "output");
  const configPath = path.join(tempDir, "bridge.json");
  await fs.mkdir(inputRoot, { recursive: true });
  const requests = [];

  const server = http.createServer(async (request, response) => {
    const body = await readJsonBody(request);
    requests.push({ method: request.method, url: request.url, body, authorization: request.headers.authorization || "" });
    if (request.method === "POST" && request.url === "/bridge/v1/devices/dev_test/revoke") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/bridge/v1/pairings") {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({
        deviceId: "dev_test",
        code: "ABCD2345",
        verificationUriComplete: `http://127.0.0.1:${server.address().port}/bridge/connect?code=ABCD2345`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        pollInterval: 1,
        mcpUrl: "http://127.0.0.1/mcp",
      }));
      return;
    }
    if (request.method === "GET" && request.url === "/bridge/v1/pairings/dev_test") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "active", deviceId: "dev_test", mcpUrl: "http://127.0.0.1/mcp" }));
      return;
    }
    if (request.method === "POST" && request.url === "/bridge/v1/devices/dev_test/poll") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not-found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const controlPlane = `http://127.0.0.1:${server.address().port}`;
    const result = await runBridge({
      controlPlane,
      inputRoot,
      outputRoot,
      config: configPath,
      openBrowser: false,
      once: true,
      log() {},
    });
    assert.equal(result.deviceId, "dev_test");

    const config = await readBridgeConfig(configPath);
    assert.equal(config.controlPlane, controlPlane);
    assert.ok(config.deviceSecret.length >= 32);
    assert.equal(config.inputRoot, inputRoot);
    assert.equal(config.outputRoot, outputRoot);

    const pairingRequest = requests.find((entry) => entry.url === "/bridge/v1/pairings");
    assert.equal(pairingRequest.body.capabilities.imageBytesRelayed, false);
    assert.equal(pairingRequest.body.capabilities.adapterVersion, "0.4.2");
    assert.equal("inputFiles" in pairingRequest.body, false);
    const pollRequest = requests.find((entry) => entry.url.endsWith("/poll"));
    assert.match(pollRequest.authorization, /^Bridge dev_test\./);

    await runBridge({
      controlPlane,
      inputRoot,
      outputRoot,
      config: configPath,
      reset: true,
      openBrowser: false,
      once: true,
      log() {},
    });
    const revokeRequest = requests.find((entry) => entry.url.endsWith("/revoke"));
    assert.match(revokeRequest.authorization, /^Bridge dev_test\./);

    const pairingCount = requests.filter((entry) => entry.url === "/bridge/v1/pairings").length;
    await fs.rm(inputRoot, { recursive: true, force: true });
    await assert.rejects(
      runBridge({
        controlPlane,
        config: configPath,
        reset: true,
        openBrowser: false,
        once: true,
        log() {},
      }),
      /input root does not exist/,
    );
    assert.equal(requests.filter((entry) => entry.url.endsWith("/revoke")).length, 2);
    assert.equal(requests.filter((entry) => entry.url === "/bridge/v1/pairings").length, pairingCount);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("bridge preserves a successful result while retrying completion delivery", async () => {
  const completionBodies = [];
  let completionAttempts = 0;
  const server = http.createServer(async (request, response) => {
    const body = await readJsonBody(request);
    if (request.url === "/bridge/v1/jobs/job_test/start") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    if (request.url === "/bridge/v1/jobs/job_test/complete") {
      completionBodies.push(body);
      completionAttempts += 1;
      if (completionAttempts === 1) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":"temporary"}');
      } else {
        response.writeHead(204);
        response.end();
      }
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not-found"}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const controlPlane = `http://127.0.0.1:${server.address().port}`;
    await executeBridgeJob(
      {
        controlPlane,
        deviceId: "dev_test",
        deviceSecret: "device-secret-long-enough-for-test",
        inputRoot: process.cwd(),
        outputRoot: process.cwd(),
      },
      { execute: async () => ({ ok: true, status: "done" }) },
      { id: "job_test", tool: "get_recipe", args: {}, jobToken: "job-token" },
      { log() {} },
    );
    assert.equal(completionAttempts, 2);
    assert.ok(completionBodies.every((body) => body.ok === true));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bridge rejects a pairing URL from another origin", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "quokkapix-bridge-origin-"));
  const inputRoot = path.join(tempDir, "input");
  const outputRoot = path.join(tempDir, "output");
  const configPath = path.join(tempDir, "bridge.json");
  await fs.mkdir(inputRoot, { recursive: true });
  const server = http.createServer(async (request, response) => {
    await readJsonBody(request);
    if (request.url === "/bridge/v1/pairings") {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({
        deviceId: "dev_untrusted_url",
        code: "ABCD2345",
        verificationUriComplete: "https://attacker.example/bridge/connect?code=ABCD2345",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        pollInterval: 1,
      }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not-found"}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await assert.rejects(
      runBridge({
        controlPlane: `http://127.0.0.1:${server.address().port}`,
        inputRoot,
        outputRoot,
        config: configPath,
        openBrowser: false,
        once: true,
        log() {},
      }),
      /configured control-plane origin/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("bridge validates local roots before creating a remote device", async () => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(500);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      runBridge({
        controlPlane: `http://127.0.0.1:${server.address().port}`,
        inputRoot: path.join(os.tmpdir(), `missing-${Date.now()}`),
        outputRoot: path.join(os.tmpdir(), "unused-output"),
        config: path.join(os.tmpdir(), `missing-config-${Date.now()}.json`),
        openBrowser: false,
        once: true,
        log() {},
      }),
      /input root does not exist/,
    );
    assert.equal(requests, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
