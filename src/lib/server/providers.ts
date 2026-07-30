/**
 * Model-agnostic image-edit service (05_ai-before-after.md §3):
 * one internal generateAfter(beforeImage, prompt) contract, providers behind
 * it. Gemini (Nano Banana family) is the primary for identity preservation;
 * OpenAI (GPT Image 2) and FLUX.1 Kontext are wired as alternatives so the
 * clinic can run the KB's bake-off and pick per procedure. Swap or reorder
 * via env without touching the UI.
 *
 * Env:
 *   GEMINI_API_KEY       - enables the Gemini provider
 *   GEMINI_IMAGE_MODEL   - default "gemini-2.5-flash-image" (Nano Banana);
 *                          set "gemini-3-pro-image" (Nano Banana Pro) when
 *                          your key has access
 *   OPENAI_API_KEY       - enables the OpenAI (GPT Image 2) provider
 *   OPENAI_IMAGE_MODEL   - default "gpt-image-1"; set "gpt-image-2" when
 *                          available on your account
 *   BFL_API_KEY          - enables the FLUX.1 Kontext provider
 *   BFL_MODEL            - default "flux-kontext-pro"
 *   HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET
 *                        - enable the Higgsfield Cloud provider
 *                          (platform.higgsfield.ai; needs API credits, a
 *                          separate wallet from the app subscription)
 *   HIGGSFIELD_IMAGE_MODEL - default "higgsfield-ai/soul/reference"
 *   AI_PROVIDER          - force "gemini" | "openai" | "flux" | "higgsfield"
 *                          (optional). Set this to run a like-for-like
 *                          bake-off.
 *
 * Auto-detect priority when AI_PROVIDER is unset: gemini → openai → flux →
 * higgsfield. Any others that are configured act as automatic fallbacks
 * (except on a content-moderation block, which is not retried across
 * providers).
 */

export type Provider = "gemini" | "openai" | "flux" | "higgsfield";

export interface GenerateResult {
  imageBase64: string;
  mimeType: string;
  model: string;
  provider: Provider;
}

export class GenerationError extends Error {
  constructor(
    public code:
      | "no_api_key"
      | "safety_blocked"
      | "no_image_returned"
      | "provider_error"
      | "timeout",
    message: string
  ) {
    super(message);
  }
}

interface ImageInput {
  base64: string;
  mimeType: string;
}

function keyFor(p: Provider): string | undefined {
  if (p === "gemini") return process.env.GEMINI_API_KEY;
  if (p === "openai") return process.env.OPENAI_API_KEY;
  if (p === "higgsfield") {
    // key id + secret travel as one "id:secret" credential
    const id = process.env.HIGGSFIELD_API_KEY;
    const secret = process.env.HIGGSFIELD_API_SECRET;
    return id && secret ? `${id}:${secret}` : undefined;
  }
  return process.env.BFL_API_KEY;
}

/** Configured providers in auto-detect priority order. */
function configuredProviders(): Provider[] {
  return (["gemini", "openai", "flux", "higgsfield"] as Provider[]).filter(
    (p) => keyFor(p)
  );
}

/**
 * Selectable models per provider (admin GUI "model picker"). The first
 * entry is the default when no env override is set. Server-side whitelist:
 * client-requested models outside this list are ignored, so arbitrary
 * strings can never reach a provider URL.
 */
export const MODEL_OPTIONS: Record<Provider, string[]> = {
  gemini: ["gemini-2.5-flash-image", "gemini-3-pro-image"],
  openai: ["gpt-image-1", "gpt-image-2"],
  flux: ["flux-kontext-pro", "flux-kontext-max"],
  // popcorn/auto = Higgsfield's identity-consistent photo model - verified
  // 2026-07-23 against the live API: returns the SAME person with the
  // requested edit (default, and the only account-tier edit-grade model;
  // reve/edit answers 423 model_blocked on standard API accounts).
  // soul modes are reference-guided RENDERS - they generate a different
  // person and are kept only for the Settings bake-off comparison.
  higgsfield: [
    "higgsfield-ai/popcorn/auto",
    "reve/edit",
    "higgsfield-ai/soul/reference",
    "higgsfield-ai/soul/character",
  ],
};

