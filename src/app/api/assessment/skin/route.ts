/**
 * POST /api/assessment/skin — the AI half of the Assessment Report.
 *
 * Vision analysis of the front photo against a LOCKED skin taxonomy
 * (spec §6/§7: controlled vocabulary, qualitative severity, never a
 * diagnosis). The generative model classifies; it never invents layout or
 * numbers — the report's geometry and rendering stay deterministic.
 *
 * Providers: OpenAI vision (OPENAI_API_KEY, model ASSESSMENT_VISION_MODEL
 * default gpt-4o) with Gemini fallback (GEMINI_API_KEY). Without either
 * key the route answers 501 and the report renders geometry-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { aiGuard, recordAi } from "@/lib/server/usage";

export const maxDuration = 60;
export const runtime = "nodejs";

export const SKIN_TAXONOMY = [
  "pigmentation",
  "uneven_tone",
  "texture",
  "enlarged_pores",
  "redness",
  "under_eye_shadow",
  "fine_lines",
  "laxity",
  "acne",
  "acne_scarring",
  "dullness",
  "dryness",
  "hairline_recession",
] as const;

const REGIONS = [
  "forehead",
  "glabella",
  "eye_area",
  "under_eye",
  "cheeks",
  "nose",
  "perioral",
  "chin",
  "jawline",
  "hairline",
  "full_face",
] as const;

export interface SkinFinding {
  id: (typeof SKIN_TAXONOMY)[number];
  severity: "mild" | "moderate" | "notable";
  region: (typeof REGIONS)[number];
  note: string;
}

export interface SkinAnalysis {
  findings: SkinFinding[];
  strengths: string[];
  provider: string;
}

const INSTRUCTION = `You are a cosmetic skin-assessment assistant for an aesthetic clinic. Study the person's face in the photo and report ONLY what is clearly visible.

Return STRICT JSON matching:
{
  "findings": [{ "id": one of ${JSON.stringify(SKIN_TAXONOMY)}, "severity": "mild"|"moderate"|"notable", "region": one of ${JSON.stringify(REGIONS)}, "note": "one short, kind, factual sentence" }],
  "strengths": ["one to three short positive observations about the skin or features"]
}

Rules:
- 2 to 6 findings maximum; only include what is genuinely visible. If skin is excellent, fewer findings and richer strengths.
- Kind, strengths-first clinical tone. Never diagnostic language, never disease names, never guesses about age, weight or health.
- "hairline_recession" only when temple or frontal recession is clearly visible.
- If image quality prevents assessment, return an empty findings array with a strength noting photo quality limits.
Respond with ONLY the JSON object.`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON in response");
  return JSON.parse(text.slice(start, end + 1));
}

function sanitize(raw: unknown, provider: string): SkinAnalysis {
  const obj = (raw ?? {}) as { findings?: unknown; strengths?: unknown };
  const findings: SkinFinding[] = Array.isArray(obj.findings)
    ? (obj.findings as Record<string, unknown>[])
        .filter(
          (f) =>
            SKIN_TAXONOMY.includes(f.id as SkinFinding["id"]) &&
            ["mild", "moderate", "notable"].includes(f.severity as string)
        )
        .slice(0, 6)
        .map((f) => ({
          id: f.id as SkinFinding["id"],
          severity: f.severity as SkinFinding["severity"],
          region: REGIONS.includes(f.region as SkinFinding["region"])
            ? (f.region as SkinFinding["region"])
            : "full_face",
          note: String(f.note ?? "").slice(0, 200),
        }))
    : [];
  const strengths = Array.isArray(obj.strengths)
    ? (obj.strengths as unknown[])
        .filter((s) => typeof s === "string")
        .map((s) => (s as string).slice(0, 160))
        .slice(0, 3)
    : [];
  return { findings, strengths, provider };
}

async function analyzeWithOpenAI(
  base64: string,
  mime: string
): Promise<SkinAnalysis> {
  const key = process.env.OPENAI_API_KEY!;
  const model = process.env.ASSESSMENT_VISION_MODEL || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTION },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return sanitize(extractJson(text), model);
}

async function analyzeWithGemini(
  base64: string,
  mime: string
): Promise<SkinAnalysis> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mime, data: base64 } },
              { text: INSTRUCTION },
            ],
          },
        ],
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";
  return sanitize(extractJson(text), model);
}

export async function POST(req: NextRequest) {
  const guard = await aiGuard(req, "assessments");
  if (!guard.ok) return guard.response;

  let body: { imageDataUrl?: string };
  try {
    body = (await req.json()) as { imageDataUrl?: string };
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(
    body.imageDataUrl ?? ""
  );
  if (!match) {
    return NextResponse.json(
      { error: "bad_request", message: "imageDataUrl must be a base64 image." },
      { status: 400 }
    );
  }
  const [, mime, base64] = match;
  if (base64.length > 6_000_000) {
    return NextResponse.json(
      { error: "bad_request", message: "Image too large." },
      { status: 413 }
    );
  }

  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasOpenAI && !hasGemini) {
    return NextResponse.json(
      {
        error: "no_api_key",
        message:
          "Skin analysis needs a vision model. Set OPENAI_API_KEY (recommended) or GEMINI_API_KEY on the server; the report's proportion analysis works without it.",
      },
      { status: 501 }
    );
  }

  const attempts: (() => Promise<SkinAnalysis>)[] = [];
  if (hasOpenAI) attempts.push(() => analyzeWithOpenAI(base64, mime));
  if (hasGemini) attempts.push(() => analyzeWithGemini(base64, mime));

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const analysis = await attempt();
      await recordAi(guard.clinicId, "assessments");
      return NextResponse.json(analysis);
    } catch (err) {
      lastErr = err;
    }
  }
  console.error("[assessment/skin]", lastErr);
  return NextResponse.json(
    {
      error: "provider_error",
      message: `Skin analysis failed: ${
        lastErr instanceof Error ? lastErr.message.slice(0, 300) : "unknown"
      }`,
    },
    { status: 502 }
  );
}
