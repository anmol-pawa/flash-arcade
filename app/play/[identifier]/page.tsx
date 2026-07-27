import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { detailsUrl, getGame } from "@/lib/archive";
import GameStage from "@/components/GameStage";

export async function generateMetadata(
  props: PageProps<"/play/[identifier]">
): Promise<Metadata> {
  const { identifier } = await props.params;
  const game = await getGame(identifier);
  if (!game) return { title: "Game not found — Flash Arcade" };
  return {
    title: `${game.title} — Flash Arcade`,
    description: game.description?.slice(0, 200) ?? `Play ${game.title} in your browser.`,
  };
}

export default async function PlayPage(props: PageProps<"/play/[identifier]">) {
  const { identifier } = await props.params;
  const game = await getGame(identifier);

  // Either the identifier is wrong or the item holds no SWF to play.
  if (!game) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-block text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        ← Back to the arcade
      </Link>

      <GameStage game={game} />

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            About this game
          </h2>
          {game.description ? (
            <div
              className="prose-sm max-w-none space-y-2 text-sm leading-relaxed text-zinc-400 [&_a]:text-emerald-400 [&_a]:underline"
              // The Archive stores descriptions as author-supplied HTML.
              dangerouslySetInnerHTML={{ __html: game.description }}
            />
          ) : (
            <p className="text-sm text-zinc-500">
              No description was preserved with this item.
            </p>
          )}
        </section>

        <aside className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Details
          </h2>
          <dl className="space-y-2 text-zinc-400">
            {game.creator ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600">Creator</dt>
                <dd className="text-right">{game.creator}</dd>
              </div>
            ) : null}
            {game.year ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600">Year</dt>
                <dd>{game.year}</dd>
              </div>
            ) : null}
            {game.width && game.height ? (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600">Stage</dt>
                <dd>
                  {game.width}×{game.height}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">Plays</dt>
              <dd>{game.downloads.toLocaleString()}</dd>
            </div>
          </dl>
          <a
            href={detailsUrl(game.identifier)}
            target="_blank"
            rel="noreferrer"
            className="inline-block pt-2 text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
          >
            View the original item →
          </a>
        </aside>
      </div>
    </div>
  );
}
