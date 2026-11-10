import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

// The one typeface for the website and the app (variable 200–800, SIL OFL).
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default:
      "VeilProcure | Private bids. Intelligent decisions. Payments you control.",
    template: "%s · VeilProcure",
  },
  description:
    "Confidential procurement for digital services: deadline-sealed supplier quotes, tamper-evident NEAR testnet commitments, deterministic evaluation and buyer-controlled escrow. Public testnet beta.",
};

export const viewport: Viewport = {
  themeColor: "#fafbf9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-paper text-ink" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
