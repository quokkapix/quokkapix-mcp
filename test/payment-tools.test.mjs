import assert from "node:assert/strict";
import test from "node:test";

import {
  explainAgentPaymentFlow,
  getAgentPaymentOptions,
  verifyAgentUnlockToken,
} from "../src/payment-tools.mjs";

test("payment helpers explain x402 flow without claiming they sign payments", () => {
  const flow = explainAgentPaymentFlow({ baseUrl: "https://quokkapix.com/" });
  assert.equal(flow.localBrowserProcessing, true);
  assert.match(flow.note, /cannot sign an x402 payment/i);
  assert.match(flow.appliesTo, /free small-batch limit/i);
  assert.equal(flow.free.singleImage, true);
  assert.equal(flow.endpoints.options, "https://quokkapix.com/api/agent-payment/options");
  assert.equal(flow.endpoints.coinbaseX402Unlock, "https://quokkapix.com/api/agent-unlock/coinbase-x402");
});

test("payment helpers fetch options and verify unlock tokens through public endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "https://example.test/api/agent-payment/options") {
      return jsonResponse({ scope: "agent-batch-run", price: "0.02", currency: "USDC", maxFiles: 50 });
    }
    if (url === "https://example.test/api/agent-unlock/verify") {
      const body = JSON.parse(options.body);
      assert.equal(body.token, "a".repeat(32));
      assert.equal(body.scope, "agent-batch-run");
      assert.equal(body.price, "0.02");
      assert.equal(body.currency, "USDC");
      assert.equal(body.consume, false);
      return jsonResponse({ valid: true, consumed: false });
    }
    return jsonResponse({ error: "not-found" }, 404);
  };

  try {
    const options = await getAgentPaymentOptions({ baseUrl: "https://example.test" });
    assert.equal(options.price, "0.02");
    const verify = await verifyAgentUnlockToken({
      baseUrl: "https://example.test",
      token: "a".repeat(32),
      consume: false,
    });
    assert.equal(verify.ok, true);
    assert.equal(verify.valid, true);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    async json() {
      return body;
    },
  };
}
