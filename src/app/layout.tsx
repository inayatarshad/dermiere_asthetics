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
  title: "Contour · Aesthetic Clinic OS",
  description:
    "The consultation system for modern aesthetic clinics: 3D face canvas, AI before/after visualization, treatment plans, and beautiful patient reports.",
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
