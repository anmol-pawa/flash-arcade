import { Inter, JetBrains_Mono, Orbitron } from "next/font/google";

export const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--font-orbitron" });
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

/** Resolved family name, for canvas text in the PixiJS stage. */
export const orbitronFamily = orbitron.style.fontFamily;
