// Higgsfield AI image-generation client — server-only.
//
// Used today by scripts/generate-gallery-images.js to produce candidate lifestyle
// (framed-print-on-a-wall) images for manual review before upload to the
// `gallery-lifestyle` Supabase bucket (see app/api/gallery-lifestyle-samples/route.ts).
// No in-app API route uses this yet — kept here rather than in scripts/ (which is
// entirely gitignored) so the same client can be reused for live generation and for
// the social media content pipeline later.
import "server-only";

const HIGGSFIELD_API_BASE_URL = "https://api.higgsfield.ai";

export function higgsfieldConfigured() {
  return Boolean(
    process.env.HIGGSFIELD_API_KEY_ID && process.env.HIGGSFIELD_API_KEY_SECRET
  );
}

export class HiggsfieldApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Higgsfield API error (${status}): ${JSON.stringify(body)}`);
    this.name = "HiggsfieldApiError";
    this.status = status;
    this.body = body;
  }
}

async function higgsfieldFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new HiggsfieldApiError(0, "Higgsfield is not configured (missing API key).");
  }

  const response = await fetch(`${HIGGSFIELD_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${keyId}:${keySecret}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new HiggsfieldApiError(response.status, body);
  }

  return body as T;
}

export type GenerateImageRequest = {
  prompt: string;
  // Passed through as-is on top of `prompt` — e.g. aspect ratio or style params.
  // Left untyped here since we haven't yet pinned down which fields the "soul/v2/standard"
  // model actually accepts beyond `prompt`; confirm against a live response before relying
  // on any of them.
  [key: string]: unknown;
};

export type GenerateImageResponse = {
  status: string;
  request_id: string;
  status_url: string;
  cancel_url?: string;
};

export function generateImage(request: GenerateImageRequest) {
  return higgsfieldFetch<GenerateImageResponse>("/higgsfield-ai/soul/v2/standard", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export type GenerationStatus = {
  status: "queued" | "processing" | "completed" | "failed" | string;
  request_id: string;
  // Shape of completed output not yet confirmed live — treat as unknown until a real
  // response has been inspected, then narrow this type.
  [key: string]: unknown;
};

export function getGenerationStatus(statusUrl: string) {
  // statusUrl is the absolute URL Higgsfield returns from generateImage() — call it
  // directly rather than re-deriving a path, since its shape isn't documented as stable.
  const path = statusUrl.startsWith(HIGGSFIELD_API_BASE_URL)
    ? statusUrl.slice(HIGGSFIELD_API_BASE_URL.length)
    : statusUrl;
  return higgsfieldFetch<GenerationStatus>(path);
}
