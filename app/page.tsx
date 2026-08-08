import Link from "next/link";
import { Suspense } from "react";
import ArcadeBrowser from "@/components/ArcadeBrowser";
import { DECADES, type DecadeKey } from "@/lib/archive";

function BrowserFallback() {
  return (
    <div className="space-y-6">
      <div className="h-11 animate-pulse rounded-lg bg-zinc-900/80" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="aspect-[4/3] animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60"
          />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Flash didn&apos;t have to die.
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Adobe pulled the plug on Flash Player in December 2020. The games survived
          anyway — preserved by the Internet Archive and playable here through Ruffle,
          an open-source emulator that runs in your browser. No plugin required.
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span>Not sure where to start?</span>
          <Link
            href="/decades"
            className="text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
          >
            Browse the top 30 of each decade
          </Link>
          <span aria-hidden>·</span>
          {(Object.keys(DECADES) as DecadeKey[]).map((key) => (
            <Link
              key={key}
              href={`/decades#${key}`}
              className="text-zinc-400 underline underline-offset-4 hover:text-zinc-200"
            >
              {DECADES[key].label}
            </Link>
          ))}
        </p>
      </section>

      {/* useSearchParams opts its subtree into client rendering, so the hero
          above still ships as prerendered HTML. */}
      <Suspense fallback={<BrowserFallback />}>
        <ArcadeBrowser />
      </Suspense>
    </div>
  );
}
