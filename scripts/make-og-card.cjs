/**
 * Generates the CAPTURE WhatsApp/OG link card (public/og-card.jpg).
 * Noir stage, champagne-gold logo, brand tagline. Rerun after any
 * brand change: node scripts/make-og-card.cjs
 */
const sharp = require("sharp");

(async () => {
  // gold-tinted CAPTURE logo from the black master
  const logoBuf = await sharp("public/brand/capture-logo-black-xl.png")
    .resize(640, null, { fit: "inside" })
    .toBuffer();
  const { data, info } = await sharp(logoBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 235;
    data[i + 1] = 211;
    data[i + 2] = 160;
  }
  const gold = await sharp(data, { raw: info }).png().toBuffer();
  const gm = await sharp(gold).metadata();

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="22%" cy="10%" r="95%">
        <stop offset="0%" stop-color="#2E2A22"/>
        <stop offset="55%" stop-color="#1E1B16"/>
        <stop offset="100%" stop-color="#161411"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <rect x="0" y="0" width="1200" height="5" fill="#C4A15A"/>
    <rect x="0" y="625" width="1200" height="5" fill="#C4A15A"/>
    <text x="600" y="392" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="27" letter-spacing="10" fill="#F2E7CE">THE INTIMATE SCIENCE OF BEAUTY</text>
    <text x="600" y="465" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="19" letter-spacing="6" fill="#9A927F">EXOMERE  ·  MITOREDLIGHT THERAPY  ·  CLINIC OS</text>
    <text x="600" y="560" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="16" letter-spacing="4" fill="#6F685C">M.M. ALAM ROAD, LAHORE  ·  CAPTURE.CC</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .composite([
      { input: gold, left: Math.round((1200 - gm.width) / 2), top: 195 },
    ])
    .jpeg({ quality: 82 })
    .toFile("public/og-card.jpg");
  console.log("og-card.jpg written", gm.width, "x", gm.height, "logo");
})();
