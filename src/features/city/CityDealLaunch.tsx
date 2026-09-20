import { useState } from "react";
import {
  type CityDeal,
  dealChecklist,
  type DealTerms,
} from "../../domain/cityDeals";
import { cityCall, cityCommand } from "./api";
import { RewardTerms } from "./CityDeals";
type CheckoutTest = {
  id: string;
  code: string;
  terms: DealTerms;
  outcome: string;
  note: string;
  reported_at: string | null;
};
function PrivateDealPreview({ deal: d }: { deal: CityDeal }) {
  const [claimed, setClaimed] = useState(false);
  return (
    <details className="city-deal-preview">
      <summary>Private customer preview</summary>
      <p role="note">
        Preview only. No entitlement, customer code, inventory change or
        analytics event is created.
      </p>
      <article className="city-deal-card">
        <p className="city-eyebrow">
          {d.terms.exclusive
            ? "City exclusive · merchant confirmed"
            : "City deal"}
        </p>
        <h3>{d.terms.title}</h3>
        {d.imageUrl && <img src={d.imageUrl} alt="" />}
        <p>{d.terms.description}</p>
        <RewardTerms terms={d.terms} />
        <p>{d.quantity - d.issued} customer claims remaining</p>
        <p>
          Claim window: {new Date(d.terms.startsAt).toLocaleString()} –{" "}
          {new Date(d.terms.endsAt).toLocaleString()}
        </p>
        <p>
          {d.terms.redeemBy
            ? `Redeem by ${new Date(d.terms.redeemBy).toLocaleString()}`
            : "See the merchant’s terms for checkout conditions and expiry."}
        </p>
        <button type="button" onClick={() => setClaimed((v) => !v)}>
          {claimed ? "Preview unclaimed state" : "Preview claimed state"}
        </button>
        {claimed && (
          <section aria-label="Example receipt">
            <p>Example receipt — not a real claim</p>
            <code className="city-deal-code">PREVIEW-ONLY</code>
            <p>Shop now → {d.terms.destination}</p>
            <p>
              The live receipt also includes a unique claim reference and
              appears in My Deals.
            </p>
          </section>
        )}
      </article>
    </details>
  );
}
export function CityDealLaunch(
  { deal, admin = false, onRefresh }: {
    deal: CityDeal;
    admin?: boolean;
    onRefresh: () => Promise<void>;
  },
) {
  const [code, setCode] = useState(""),
    [tests, setTests] = useState<CheckoutTest[] | null>(null),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const checks = dealChecklist(deal),
    ready = checks.every((c) => c.done),
    test = tests?.[0];
  async function load() {
    const r = await cityCall<{ tests: CheckoutTest[] }>("city-api", {
      action: "deal_launch",
      id: deal.id,
    });
    setTests(r.tests);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="city-launch-readiness"
      aria-label={`Launch checklist for ${deal.terms.title}`}
    >
      <h4>{ready ? "Launch checklist complete" : "Get this deal ready"}</h4>
      <p>
        {checks.filter((c) => c.done).length} of {checks.length}{" "}
        checks complete. This checklist does not launch or pause your deal.
      </p>
      <ul>
        {checks.map((c) => (
          <li key={c.label}>
            <strong>{c.done ? "✓" : "○"} {c.label}</strong>
            <p>{c.detail}</p>
          </li>
        ))}
      </ul>
      {deal.checkoutTest?.note && (
        <p>
          Merchant test evidence: {deal.checkoutTest.note}
          {deal.checkoutTest.reportedAt
            ? ` · ${new Date(deal.checkoutTest.reportedAt).toLocaleString()}`
            : ""}
        </p>
      )}
      <PrivateDealPreview deal={deal} />
      {!admin && (
        <details
          onToggle={(e) => {
            if (e.currentTarget.open && tests === null) void run(load);
          }}
        >
          <summary>Test your merchant checkout</summary>
          <p>
            Create a separate disposable code in your store with the same reward
            rules. Register it here, use it at your checkout, then record the
            result. SynArc does not place an order or charge a payment.
          </p>
          <fieldset disabled={busy}>
            <label>
              Dedicated merchant test code<input
                value={code}
                maxLength={200}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!code.trim()}
              onClick={() =>
                void run(async () => {
                  await cityCommand("deal_test_register", {
                    id: deal.id,
                    version: deal.version,
                    code,
                  });
                  setCode("");
                  setConfirmed(false);
                  setNote("");
                  await load();
                })}
            >
              Register test code
            </button>
            {test && (
              <>
                <p>
                  Latest test code: <code>{test.code}</code> · {test.outcome}
                </p>
                <a
                  href={deal.terms.destination}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open merchant checkout ↗
                </a>
                <p>
                  Check the reward amount, eligibility, one-use restriction and
                  any stated expiry. Use your store’s sandbox where available.
                </p>
                <label>
                  What did you verify?<textarea
                    value={note}
                    minLength={10}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  I tested this code at the merchant checkout against the
                  current deal terms
                </label>
                <div className="city-actions">
                  {["passed", "failed"].map((outcome) => (
                    <button
                      type="button"
                      key={outcome}
                      disabled={note.trim().length < 10 ||
                        (outcome === "passed" && !confirmed)}
                      onClick={() =>
                        void run(async () => {
                          await cityCommand("deal_test_report", {
                            id: deal.id,
                            version: deal.version,
                            testId: test.id,
                            outcome,
                            note,
                            confirmed,
                          });
                          await load();
                        })}
                    >
                      {outcome === "passed"
                        ? "Record merchant test passed"
                        : "Record test failed"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </fieldset>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {!!deal.exhibitStats?.length && (
        <details>
          <summary>Which exhibits lead to claims?</summary>
          <p>
            Reported origins, not proof of participation. A claim retains its
            first valid exhibit link; repeat claims do not change attribution.
            Redemptions are merchant-reported.
          </p>
          <div className="city-launch-table">
            <table>
              <thead>
                <tr>
                  <th>Exhibit</th>
                  <th>Opens</th>
                  <th>Clicks</th>
                  <th>Claims</th>
                  <th>Reported used</th>
                </tr>
              </thead>
              <tbody>
                {deal.exhibitStats.map((s) => (
                  <tr key={s.exhibit_id}>
                    <td>{s.title}</td>
                    <td>{s.opens}</td>
                    <td>{s.clicks}</td>
                    <td>{s.claims}</td>
                    <td>{s.reported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
