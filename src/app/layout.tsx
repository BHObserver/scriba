import type { Metadata } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--nf-inter", subsets: ["latin"] });
const bengali = Noto_Sans_Bengali({ variable: "--nf-bengali", subsets: ["bengali", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Scriba — handwritten ledgers into checked digital accounts",
  description:
    "Scriba reads photographs of handwritten Bangla shop ledgers with a Meta model, checks the arithmetic in code, and lets a person correct and confirm every entry.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bengali.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
