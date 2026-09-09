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
  productId = "",
  surface = "image",
  pdfPages = 0,
  durationSeconds = 0,
  scenario = false,
  transcribe = false,
} = {}) {
  if (!token) {
    throw new Error("token is required.");
  }
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const paymentOptions = await getAgentPaymentOptions({ baseUrl: normalizedBaseUrl });
  const resolvedProductId = productId || inferProductId({ surface, files, pdfPages, durationSeconds, scenario, transcribe });
  const product = paymentOptions.products?.[resolvedProductId] || {};
  const resolvedScope = scope || product.scope || paymentOptions.scope;
  const resolvedPrice = price || product.price || paymentOptions.price;
  const resolvedCurrency = currency || product.currency || paymentOptions.currency;
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
      productId: resolvedProductId,
      surface,
      pdfPages,
      durationSeconds,
      scenario,
      transcribe,
      consume: false,
    }),
  });
  const body = await readJsonResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    ...body,
  };
}

function inferProductId({ surface, files, pdfPages, durationSeconds, scenario, transcribe }) {
  if (surface === "video") {
    const seconds = Number(durationSeconds || 0);
    if (transcribe) return seconds <= 900 ? "video-transcribe-standard" : seconds <= 1800 ? "video-transcribe-medium" : "video-transcribe-long";
    return seconds <= 900 ? "video-standard" : seconds <= 1800 ? "video-medium" : "video-long";
  }
  if (scenario) return "image-scenario";
  if (Number(files || 0) > 25 || Number(pdfPages || 0) > 50) return "image-large";
  return "image-standard";
}

export function explainAgentPaymentFlow({ baseUrl = DEFAULT_PAYMENT_BASE_URL } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    service: "QuokkaPix",
    appliesTo: "Image scale, PDF page, Image scenario and Video duration tiers above the published free limits",
    humanUi: "unchanged",
    localBrowserProcessing: true,
    note:
      "Upload locally first to obtain an exact quote. The adapter cannot sign x402 itself; call the quoted product endpoint with an x402-capable wallet, then retry the same Image or Video process tool with unlockToken.",
    free: {
      singleImage: true,
      videoUpToFiveMinutes: true,
      smallBatch: "Call get_payment_options for the current free small-batch limit.",
    },
    endpoints: {
      options: `${normalizedBaseUrl}/api/agent-payment/options`,
      productEndpoints: "Read products[productId].endpoints from get_payment_options",
      verify: `${normalizedBaseUrl}/api/agent-unlock/verify`,
      contract: `${normalizedBaseUrl}/x402-api.md`,
    },
    steps: [
      "Call get_payment_options.",
      "Run without a token to receive the exact local quote after files, ZIP contents, PDF pages or Video duration are known.",
      "Use an x402-capable client to request the product-specific endpoint returned by the quote/options response.",
      "Read unlockToken from the paid JSON response.",
      "Optionally call verify_unlock_token with consume=false.",
      "Retry the same process_images/process_with_settings/process_video/process_video_with_settings call with unlockToken.",
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
