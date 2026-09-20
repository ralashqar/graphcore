// Read-only. No migrations, settings changes, coupon claims, orders or model calls.
import { mkdir, writeFile } from "node:fs/promises";
const names = [
  "CITY_STAGING_SUPABASE_URL",
  "CITY_STAGING_PUBLISHABLE_KEY",
  "CITY_STAGING_ACCESS_TOKEN",
];
const report = {
  checkedAt: new Date().toISOString(),
  status: "blocked",
  missing: names.filter((k) => !process.env[k]),
  checks: [],
  reason: "",
};
try {
  if (report.missing.length) {
    throw new Error("An isolated City staging environment is not configured.");
  }
  const url = new URL(process.env.CITY_STAGING_SUPABASE_URL);
  if (
    url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") ||
    url.hostname === "znwdatidqdkzidempvkt.supabase.co" || url.username ||
    url.password
  ) {
    throw new Error(
      "Use the designated isolated staging project, not shared GraphCore production.",
    );
  }
  async function read(action, extra = {}) {
    const r = await fetch(`${url.origin}/functions/v1/city-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.CITY_STAGING_PUBLISHABLE_KEY,
        Authorization: `Bearer ${process.env.CITY_STAGING_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ action, ...extra }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Staging ${action} failed (${r.status}).`);
    return r.json();
  }
  const snapshot = await read("snapshot"), workspace = await read("workspace");
  report.checks.push({
    name: "City Deals enabled",
    passed: snapshot.dealsEnabled === true,
  });
  report.checks.push({
    name: "Published staging merchant",
    passed: !!workspace.business?.published &&
      workspace.business?.status !== "suspended",
  });
  if (workspace.business) {
    const r = await read("deal_workspace", {
      businessId: workspace.business.id,
    });
    report.checks.push({
      name: "Launch-readiness contract deployed",
      passed: r.enabled === true &&
        r.deals?.some((d) =>
          typeof d.businessReady === "boolean" && "checkoutTest" in d
        ),
    });
  }
  report.status = report.checks.every((c) => c.passed)
    ? "ready-for-merchant-acceptance"
    : "blocked";
  report.reason =
    "Readiness does not certify checkout, concurrent allocation or merchant-reported evidence. Perform actual staging acceptance separately.";
} catch (e) {
  report.reason = e.message;
}
await mkdir("output/city-staging", { recursive: true });
await writeFile(
  "output/city-staging/launch-readiness.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (report.status === "blocked") process.exitCode = 2;
