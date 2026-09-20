// Read-only: never creates accounts, changes remote configuration or sends payments.
import { writeFile, mkdir } from "node:fs/promises";
const env = process.env;
const names = [
  "CITY_STAGING_SUPABASE_URL",
  "CITY_STAGING_PUBLISHABLE_KEY",
  "CITY_STAGING_ACCESS_TOKEN",
  "CITY_STRIPE_SECRET_KEY",
];
const report = {
  checkedAt: new Date().toISOString(),
  status: "blocked",
  checks: [],
  missing: names.filter((k) => !env[k]),
};
try {
  if (report.missing.length)
    throw new Error("Staging configuration is incomplete.");
  const url = new URL(env.CITY_STAGING_SUPABASE_URL);
  if (
    url.protocol !== "https:" ||
    url.hostname === "znwdatidqdkzidempvkt.supabase.co" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an isolated hosted Supabase staging project, not the shared production project.",
    );
  if (!/^sk_test_/.test(env.CITY_STRIPE_SECRET_KEY))
    throw new Error(
      "A Stripe sandbox/test secret key is required. Live keys are rejected.",
    );
  async function call(action) {
    const response = await fetch(`${url.origin}/functions/v1/city-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.CITY_STAGING_PUBLISHABLE_KEY,
        Authorization: `Bearer ${env.CITY_STAGING_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ action }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(`Staging ${action} failed (${response.status}).`);
    return response.json();
  }
  const snapshot = await call("snapshot");
  report.checks.push({
    name: "Hosted public city",
    passed: Array.isArray(snapshot.properties),
  });
  const workspace = await call("workspace");
  report.checks.push({
    name: "Authenticated workspace",
    passed: Array.isArray(workspace.orders),
  });
  report.checks.push({
    name: "Verified, approved staging business",
    passed:
      !!workspace.business?.verified_at &&
      workspace.business.status === "approved",
  });
  report.checks.push({
    name: "Onboarding and test checkout gates",
    passed:
      snapshot.onboardingEnabled === true &&
      snapshot.purchasesEnabled === true &&
      !!snapshot.termsUrl,
  });
  const stripe = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${env.CITY_STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!stripe.ok)
    throw new Error(`Stripe sandbox authentication failed (${stripe.status}).`);
  report.checks.push({
    name: "Stripe test mode",
    passed: (await stripe.json()).livemode === false,
  });
  report.status = report.checks.every((c) => c.passed)
    ? "ready-for-payment-acceptance"
    : "blocked";
  report.note =
    "Readiness does not certify Checkout, webhook delivery, refunds, concurrency or rank displacement. Run the acceptance checklist.";
} catch (error) {
  report.reason = error.message;
}
await mkdir("output/city-staging", { recursive: true });
await writeFile(
  "output/city-staging/readiness.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (report.status === "blocked") process.exitCode = 2;
