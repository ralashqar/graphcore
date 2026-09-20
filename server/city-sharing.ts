import { readFile } from "node:fs/promises";
import path from "node:path";
export type CityShare = {
  kind?: "trail" | "launch" | "storefront" | "deal";
  name: string;
  description?: string;
  rank: number;
  value: number;
  color: string;
  date: string;
  slug: string;
};
export const escapeHTML = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function shareData(params: URLSearchParams): Promise<CityShare> {
  const kind = params.get("kind");
  if (kind && !["trail", "launch", "storefront", "deal"].includes(kind))
    throw new Error("Invalid discovery kind.");
  const slug = params.get("slug"),
    eventId = params.get("eventId");
  if (
    eventId
      ? !/^[a-f\d-]{36}$/.test(eventId)
      : !slug || !/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug)
  )
    throw new Error("Invalid property address.");
  const base = process.env.CITY_SUPABASE_URL,
    key = process.env.CITY_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error("City sharing is not configured.");
  const response = await fetch(`${base}/functions/v1/city-api`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: kind === "deal" ? "customer_share" : kind && kind !== "storefront" ? "discovery_share" : "share",
      ...(kind === "deal" ? {id:slug} : {}),
      ...(kind ? { kind } : {}),
      ...(eventId ? { eventId } : { slug }),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Property unavailable."
        : "City sharing is unavailable.",
    );
  return response.json();
}
export function cardSVG(data: CityShare) {
  const name = escapeHTML(data.name.slice(0, 28)),
    color = /^#[a-f\d]{6}$/i.test(data.color) ? data.color : "#355b45",
    value = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(data.value / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#eeeae0"/><rect x="870" width="330" height="630" fill="${color}"/><g font-family="Manrope" fill="#253b31"><text x="70" y="80" font-size="24">SYNARC / CITY</text><text x="70" y="230" font-size="54" font-weight="600">${name}</text><text x="70" y="307" font-size="34">${data.kind ? "Discover, try and create." : `A new perspective. City rank #${Number(data.rank)}.`}</text><text x="70" y="378" font-size="25">${data.kind ? "Explore the creator district" : `${escapeHTML(value)} in sponsored City Value`}</text><text x="70" y="540" font-size="20">${escapeHTML(new Date(data.date).toISOString().slice(0, 10))} · synarc city</text></g><text x="900" y="345" fill="white" font-family="Manrope" font-size="${data.rank > 99 ? 70 : 110}">${data.kind ? "TRY" : `#${Number(data.rank)}`}</text></svg>`;
}
export async function propertyHTML(data: CityShare) {
  const origin = new URL(process.env.CITY_PUBLIC_ORIGIN || "https://synarc.ai")
      .origin,
    url = `${origin}/city/${data.kind === "deal" ? "deal" : data.kind === "trail" ? "trails" : data.kind === "launch" ? "launches" : "business"}/${data.slug}`,
    image = `${origin}/api/city-share?slug=${encodeURIComponent(data.slug)}${data.kind ? `&kind=${data.kind}` : ""}`;
  const title = `${data.name} | Synarc City`,
    description =
      data.description || `Discover ${data.name}, city rank #${data.rank}.`;
  let html = await readFile(
    path.join(process.cwd(), "dist/index.html"),
    "utf8",
  );
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHTML(title)}</title>`)
    .replace(
      /<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[\s\S]*?\/>/gi,
      "",
    )
    .replace(/<link rel="canonical"[^>]*>/i, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, "")
    .replace(
      "</head>",
      `<meta name="description" content="${escapeHTML(description)}"/><link rel="canonical" href="${escapeHTML(url)}"/><meta property="og:type" content="website"/><meta property="og:title" content="${escapeHTML(title)}"/><meta property="og:description" content="${escapeHTML(description)}"/><meta property="og:url" content="${escapeHTML(url)}"/><meta property="og:image" content="${escapeHTML(image)}"/><meta name="twitter:card" content="summary_large_image"/></head>`,
    );
  html = html.replace(
    /<main class="seo-static-landing">[\s\S]*?<\/main>/,
    `<main class="seo-static-landing"><h1>${escapeHTML(data.name)}</h1><p>${escapeHTML(description)}</p><p>${data.kind ? "Explore the creator district." : `Sponsored city location #${Number(data.rank)}.`}</p><a href="/city">Explore Synarc City</a></main>`,
  );
  return html;
}
