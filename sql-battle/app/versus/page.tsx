import BattleScreen from "@/components/battle/BattleScreen";

export const metadata = { title: "Versus — Query Clash" };

export default function VersusPage() {
  return <BattleScreen mode="versus" versusChapter={10} />;
}
