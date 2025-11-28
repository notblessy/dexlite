import type { Metadata } from "next";
import { Quantico } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";

const quantico = Quantico({
  variable: "--font-quantico",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DEXLITE Explorer | Real-time Hyperliquid Transaction Indexer",
  description: "Real-time Hyperliquid transaction indexer by keep_going. Track live transactions, blocks, and price data on the Hyperliquid DEX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Quantico:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${quantico.variable} antialiased`}
        style={{ fontFamily: 'var(--font-quantico)' }}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
