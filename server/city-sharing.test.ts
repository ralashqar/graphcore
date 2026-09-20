import test from "node:test";
import assert from "node:assert/strict";
import { cardSVG, escapeHTML, propertyHTML } from "./city-sharing.ts";
import { GET as card } from "../api/city-share.ts";
test("share metadata escapes business-controlled content", async () => {
  const data = {
    name: "<img src=x onerror=alert(1)>",
    description: '"/><script>alert(1)</script>',
    rank: 3,
    value: 10000,
    color: "url(https://bad)",
    date: "2026-09-20T12:00:00Z",
    slug: "test-business",
  };
  assert.equal(escapeHTML("<>"), "&lt;&gt;");
  assert.ok(!cardSVG(data).includes("url(https://bad)"));
  const html = await propertyHTML(data);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("/api/city-share?slug=test-business"));
});
test("sharing endpoint generates a PNG from public city data", async () => {
  const saved = globalThis.fetch,
    oldURL = process.env.CITY_SUPABASE_URL,
    oldKey = process.env.CITY_SUPABASE_PUBLISHABLE_KEY;
  process.env.CITY_SUPABASE_URL = "https://example.com";
  process.env.CITY_SUPABASE_PUBLISHABLE_KEY = "test";
  globalThis.fetch = async () =>
    Response.json({
      name: "Fieldwork",
      description: "Independent tools.",
      rank: 1,
      value: 120000,
      color: "#547364",
      date: "2026-09-20T12:00:00Z",
      slug: "fieldwork",
    });
  try {
    const response = await card(
      new Request("https://example.com/api/city-share?slug=fieldwork"),
    );
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(
      Array.from(bytes.slice(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.ok(bytes.length > 1000);
  } finally {
    globalThis.fetch = saved;
    if (oldURL === undefined) delete process.env.CITY_SUPABASE_URL;
    else process.env.CITY_SUPABASE_URL = oldURL;
    if (oldKey === undefined) delete process.env.CITY_SUPABASE_PUBLISHABLE_KEY;
    else process.env.CITY_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
