import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-zinc-100">
          <span
            className="grid h-7 w-7 place-items-center rounded bg-emerald-500 text-sm font-bold text-zinc-950"
            aria-hidden
          >
            F
          </span>
          Flash Arcade
        </Link>

        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/" className="text-zinc-400 transition hover:text-white">
            Browse
          </Link>
          <Link href="/decades" className="text-zinc-400 transition hover:text-white">
            By decade
          </Link>
          <Link href="/favorites" className="text-zinc-400 transition hover:text-white">
            My shelf
          </Link>
          <Link href="/local" className="text-zinc-400 transition hover:text-white">
            Your files
          </Link>
          <Link href="/about" className="text-zinc-400 transition hover:text-white">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
