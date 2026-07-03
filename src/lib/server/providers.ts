/**
 * Model-agnostic image-edit service (05_ai-before-after.md §3):
 * one internal generateAfter(beforeImage, prompt) contract, providers behind
 * it. Gemini (Nano Banana family) is the primary for identity preservation;
 * OpenAI (GPT Image 2) and FLUX.1 Kontext are wired as alternatives so the
 * clinic can run the KB's bake-off and pick per procedure. Swap or reorder
 * via env without touching the UI.
 *
 * Env:
 *   GEMINI_API_KEY       — enables the Gemini provider
 *   GEMINI_IMAGE_MODEL   — default "gemini-2.5-flash-image" (Nano Banana);
 *                          set "gemini-3-pro-image" (Nano Banana Pro) when
 *                          your key has access
 *   OPENAI_API_KEY       — enables the OpenAI (GPT Image 2) provider
 *   OPENAI_IMAGE_MODEL   — default "gpt-image-1"; set "gpt-image-2" when
 *                          available on your account
 *   BFL_API_KEY          — enables the FLUX.1 Kontext provider
 *   BFL_MODEL            — default "flux-kontext-pro"
 *   AI_PROVIDER          — force "gemini" | "openai" | "flux" (optional).
 *                          Set this to run a like-for-like bake-off.
 *
 * Auto-detect priority when AI_PROVIDER is unset: gemini → openai → flux.
 * Any others that are configured act as automatic fallbacks (except on a
 * content-moderation block, which is not retried across providers).
 */

export type Provider = "gemini" | "openai" | "flux";

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
  return process.env.BFL_API_KEY;
}

/** Configured providers in auto-detect priority order. */
function configuredProviders(): Provider[] {
  return (["gemini", "openai", "flux"] as Provider[]).filter((p) => keyFor(p));
}

export function activeProvider(): Provider | null {
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  if (forced && keyFor(forced)) return forced;
  return configuredProviders()[0] ?? null;
}

const RUNNERS: Record<
  Provider,
  (image: ImageInput, prompt: string) => Promise<GenerateResult>
> = {
  gemini: generateWithGemini,
  openai: generateWithOpenAI,
  flux: generateWithFlux,
};

export async function generateAfter(
  image: ImageInput,
  prompt: string
): Promise<GenerateResult> {
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  // Forced provider runs alone; otherwise try each configured provider in
  // priority order, falling through on non-moderation failures.
  const chain =
    forced && keyFor(forced) ? [forced] : configuredProviders();
  if (chain.length === 0) {
    throw new GenerationError(
      "no_api_key",
      "No image model configured. Set GEMINI_API_KEY (or OPENAI_API_KEY / BFL_API_KEY) in the environment."
    );
  }
  let lastErr: unknown;
  for (const p of chain) {
    try {
      return await RUNNERS[p](image, prompt);
    } catch (err) {
      lastErr = err;
      // A moderation block will recur on every provider — surface it now.
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
// Gemini (Nano Banana family) — REST generateContent with inline image
// ---------------------------------------------------------------------

async function generateWithGemini(
  image: ImageInput,
  prompt: string
): Promise<GenerateResult> {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
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
// OpenAI GPT Image 2 — images/edits (multipart). Strong spatial reasoning;
// input_fidelity:"high" is the key lever for keeping the patient's face.
// ---------------------------------------------------------------------

async function generateWithOpenAI(
  image: ImageInput,
  prompt: string
): Promise<GenerateResult> {
  const key = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

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
// FLUX.1 Kontext (Black Forest Labs) — submit + poll
// ---------------------------------------------------------------------

async function generateWithFlux(
  image: ImageInput,
  prompt: string
): Promise<GenerateResult> {
  const key = process.env.BFL_API_KEY!;
  const model = process.env.BFL_MODEL || "flux-kontext-pro";

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
