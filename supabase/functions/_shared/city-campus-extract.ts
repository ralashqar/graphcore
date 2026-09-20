import { fetchPublicWebsite, importURL } from "./city-network.ts";
export type Manifest = {
  pages: { url: string; text: string }[];
  images: {
    url: string;
    page: string;
    label: string;
    path?: string;
    bytes?: number;
    failed?: boolean;
  }[];
  warnings: string[];
};
const decode = (s: string) =>
  s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
function attrs(tag: string) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [
      m[1].toLowerCase(),
      decode(m[2]),
    ]),
  );
}
export function extractPage(html: string, url: string) {
  const clean = html.replace(
    /<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  const text = decode(clean.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
  const links: string[] = [],
    images: Manifest["images"] = [];
  for (const tag of clean.match(/<(?:a|img|meta)\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    try {
      if (tag.toLowerCase().startsWith("<a") && a.href) {
        const next = importURL(new URL(a.href, url).toString());
        next.hash = "";
        if (
          next.origin === new URL(url).origin &&
          /product|feature|example|gallery|showcase|about|template/i.test(
            next.pathname,
          ) &&
          !links.includes(next.toString())
        )
          links.push(next.toString());
      }
      const src =
        a.src ||
        (a.property === "og:image" || a.name === "og:image" ? a.content : "");
      if (src)
        images.push({
          url: importURL(new URL(src, url).toString()).toString(),
          page: url,
          label: (a.alt || a.title || "Website image").slice(0, 80),
        });
    } catch {
      /* unsupported source */
    }
  }
  return { text, links: links.slice(0, 4), images: images.slice(0, 12) };
}
export async function extractWebsite(
  url: string,
  fetcher = fetchPublicWebsite,
): Promise<Manifest> {
  const manifest: Manifest = { pages: [], images: [], warnings: [] };
  const queue = [url];
  for (let i = 0; i < queue.length && i < 5; i++) {
    try {
      const page = await fetcher(queue[i]);
      if (!page.type.includes("text/html")) throw new Error("No HTML");
      if (
        i &&
        new URL(page.url).origin !== new URL(manifest.pages[0].url).origin
      )
        throw new Error("Page redirected outside site");
      const parsed = extractPage(
        new TextDecoder().decode(page.bytes),
        page.url,
      );
      manifest.pages.push({ url: page.url, text: parsed.text });
      for (const image of parsed.images)
        if (
          manifest.images.length < 12 &&
          !manifest.images.some((v) => v.url === image.url)
        )
          manifest.images.push(image);
      if (!i) queue.push(...parsed.links.filter((v) => v !== url));
    } catch {
      manifest.warnings.push(
        "Could not read " + queue[i] + ". Upload examples manually.",
      );
    }
  }
  if (!manifest.pages.some((p) => p.text.length > 100))
    manifest.warnings.push(
      "Limited readable website content. Review this draft and add real product examples.",
    );
  return manifest;
}
export function stillImage(bytes: Uint8Array): [string, string] {
  if (
    bytes.length > 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71
  ) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (v.getUint32(16) * v.getUint32(20) > 40000000)
      throw new Error("Image dimensions too large");
    return ["image/png", "png"];
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return ["image/jpeg", "jpg"];
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return ["image/webp", "webp"];
  throw new Error("Unsupported still image");
}
