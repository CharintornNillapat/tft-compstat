import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Shortcuts } from "@/components/shortcuts";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "TFT CompStat", template: "%s · TFT CompStat" },
  description: "Personal TFT companion: curated meta comps, tier lists and recent match stats.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <Shortcuts />
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-4">{children}</main>
      </body>
    </html>
  );
}
