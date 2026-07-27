import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Flash Arcade",
  description: "How Flash Arcade works, and what it can and cannot play.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          How this works
        </h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Adobe ended support for Flash Player on 31 December 2020 and browsers removed
          the plugin entirely. This site doesn&apos;t revive that plugin — it replaces it.{" "}
          <a
            href="https://ruffle.rs"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 underline underline-offset-4"
          >
            Ruffle
          </a>{" "}
          is an open-source Flash emulator written in Rust and compiled to WebAssembly.
          It reads the original <code className="text-zinc-300">.swf</code> file and runs
          its ActionScript itself, entirely inside a browser sandbox.
        </p>
        <p className="text-sm leading-relaxed text-zinc-400">
          The games come from the Internet Archive&apos;s Flash library, which preserved
          thousands of titles before they went offline. Nothing is rehosted here — every
          file is streamed from archive.org on demand.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">What won&apos;t work</h2>
        <p className="text-sm leading-relaxed text-zinc-400">
          Honesty matters more than a marketing claim here. No emulator covers 100% of
          Flash, and some games are simply gone:
        </p>
        <ul className="space-y-2 text-sm leading-relaxed text-zinc-400">
          <li className="flex gap-3">
            <span className="text-zinc-600">—</span>
            <span>
              <strong className="text-zinc-300">Server-dependent games.</strong> Anything
              that needed a login, leaderboard, or game server is unplayable; those
              servers were switched off years ago.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600">—</span>
            <span>
              <strong className="text-zinc-300">Some ActionScript 3 titles.</strong>{" "}
              Ruffle&apos;s AS1/AS2 support is essentially complete; AS3 is well along but
              still has gaps, so a minority of later games fail or misbehave.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600">—</span>
            <span>
              <strong className="text-zinc-300">Mouse-and-keyboard design.</strong> These
              games predate touchscreens. They work on a phone only by accident.
            </span>
          </li>
        </ul>
        <p className="text-sm leading-relaxed text-zinc-400">
          When a game fails, you&apos;ll get a clear message and a link to the original
          Archive item rather than a blank black rectangle.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">Preservation, not piracy</h2>
        <p className="text-sm leading-relaxed text-zinc-400">
          Every game shown here is served from a public Internet Archive collection,
          linked back to its original item page. If you hold rights to something in the
          collection and want it removed, that request goes to the Archive, which
          maintains the library.
        </p>
      </section>
    </div>
  );
}
