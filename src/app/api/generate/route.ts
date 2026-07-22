/**
 * POST /api/generate — the thin server wrapper around the identity-preserving
 * image-edit model. Keeps API keys server-side; the client only ever sends a
 * downscaled photo + the assembled instruction.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  activeProvider,
  generateAfter,
  GenerationError,
  MODEL_OPTIONS,
  providerStatus,
  type Provider,
} from "@/lib/server/providers";
import { aiGuard, recordAi } from "@/lib/server/usage";

export const maxDuration = 60;
export const runtime = "nodejs";

const PROVIDERS: Provider[] = ["gemini", "openai", "flux", "higgsfield"];

/**
 * Appended server-side to EVERY generation instruction, for every provider.
 * A clinical before/after is only credible when the ONLY difference is the
 * treatment: image models love to re-light, re-frame and beautify, which
 * reads as fake (and hides the actual change). Owner feedback 2026-07-23:
 * "lighting needs to be the same... the woman just got closer to the
 * camera and got glow" — this footer is the fix.
 */
const CONSISTENCY_FOOTER = `TECHNICAL CONSISTENCY — MANDATORY. This image is the "after" half of a clinical before/after pair, so everything except the described treatment result must be IDENTICAL to the original photograph:
- Lighting: exact same color temperature, white balance, exposure, contrast and shadow direction. Do not re-light, brighten or cool the image.
- Framing: exact same crop, zoom, camera distance and head position — the face must occupy the same size and place in the frame. Do not move the subject closer to the camera.
- Background: pixel-identical background, same tone.
- No global beautification: do not add glow, smoothness, radiance or make-up anywhere except where the instruction above explicitly asks. Untreated areas must keep their exact original texture, pores and tone.
- The described treatment changes themselves must be clearly visible when compared side by side with the original.`;

/** Provider availability for the admin Settings GUI. No key material. */
export async function GET() {
  return NextResponse.json(providerStatus());
}

interface GenerateBody {
  imageDataUrl: string;
  prompt: string;
  procedure?: string;
  /** Admin-selected provider ("auto"/absent = server auto-detect). */
  provider?: string;
  /** Admin-selected model per provider; validated against MODEL_OPTIONS. */
  models?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const guard = await aiGuard(req, "generations");
  if (!guard.ok) return guard.response;

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { imageDataUrl, prompt } = body;
  if (!imageDataUrl || !prompt) {
    return NextResponse.json(
      { error: "bad_request", message: "imageDataUrl and prompt are required." },
      { status: 400 }
    );
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(
    imageDataUrl
  );
  if (!match) {
    return NextResponse.json(
      { error: "bad_request", message: "imageDataUrl must be a base64 image data URL." },
      { status: 400 }
    );
  }
  const [, mimeType, base64] = match;
  if (base64.length > 6_000_000) {
    return NextResponse.json(
      { error: "bad_request", message: "Image too large. Downscale before sending." },
      { status: 413 }
    );
  }
  if (prompt.length > 4000) {
    return NextResponse.json(
      { error: "bad_request", message: "Prompt too long." },
      { status: 400 }
    );
  }

  const requested = PROVIDERS.includes(body.provider as Provider)
    ? (body.provider as Provider)
    : undefined;

  // model choices: keep only known provider keys with whitelisted values
  const modelChoices: Partial<Record<Provider, string>> = {};
  if (body.models && typeof body.models === "object") {
    for (const p of PROVIDERS) {
      const m = body.models[p];
      if (typeof m === "string" && MODEL_OPTIONS[p].includes(m)) {
        modelChoices[p] = m;
      }
    }
  }

  if (!requested && !activeProvider()) {
    return NextResponse.json(
      {
        error: "no_api_key",
        message:
          "No image model configured on the server. Set GEMINI_API_KEY (or OPENAI_API_KEY / BFL_API_KEY / HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET) to enable photoreal AI generation.",
      },
      { status: 501 }
    );
  }

  try {
    const result = await generateAfter(
      { base64, mimeType },
      `${prompt}\n\n${CONSISTENCY_FOOTER}`,
      requested,
      modelChoices
    );
    await recordAi(guard.clinicId, "generations");
    return NextResponse.json({
      image: `data:${result.mimeType};base64,${result.imageBase64}`,
      model: result.model,
      provider: result.provider,
    });
  } catch (err) {
    if (err instanceof GenerationError) {
      const status =
        err.code === "no_api_key" ? 501 : err.code === "timeout" ? 504 : 502;
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status }
      );
    }
    console.error("[generate] unexpected error", err);
    return NextResponse.json(
      { error: "provider_error", message: "Unexpected generation failure." },
      { status: 502 }
    );
  }
}
