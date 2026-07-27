import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import SiteHeader from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flash Arcade — play preserved Flash games",
  description:
    "Play thousands of Flash games preserved by the Internet Archive, emulated in your browser with Ruffle. No plugin, no Flash Player.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-zinc-800/80 px-4 py-6 text-center text-xs text-zinc-600">
            Games streamed from the{" "}
            <a
              href="https://archive.org/details/softwarelibrary_flash_games"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              Internet Archive
            </a>
            . Emulated with{" "}
            <a
              href="https://ruffle.rs"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              Ruffle
            </a>
            .
          </footer>
        </Providers>
      </body>
    </html>
  );
}
