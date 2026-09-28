import type { Metadata, Viewport } from "next";
import "./globals.css";
import { inter, jetbrains, orbitron } from "./fonts";

export const metadata: Metadata = {
  title: "Query Clash — SQL battle arena",
  description: "A 1v1 action battle game that teaches SQL from SELECT to recursive CTEs in both Oracle and PostgreSQL. Your queries are your spells.",
};

export const viewport: Viewport = {
  themeColor: "#07050f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${orbitron.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