const MODEL_ENV: Record<Provider, string | undefined> = {
  get gemini() {
    return process.env.GEMINI_IMAGE_MODEL;
  },
  get openai() {
    return process.env.OPENAI_IMAGE_MODEL;
  },
  get flux() {
    return process.env.BFL_MODEL;
  },
  get higgsfield() {
    return process.env.HIGGSFIELD_IMAGE_MODEL;
  },
};

function defaultModelFor(p: Provider): string {
  return MODEL_ENV[p] || MODEL_OPTIONS[p][0];
}

export function activeProvider(): Provider | null {
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  if (forced && keyFor(forced)) return forced;
  return configuredProviders()[0] ?? null;
}

/**
 * Safe status for the admin GUI: which providers have keys on the server
 * and which models they resolve to. Never exposes key material.
 */
export function providerStatus() {
  return {
    configured: {
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      flux: !!process.env.BFL_API_KEY,
      higgsfield: !!keyFor("higgsfield"),
    },
    active: activeProvider(),
    envForced: (process.env.AI_PROVIDER as Provider | undefined) ?? null,
    models: {
      gemini: defaultModelFor("gemini"),
      openai: defaultModelFor("openai"),
      flux: defaultModelFor("flux"),
      higgsfield: defaultModelFor("higgsfield"),
    },
    /** Whitelisted choices for the admin model picker. */
    options: MODEL_OPTIONS,
  };
}

const RUNNERS: Record<
  Provider,
  (image: ImageInput, prompt: string, model?: string) => Promise<GenerateResult>
> = {
  gemini: generateWithGemini,
  openai: generateWithOpenAI,
  flux: generateWithFlux,
  higgsfield: generateWithHiggsfield,
};

export async function generateAfter(
  image: ImageInput,
  prompt: string,
  /** Per-request provider choice from the admin GUI; overrides env. */
  requested?: Provider,
  /** Admin-selected model per provider; must be in MODEL_OPTIONS. */
  modelChoices?: Partial<Record<Provider, string>>
): Promise<GenerateResult> {
  const envForced = process.env.AI_PROVIDER as Provider | undefined;
  // A GUI-requested provider runs alone (that's the point of a bake-off);
  // an env-forced provider likewise. Otherwise try each configured provider
  // in priority order, falling through on non-moderation failures.
  let chain: Provider[];
  if (requested && keyFor(requested)) {
    chain = [requested];
  } else if (requested) {
    // A stale browser/Settings pin must never kill generation: if the
    // requested provider has no key, run whatever IS configured instead.
    // The response reports the provider that actually ran.
    chain = configuredProviders();
    if (chain.length === 0) {
      throw new GenerationError(
        "no_api_key",
        `${requested} is selected in Settings but has no key on the server, and no other provider is configured. Set the matching env var (see .env.example).`
      );
    }
  } else if (envForced && keyFor(envForced)) {
    chain = [envForced];
  } else {
    chain = configuredProviders();
  }
  if (chain.length === 0) {
    throw new GenerationError(
      "no_api_key",
      "No image model configured. Set GEMINI_API_KEY (or OPENAI_API_KEY / BFL_API_KEY / HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET) in the environment."
    );
  }
  let lastErr: unknown;
  for (const p of chain) {
    // whitelist enforcement: an unknown model string is silently dropped
    const choice = modelChoices?.[p];
    const model =
      choice && MODEL_OPTIONS[p].includes(choice) ? choice : undefined;
    try {
      return await RUNNERS[p](image, prompt, model);
    } catch (err) {
      lastErr = err;
      // A moderation block will recur on every provider - surface it now.
      if (err instanceof GenerationError && err.code === "safety_blocked") {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new GenerationError("provider_error", "All configured providers failed.");
}

// ---------------------------------------------------------------------
// Gemini (Nano Banana family) - REST generateContent with inline image
// ---------------------------------------------------------------------

async function generateWithGemini(
  image: ImageInput,
  prompt: string,
  modelChoice?: string
): Promise<GenerateResult> {
  const model = modelChoice ?? defaultModelFor("gemini");
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GenerationError(
      "provider_error",
      `Gemini API error ${res.status}: ${body.slice(0, 400)}`
    );
  }

  const data = (await res.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new GenerationError(
      "safety_blocked",
      `Generation blocked by safety filters (${data.promptFeedback.blockReason}).`
    );
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData) {
    const reason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new GenerationError(
      "no_image_returned",
      `Model returned no image (finishReason: ${reason}).`
    );
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
    model,
    provider: "gemini",
  };
}

// ---------------------------------------------------------------------
// OpenAI GPT Image 2 - images/edits (multipart). Strong spatial reasoning;
// input_fidelity:"high" is the key lever for keeping the patient's face.
// ---------------------------------------------------------------------

async function generateWithOpenAI(
  image: ImageInput,
  prompt: string,
  modelChoice?: string
): Promise<GenerateResult> {
  const key = process.env.OPENAI_API_KEY!;
  const model = modelChoice ?? defaultModelFor("openai");

  const buffer = Buffer.from(image.base64, "base64");
  const ext = image.mimeType === "image/png" ? "png" : "jpg";
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("input_fidelity", "high"); // preserve input face/details
  form.append(
    "image",
    new Blob([buffer], { type: image.mimeType }),
    `before.${ext}`
  );

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (
      res.status === 400 &&
      /moderation|safety|content[_ ]policy/i.test(body)
    ) {
      throw new GenerationError(
        "safety_blocked",
        "Generation blocked by OpenAI content moderation."
      );
    }
    throw new GenerationError(
      "provider_error",
      `OpenAI API error ${res.status}: ${body.slice(0, 400)}`
    );
  }

  const data = (await res.json()) as {
    data?: { b64_json?: string }[];
  };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new GenerationError("no_image_returned", "OpenAI returned no image.");
  }
  return {
    imageBase64: b64,
    mimeType: "image/png",
    model,
    provider: "openai",
  };
}

