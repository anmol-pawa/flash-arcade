import type { Metadata } from "next";
import LocalSwfPlayer from "@/components/LocalSwfPlayer";

export const metadata: Metadata = {
  title: "Play your own SWF — Flash Arcade",
  description:
    "Run a Flash file from your own machine in the browser. Nothing is uploaded.",
};

export default function LocalPage() {
  return <LocalSwfPlayer />;
}
