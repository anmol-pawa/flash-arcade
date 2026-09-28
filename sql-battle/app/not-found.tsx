import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <div className="font-display text-6xl font-black text-[var(--accent)] neon-text">ORA-00942</div>
      <p className="text-white/60">table or view does not exist — this page isn&apos;t in the schema.</p>
      <Link href="/" className="text-sm text-white/80 underline">
        Back to the main menu
      </Link>
    </main>
  );
}
