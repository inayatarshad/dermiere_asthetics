import type { Metadata, Viewport } from "next";
import { Jost, Fraunces } from "next/font/google";
import { BrandSplash } from "@/components/BrandSplash";
import "./globals.css";

// CAPTURE brand face - geometric sans, matches capture.cc
const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

// Serif display for printed clinic artefacts (invoice + assessment letterhead)
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.PUBLIC_BASE_URL || "https://dermiere.vercel.app"
  ),
  title: "Dermiere · Clinic OS",
  description:
    "Dermiere Clinic OS - patients, calendar, point of sale, reviews, and a CRM for leads, follow-ups, shared conversations and feedback. Gulberg and F-11.",
  openGraph: {
    title: "Dermiere · Clinic OS",
    description:
      "Skin, considered. Patients, bookings and point of sale, with a CRM for leads, follow-ups, conversations and feedback.",
    siteName: "Dermiere",
    type: "website",
    images: [
      {
        // JPEG: WhatsApp's scraper is far more reliable with small JPEGs
        url: "/og-card.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Dermiere - skin, considered.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dermiere · Clinic OS",
    description: "Skin, considered.",
    images: ["/og-card.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F9F3E4",
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
      className={`${jost.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-stage">
        {/* in the ROOT layout so the post-login sweep survives the route
            change into the dashboard; SSR-rendered so the reveal masks the
            very first paint on a cold load */}
        <BrandSplash />
        {children}
      </body>
    </html>
  );
}