// ---------------------------------------------------------------------
// Higgsfield Cloud (platform.higgsfield.ai) - upload + submit + poll.
// Auth: "Authorization: Key {id}:{secret}". Input images travel as URLs
// via the platform's presigned-upload flow (POST /files/generate-upload-url
// -> PUT bytes -> reference public_url). Job lifecycle: POST /{model_id}
// -> {request_id, status_url} -> GET status until
// queued|in_progress -> completed|failed|nsfw|canceled.
//
// The public docs do not pin the reference-image field name for
// soul/reference, so the submit tries a small ladder of candidate fields;
// a FastAPI 422 names the offending field, the first accepted name is
// pinned for the life of the server instance, and a hard failure surfaces
// the validation detail verbatim for a one-line fix.
// ---------------------------------------------------------------------

const HF_BASE = "https://platform.higgsfield.ai";
// Candidate names for the reference-image field. Shape matters as much as
// name: popcorn/auto takes image_urls as an ARRAY - and it also VALIDATES
// the singular image_url without consuming it (job queues, then fails), so
// for popcorn the plural form must be tried FIRST or discovery pins the
// wrong field. Soul (and reve, where unblocked) take the singular image_url.
interface HfImageField {
  name: string;
  array: boolean;
}
const HF_IMAGE_FIELDS: HfImageField[] = [
  { name: "image_urls", array: true },
  { name: "image_url", array: false },
  { name: "image", array: false },
  { name: "reference_image_url", array: false },
];
// discovered per model (verified 2026-07-23: popcorn=image_urls[], soul=image_url)
const hfPinnedImageField = new Map<string, HfImageField>();

function hfFieldCandidates(model: string): HfImageField[] {
  const pinned = hfPinnedImageField.get(model);
  if (pinned) return [pinned];
  return /popcorn/.test(model)
    ? HF_IMAGE_FIELDS
    : [...HF_IMAGE_FIELDS.slice(1), HF_IMAGE_FIELDS[0]];
}

function hfAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${keyFor("higgsfield")!}`,
    "Content-Type": "application/json",
  };
}

/** Map Higgsfield error bodies to actionable GenerationErrors. */
function hfError(status: number, body: string): GenerationError {
  if (/not_enough_credits/i.test(body)) {
    return new GenerationError(
      "provider_error",
      "The Higgsfield account has no API credits. API credits are a separate wallet from the app subscription; top up under Billing at cloud.higgsfield.ai, then retry."
    );
  }
  if (status === 401 || status === 403) {
    return new GenerationError(
      "no_api_key",
      "Higgsfield rejected the API credentials. Check HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET."
    );
  }
  // 423 Locked / model_blocked: the model itself is gated for the account,
  // regardless of the photo or prompt (verified: a plain gray square gets
  // the same 423 on reve/edit). Point the admin at the model that works.
  if (status === 423 || /model_blocked/i.test(body)) {
    return new GenerationError(
      "provider_error",
      "Higgsfield has locked the selected model for this account (model_blocked) - reve/edit is not available on standard API accounts. Use 'higgsfield-ai/popcorn/auto' (the default; verified identity-preserving photo edit) under Settings -> AI generation, or set GEMINI_API_KEY as an alternative."
    );
  }
  return new GenerationError(
    "provider_error",
    `Higgsfield API error ${status}: ${body.slice(0, 400)}`
  );
}

async function hfUploadImage(image: ImageInput): Promise<string> {
  const res = await fetch(`${HF_BASE}/files/generate-upload-url`, {
    method: "POST",
    headers: hfAuthHeaders(),
    body: JSON.stringify({ content_type: image.mimeType }),
  });
  if (!res.ok) {
    throw hfError(res.status, await res.text().catch(() => ""));
  }
  const { public_url, upload_url } = (await res.json()) as {
    public_url?: string;
    upload_url?: string;
  };
  if (!public_url || !upload_url) {
    throw new GenerationError(
      "provider_error",
      "Higgsfield did not return an upload URL."
    );
  }
  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": image.mimeType },
    body: Buffer.from(image.base64, "base64"),
  });
  if (!put.ok) {
    throw new GenerationError(
      "provider_error",
      `Higgsfield image upload failed (${put.status}).`
    );
  }
  return public_url;
}

async function generateWithHiggsfield(
  image: ImageInput,
  prompt: string,
  modelChoice?: string
): Promise<GenerateResult> {
  const model = modelChoice ?? defaultModelFor("higgsfield");
  const imageUrl = await hfUploadImage(image);
  try {
    return await hfRunModel(imageUrl, prompt, model);
  } catch (err) {
    // A gated model (423 model_blocked) is an account-tier fact, not a
    // transient failure - recover onto the known-good whitelist default
    // (popcorn) instead of failing the consult with a stale model pin.
    // Never retries moderation blocks (those are safety_blocked).
    const fallback = MODEL_OPTIONS.higgsfield[0];
    if (
      err instanceof GenerationError &&
      err.code === "provider_error" &&
      /model_blocked/.test(err.message) &&
      model !== fallback
    ) {
      return await hfRunModel(imageUrl, prompt, fallback);
    }
    throw err;
  }
}

async function hfRunModel(
  imageUrl: string,
  prompt: string,
  model: string
): Promise<GenerateResult> {
  // submit, discovering the reference-image field (name + shape) if not
  // yet pinned for this model
  const fields = hfFieldCandidates(model);
  let submitted: { request_id?: string; status_url?: string } | null = null;
  let lastDetail = "";
  for (const field of fields) {
    const res = await fetch(`${HF_BASE}/${model}`, {
      method: "POST",
      headers: hfAuthHeaders(),
      body: JSON.stringify({
        prompt,
        [field.name]: field.array ? [imageUrl] : imageUrl,
      }),
    });
    if (res.ok) {
      hfPinnedImageField.set(model, field);
      submitted = (await res.json()) as {
        request_id?: string;
        status_url?: string;
      };
      break;
    }
    const body = await res.text().catch(() => "");
    // Validation styles vary per model family: FastAPI 422 detail arrays
    // (soul) or 400 "'x' is a required property" strings (reve). Anything
    // else is a hard provider error.
    if (res.status !== 422 && res.status !== 400) throw hfError(res.status, body);
    lastDetail = body;
    // If the complaint is about the request shape, try the next candidate
    // image field name; otherwise surface the validation detail verbatim
    // (it lists exactly what the model expects).
    if (!/missing|required property|extra_forbidden|unexpected/i.test(body)) {
      throw new GenerationError(
        "provider_error",
        `Higgsfield rejected the request shape: ${body.slice(0, 400)}`
      );
    }
  }
  if (!submitted) {
    throw new GenerationError(
      "provider_error",
      `Higgsfield rejected all known request shapes. Last validation detail: ${lastDetail.slice(0, 400)}`
    );
  }
  if (!submitted.request_id) {
    throw new GenerationError(
      "provider_error",
      "Higgsfield returned no request id."
    );
  }

  const statusUrl =
    submitted.status_url ??
    `${HF_BASE}/requests/${submitted.request_id}/status`;
  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(statusUrl, {
      headers: { Authorization: `Key ${keyFor("higgsfield")!}` },
    });
    if (!poll.ok) continue;
    const status = (await poll.json()) as {
      status: string;
      images?: { url?: string }[];
    };
    if (status.status === "completed") {
      const url = status.images?.[0]?.url;
      if (!url) {
        throw new GenerationError(
          "no_image_returned",
          "Higgsfield completed without an image."
        );
      }
      const img = await fetch(url);
      if (!img.ok) {
        throw new GenerationError(
          "provider_error",
          `Could not download the Higgsfield result (${img.status}).`
        );
      }
      const buf = Buffer.from(await img.arrayBuffer());
      const mime = img.headers.get("content-type") ?? "image/jpeg";
      return {
        imageBase64: buf.toString("base64"),
        mimeType: mime.split(";")[0],
        model,
        provider: "higgsfield",
      };
    }
    if (status.status === "nsfw") {
      throw new GenerationError(
        "safety_blocked",
        "Generation blocked by Higgsfield's content moderation."
      );
    }
    if (status.status === "failed" || status.status === "canceled") {
      throw new GenerationError(
        "provider_error",
        `Higgsfield generation ${status.status}.`
      );
    }
  }
  throw new GenerationError("timeout", "Higgsfield generation timed out.");
}

// ---------------------------------------------------------------------
// FLUX.1 Kontext (Black Forest Labs) - submit + poll
// ---------------------------------------------------------------------

async function generateWithFlux(
  image: ImageInput,
  prompt: string,
  modelChoice?: string
): Promise<GenerateResult> {
  const key = process.env.BFL_API_KEY!;
  const model = modelChoice ?? defaultModelFor("flux");

  const submit = await fetch(`https://api.bfl.ai/v1/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-key": key },
    body: JSON.stringify({
      prompt,
      input_image: image.base64,
      output_format: "jpeg",
      safety_tolerance: 2,
    }),
  });

  if (!submit.ok) {
    const body = await submit.text().catch(() => "");
    throw new GenerationError(
      "provider_error",
      `FLUX submit error ${submit.status}: ${body.slice(0, 400)}`
    );
  }

  const { polling_url } = (await submit.json()) as { polling_url: string };
  if (!polling_url) {
    throw new GenerationError("provider_error", "FLUX returned no polling URL.");
  }

  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(polling_url, { headers: { "x-key": key } });
    if (!poll.ok) continue;
    const status = (await poll.json()) as {
      status: string;
      result?: { sample?: string };
    };
    if (status.status === "Ready" && status.result?.sample) {
      const img = await fetch(status.result.sample);
      const buf = Buffer.from(await img.arrayBuffer());
      return {
        imageBase64: buf.toString("base64"),
        mimeType: "image/jpeg",
        model,
        provider: "flux",
      };
    }
    if (
      status.status === "Content Moderated" ||
      status.status === "Request Moderated"
    ) {
      throw new GenerationError(
        "safety_blocked",
        "Generation blocked by the provider's content moderation."
      );
    }
    if (status.status === "Error" || status.status === "Failed") {
      throw new GenerationError("provider_error", "FLUX generation failed.");
    }
  }
  throw new GenerationError("timeout", "FLUX generation timed out.");
}
