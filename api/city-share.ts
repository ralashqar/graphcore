import { Resvg } from "@resvg/resvg-js";
import path from "node:path";
import { cardSVG, shareData } from "../server/city-sharing.ts";
export async function GET(request: Request) {
  try {
    const data = await shareData(new URL(request.url).searchParams);
    const renderer = new Resvg(cardSVG(data), {
      font: {
        fontFiles: [path.join(process.cwd(), "public/fonts/Manrope.ttf")],
        loadSystemFonts: false,
        defaultFontFamily: "Manrope",
      },
    });
    return new Response(new Uint8Array(renderer.render().asPng()), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const missing = (error as Error).message === "Property unavailable.";
    return new Response(
      missing
        ? "Property unavailable."
        : "City sharing is temporarily unavailable.",
      { status: missing ? 404 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
