import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

// Serif display for printed clinic artefacts (assessment letterhead)
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.PUBLIC_BASE_URL || "https://aesthetics-mu.vercel.app"
  ),
  title: "Contour AI · Aesthetic Clinic OS",
  description:
    "The consultation, made visible. 3D face canvas, AI before/after visualization, aesthetic assessment reports and treatment plans - by TechGIS.",
  openGraph: {
    title: "Contour AI",
    description:
      "The consultation, made visible. 3D face canvas, AI before/after and aesthetic assessment reports - by TechGIS.",
    siteName: "Contour AI",
    type: "website",
    images: [
      {
        // JPEG: WhatsApp's scraper is far more reliable with small JPEGs
        // than with PNGs; 64KB scrapes instantly on any connection
        url: "/og-card.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Contour AI - The consultation, made visible. By TechGIS.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contour AI",
    description: "The consultation, made visible. By TechGIS.",
    images: ["/og-card.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#E6FAF5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-stage">{children}</body>
    </html>
  );
}
