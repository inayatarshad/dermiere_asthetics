/**
 * Model-agnostic image-edit service (05_ai-before-after.md §3):
 * one internal generateAfter(beforeImage, prompt) contract, providers behind
 * it. Gemini (Nano Banana family) is the primary for identity preservation;
 * FLUX.1 Kontext is wired as the fallback. Swap or reorder via env without
 * touching the UI.
 *
 * Env:
 *   GEMINI_API_KEY       — enables the Gemini provider
 *   GEMINI_IMAGE_MODEL   — default "gemini-2.5-flash-image"; point at a
 *                          newer Nano Banana release when your key has access
 *   BFL_API_KEY          — enables the FLUX.1 Kontext fallback
 *   AI_PROVIDER          — force "gemini" | "flux" (optional)
 */

export interface GenerateResult {
  imageBase64: string;
  mimeType: string;
  model: string;
  provider: "gemini" | "flux";
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

export function activeProvider(): "gemini" | "flux" | null {
  const forced = process.env.AI_PROVIDER;
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "flux" && process.env.BFL_API_KEY) return "flux";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.BFL_API_KEY) return "flux";
  return null;
}

export async function generateAfter(
  image: ImageInput,
  prompt: string
): Promise<GenerateResult> {
  const provider = activeProvider();
  if (!provider) {
    throw new GenerationError(
      "no_api_key",
      "No image model configured. Set GEMINI_API_KEY (or BFL_API_KEY) in the environment."
    );
  }
  if (provider === "gemini") {
    try {
      return await generateWithGemini(image, prompt);
    } catch (err) {
      // If Gemini fails and FLUX is available, fall through once.
      if (process.env.BFL_API_KEY && !(err instanceof GenerationError && err.code === "safety_blocked")) {
        return generateWithFlux(image, prompt);
      }
      throw err;
    }
  }
  return generateWithFlux(image, prompt);
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
