import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForgeAI — issues in, reviewed pull requests out",
  description: "An autonomous software engineer that plans, implements, tests in a sandbox, reviews, and opens pull requests you approve.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#05061a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link rel="preload" as="image" href="/galaxy.jpg" fetchPriority="high" />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-star focus:px-4 focus:py-2 focus:text-void">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
