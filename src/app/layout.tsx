import type { Metadata, Viewport } from "next";
import { Anek_Bangla, Noto_Serif_Bengali } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { HTML_LANG } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

// Anek Bangla for everything (with the width axis for the narrow numerals); Noto Serif Bengali
// only in the red cover and the seal (design/DIRECTION.md).
const anek = Anek_Bangla({ variable: "--font-anek", subsets: ["bengali", "latin"], axes: ["wdth"], display: "swap" });
const serif = Noto_Serif_Bengali({ variable: "--font-serif-bn", subsets: ["bengali", "latin"], weight: ["700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Scriba", template: "%s · Scriba" },
  applicationName: "Scriba",
  description:
    "Scriba reads photographs of handwritten Bangla shop ledgers with a Meta model, checks the arithmetic in code, and lets the shopkeeper correct and confirm every entry.",
  appleWebApp: { capable: true, title: "Scriba", statusBarStyle: "default" },
  icons: { icon: { url: "/icons/icon.svg", type: "image/svg+xml" }, apple: "/icons/apple-icon-180.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf5eb",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className={`${anek.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="binding" aria-hidden="true" />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
