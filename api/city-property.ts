import { propertyHTML, shareData } from "../server/city-sharing.ts";
export async function GET(request: Request) {
  try {
    return new Response(
      await propertyHTML(await shareData(new URL(request.url).searchParams)),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=30",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
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
