const DEFAULT_PAYMENT_BASE_URL = (
  process.env.QUOKKAPIX_PAYMENT_BASE_URL || "https://quokkapix.com"
).replace(/\/+$/, "");

export async function getAgentPaymentOptions({ baseUrl = DEFAULT_PAYMENT_BASE_URL } = {}) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/api/agent-payment/options`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Payment options failed (${response.status}): ${body.error || response.statusText}`);
  }
  return body;
}

export async function verifyAgentUnlockToken({
  token,
  baseUrl = DEFAULT_PAYMENT_BASE_URL,
  scope,
  price,
  currency,
  mode = "batch",
  files = 1,
  consume = false,
} = {}) {
  if (!token) {
    throw new Error("token is required.");
  }
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const paymentOptions = await getAgentPaymentOptions({ baseUrl: normalizedBaseUrl });
  const resolvedScope = scope || paymentOptions.scope;
  const resolvedPrice = price || paymentOptions.price;
  const resolvedCurrency = currency || paymentOptions.currency;
  if (!resolvedScope || !resolvedPrice || !resolvedCurrency) {
    throw new Error("Payment options response must include scope, price and currency.");
  }
  const endpoint = `${normalizedBaseUrl}/api/agent-unlock/verify`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      scope: resolvedScope,
      price: resolvedPrice,
      currency: resolvedCurrency,
      mode,
      files,
      consume,
    }),
  });
  const body = await readJsonResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    ...body,
  };
}

export function explainAgentPaymentFlow({ baseUrl = DEFAULT_PAYMENT_BASE_URL } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    service: "QuokkaPix",
    appliesTo: "agent batch and batch scenario runs above the free small-batch limit",
    humanUi: "unchanged",
    localBrowserProcessing: true,
    note:
      "The MCP adapter cannot sign an x402 payment by itself. Use an x402-capable client or wallet to call the paid unlock endpoint, then pass unlockToken into process_images or process_with_settings.",
    free: {
      singleImage: true,
      singleScenario: true,
      smallBatch: "Call get_payment_options for the current free small-batch limit.",
    },
    endpoints: {
      options: `${normalizedBaseUrl}/api/agent-payment/options`,
      coinbaseX402Unlock: `${normalizedBaseUrl}/api/agent-unlock/coinbase-x402`,
      verify: `${normalizedBaseUrl}/api/agent-unlock/verify`,
      contract: `${normalizedBaseUrl}/x402-api.md`,
    },
    steps: [
      "Call get_payment_options.",
      "Use an x402-capable client to request /api/agent-unlock/coinbase-x402.",
      "Read unlockToken from the paid JSON response.",
      "Optionally call verify_unlock_token with consume=false.",
      "Call process_images or process_with_settings and pass unlockToken.",
    ],
  };
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_PAYMENT_BASE_URL).replace(/\/+$/, "");
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
