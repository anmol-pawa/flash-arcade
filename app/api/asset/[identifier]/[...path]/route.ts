/**
 * Same-origin proxy for files inside an archive.org item.
 *
 * Why this exists: archive.org does not send CORS headers on item downloads,
 * so the browser refuses to hand the bytes to Ruffle. Proxying through our own
 * origin makes both the SWF and any sibling assets it loads at runtime (XML,
 * MP3, extra SWFs) same-origin and therefore readable.
 */

const DOWNLOAD_ENDPOINT = "https://archive.org/download";

/** archive.org identifiers are alphanumerics plus . _ - — reject anything else. */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/asset/[identifier]/[...path]">
) {
  const { identifier, path } = await ctx.params;

  if (!IDENTIFIER_PATTERN.test(identifier)) {
    return new Response("Invalid identifier", { status: 400 });
  }

  // Guard against traversal escaping the item directory.
  if (path.some((segment) => segment === ".." || segment === "." || segment === "")) {
    return new Response("Invalid path", { status: 400 });
  }

  const upstream = `${DOWNLOAD_ENDPOINT}/${encodeURIComponent(identifier)}/${path
    .map(encodeURIComponent)
    .join("/")}`;

  // Forward Range so Ruffle (and audio elements) can seek within large files.
  const forwarded = new Headers();
  const range = request.headers.get("range");
  if (range) forwarded.set("Range", range);

  let res: Response;
  try {
    res = await fetch(upstream, { headers: forwarded, redirect: "follow" });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (!res.ok && res.status !== 206) {
    return new Response(`Asset unavailable (${res.status})`, { status: res.status });
  }

  const headers = new Headers();
  for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = res.headers.get(header);
    if (value) headers.set(header, value);
  }
  // Items on archive.org are immutable once uploaded.
  headers.set("Cache-Control", "public, max-age=86400, immutable");

  return new Response(res.body, { status: res.status, headers });
}
