import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/ui/error-boundary";
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
  title: "МСЕ Следење на Акции | Македонска Берза",
  description: "Цени на акции во реално време и пазарни податоци за Македонската берза (МСЕ). Следете ги движењата на цените, графиконите и сеопфатните информации за акциите.",
  keywords: ["МСЕ", "Македонска берза", "акции", "реално време", "финансии", "Македонија"],
  authors: [{ name: "МСЕ Следење на Акции" }],
  openGraph: {
    title: "МСЕ Следење на Акции",
    description: "Цени на акции во реално време и пазарни податоци за Македонската берза",
    type: "website",
    locale: "mk_MK",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mk">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
