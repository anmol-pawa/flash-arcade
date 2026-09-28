import { notFound } from "next/navigation";
import BattleScreen from "@/components/battle/BattleScreen";
import { CHAPTERS } from "@/content/chapters";

export function generateStaticParams() {
  return CHAPTERS.map((c) => ({ chapter: String(c.n) }));
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  const c = CHAPTERS.find((x) => String(x.n) === chapter);
  return { title: c ? `${c.bossName} — Query Clash` : "Query Clash" };
}

export default async function BattlePage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  const n = Number(chapter);
  if (!CHAPTERS.some((c) => c.n === n)) notFound();
  return <BattleScreen mode="campaign" chapter={n} />;
}
