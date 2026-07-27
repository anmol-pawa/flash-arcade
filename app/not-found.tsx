import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-zinc-100">Nothing here</h1>
      <p className="text-sm leading-relaxed text-zinc-400">
        That page doesn&apos;t exist — or the Archive item you asked for has no playable
        SWF inside it.
      </p>
      <Link
        href="/"
        className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        Back to the arcade
      </Link>
    </div>
  );
}
