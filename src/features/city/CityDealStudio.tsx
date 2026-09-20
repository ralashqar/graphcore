import { CityDealLaunch } from "./CityDealLaunch";
import { type FormEvent, useEffect, useState } from "react";
import {
  type CityDeal,
  dealAvailability,
  type DealTerms,
  parseDealCodes,
} from "../../domain/cityDeals";
import { cityCall, cityCommand } from "./api";
const fresh = (): DealTerms => ({
  title: "",
  description: "",
  image: "",
  kind: "percentage",
  value: 20,
  currency: "GBP",
  minimumSpend: 0,
  maximumDiscount: null,
  destination: "",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  redeemBy: null,
  exclusive: false,
  merchantExpiryConfirmed: false,
});
const localTime = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
    .slice(0, 16);
};
type Issued = {
  id: string;
  deal_id: string;
  created_at: string;
  redeemed_at: string | null;
  merchant_order_id: string | null;
};
export function CityDealStudio(
  { businessId, admin = false }: { businessId?: string; admin?: boolean },
) {
  const [rows, setRows] = useState<CityDeal[]>([]),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<CityDeal | null>(null),
    [terms, setTerms] = useState(fresh),
    [showForm, setShowForm] = useState(false),
    [codes, setCodes] = useState(""),
    [note, setNote] = useState(""),
    [issued, setIssued] = useState<Issued[]>([]),
    [issuedDeal, setIssuedDeal] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [order, setOrder] = useState("");
  async function refresh() {
    const r = await cityCall<{ enabled: boolean; deals: CityDeal[] }>(
      "city-api",
      { action: "deal_workspace", businessId, admin },
    );
    setRows(r.deals || []);
    setEnabled(r.enabled);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [businessId, admin]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = (key: keyof DealTerms, value: unknown) =>
    setTerms((t) => ({ ...t, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await cityCommand("deal_save", {
        ...(edit ? { id: edit.id, version: edit.version } : { businessId }),
        terms,
      });
      setShowForm(false);
      setMessage("Draft saved. Upload codes, then submit for review.");
    });
  }
  async function claims(id: string, offset = 0) {
    const r = await cityCall<{ claims: Issued[]; hasMore: boolean }>(
      "city-api",
      { action: "deal_claims", id, offset },
    );
    setIssuedDeal(id);
    setIssued((prev) => offset ? [...prev, ...r.claims] : r.claims);
    setHasMore(r.hasMore);
  }
  if (!enabled && !error) return null;
  return (
    <section className="city-deals">
      <h2>{admin ? "Deal review queue" : "Business deals"}</h2>
      <button type="button" disabled={busy} onClick={()=>void run(async()=>{})}>Refresh deal readiness</button>
      <p>
        Unique codes issued through the city. Merchant checkout enforces
        discounts and redemption deadlines.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!admin && (
        <button
          onClick={() => {
            setEdit(null);
            setTerms(fresh());
            setShowForm(true);
          }}
        >
          Create deal
        </button>
      )}
      {showForm && (
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <legend>{edit ? "Edit unclaimed deal" : "New deal"}</legend>
            <label>
              Title<input
                required
                maxLength={100}
                value={terms.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label>
              Reward terms and eligibility<textarea
                required
                minLength={10}
                maxLength={2000}
                value={terms.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </label>
            <label>
              Reward type<select
                value={terms.kind}
                onChange={(e) => change("kind", e.target.value)}
              >
                <option value="percentage">Percentage discount</option>
                <option value="fixed">Fixed discount</option>
                <option value="free_product">Free product</option>
                <option value="trial_access">Trial / access code</option>
              </select>
            </label>
            {["percentage", "fixed"].includes(terms.kind) && (
              <label>
                {terms.kind === "percentage"
                  ? "Discount percent"
                  : "Discount amount (minor units, e.g. 1000 = £10)"}
                <input
                  type="number"
                  required
                  min={1}
                  max={terms.kind === "percentage" ? 100 : 10000000}
                  value={terms.value}
                  onChange={(e) => change("value", Number(e.target.value))}
                />
              </label>
            )}
            <label>
              Currency<select
                value={terms.currency}
                onChange={(e) => change("currency", e.target.value)}
              >
                {["GBP", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Minimum spend (minor units)<input
                type="number"
                min={0}
                value={terms.minimumSpend}
                onChange={(e) => change("minimumSpend", Number(e.target.value))}
              />
            </label>
            <label>
              Maximum discount (minor units, optional)<input
                type="number"
                min={1}
                value={terms.maximumDiscount ?? ""}
                onChange={(e) =>
                  change(
                    "maximumDiscount",
                    e.target.value ? Number(e.target.value) : null,
                  )}
              />
            </label>
            <label>
              Merchant destination<input
                type="url"
                required
                value={terms.destination}
                onChange={(e) => change("destination", e.target.value)}
              />
            </label>
            {(["startsAt", "endsAt"] as const).map((k) => (
              <label key={k}>
                {k === "startsAt"
                  ? "Claims start (local time)"
                  : "Claims end (local time)"}
                <input
                  type="datetime-local"
                  required
                  value={localTime(terms[k])}
                  onChange={(e) => {
                    if (e.target.value) {
                      change(k, new Date(e.target.value).toISOString());
                    }
                  }}
                />
              </label>
            ))}
            <label>
              Merchant redemption deadline (optional)<input
                type="datetime-local"
                value={terms.redeemBy ? localTime(terms.redeemBy) : ""}
                onChange={(e) =>
                  change(
                    "redeemBy",
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  )}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={terms.merchantExpiryConfirmed}
                onChange={(e) =>
                  change("merchantExpiryConfirmed", e.target.checked)}
              />{" "}
              My store enforces this redemption deadline on every code
            </label>
            <label>
              <input
                type="checkbox"
                checked={terms.exclusive}
                onChange={(e) => change("exclusive", e.target.checked)}
              />{" "}
              I confirm this reward is exclusive to City claims
            </label>
            <label>
              Deal image (optional)<input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5000000) {
                    setError("Image must be under 5 MB.");
                    return;
                  }
                  void run(async () => {
                    const base64 = await new Promise<string>(
                      (resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () =>
                          resolve(String(r.result).split(",")[1]);
                        r.onerror = reject;
                        r.readAsDataURL(f);
                      },
                    );
                    const r = await cityCommand<{ path: string }>("upload", {
                      base64,
                    });
                    change("image", r.path);
                    setMessage("Image uploaded.");
                  });
                }}
              />
            </label>
            <button className="city-primary" type="submit">Save draft</button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </fieldset>
        </form>
      )}
      <fieldset disabled={busy}>
        <legend>{admin ? "Pending approval" : "Offers and inventory"}</legend>
        <label>
          {admin ? "Review note" : "Note for redemption correction"}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </label>
        {!admin && (
          <>
            <label>
              Unique codes — one per line, or one-column CSV<textarea
                value={codes}
                onChange={(e) => setCodes(e.target.value)}
                placeholder="code"
              />
            </label>
            <label>
              Import CSV<input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 250000) {
                    setError("Code file must be under 250 KB.");
                    return;
                  }
                  void f.text().then(setCodes).catch(() =>
                    setError("Cannot read file.")
                  );
                }}
              />
            </label>
            <p>
              Quantity equals imported codes. Duplicate imports fail as a whole.
              Issued codes are never recycled.
            </p>
          </>
        )}
        {rows.map((d) => (
          <article className="city-deal-card" key={d.id}>
            <p className="city-eyebrow">
              {dealAvailability(d)} · revision {d.version}
            </p>
            <h3>{d.terms.title}</h3>
            <CityDealLaunch deal={d} admin={admin} onRefresh={refresh}/>
            {d.imageUrl && <img src={d.imageUrl} alt="Deal artwork" />}
            <p>{d.terms.description}</p>
            <p>
              {d.terms.kind} · {d.terms.value}
              {d.terms.kind === "percentage"
                ? "%"
                : ` ${d.terms.currency} minor units`} · minimum{" "}
              {d.terms.minimumSpend} · cap {d.terms.maximumDiscount ?? "none"}
            </p>
            <p>
              {d.terms.exclusive
                ? "Merchant confirms City exclusivity"
                : "Standard City deal"}
            </p>
            <a
              href={d.terms.destination}
              target="_blank"
              rel="noopener noreferrer"
            >
              Inspect merchant destination ↗
            </a>
            <p>
              Claims: {new Date(d.terms.startsAt).toLocaleString()} –{" "}
              {new Date(d.terms.endsAt).toLocaleString()}. Redeem by:{" "}
              {d.terms.redeemBy
                ? new Date(d.terms.redeemBy).toLocaleString()
                : "merchant terms"}
            </p>
            <p>
              {d.quantity - d.issued} remaining / {d.quantity} total ·{" "}
              {d.issued} issued · {d.opens || 0} deal opens · {d.clicks || 0}
              {" "}
              outbound clicks · {d.reported || 0} merchant-reported redemptions
            </p>
            <p>
              Issuance per recorded open:{" "}
              {d.opens ? Math.round(d.issued / d.opens * 100) : 0}% · reported
              redemptions per claim:{" "}
              {d.issued ? Math.round((d.reported || 0) / d.issued * 100) : 0}%
            </p>
            <small>
              Opens and clicks are deduplicated daily, not unique lifetime
              people. Issuance rate can exceed 100% if tracking is blocked.
              Reports are not provider-verified purchases.
            </small>
            {d.review_note && <p>Review: {d.review_note}</p>}
            <div className="city-actions">
              {admin
                ? (
                  <>
                    {["approved", "rejected"].map((decision) => (
                      <button
                        key={decision}
                        onClick={() =>
                          void run(async () => {
                            await cityCommand("deal_review", {
                              id: d.id,
                              version: d.version,
                              decision,
                              note,
                            });
                          })}
                      >
                        {decision === "approved"
                          ? "Approve deal"
                          : "Reject deal"}
                      </button>
                    ))}
                  </>
                )
                : (
                  <>
                    {!d.issued && (
                      <button
                        onClick={() => {
                          setEdit(d);
                          setTerms(d.terms);
                          setShowForm(true);
                        }}
                      >
                        Edit terms
                      </button>
                    )}
                    <button
                      onClick={() =>
                        void run(async () => {
                          const parsed = parseDealCodes(codes);
                          await cityCommand("deal_import", {
                            id: d.id,
                            version: d.version,
                            codes: parsed,
                          });
                          setCodes("");
                          setMessage(`${parsed.length} codes imported.`);
                        })}
                    >
                      Import codes into this deal
                    </button>
                    {["draft", "rejected"].includes(d.status) && (
                      <button
                        onClick={() =>
                          void run(async () => {
                            await cityCommand("deal_submit", {
                              id: d.id,
                              version: d.version,
                            });
                          })}
                      >
                        Submit for review
                      </button>
                    )}
                    <button
                      disabled={d.ended}
                      onClick={() =>
                        void run(async () => {
                          await cityCommand("deal_pause", {
                            id: d.id,
                            version: d.version,
                            paused: !d.paused,
                          });
                        })}
                    >
                      {d.paused ? "Resume claims" : "Pause claims"}
                    </button>
                    <button
                      disabled={d.ended}
                      onClick={() =>
                        void run(async () => {
                          await cityCommand("deal_end", {
                            id: d.id,
                            version: d.version,
                          });
                        })}
                    >
                      End new claims
                    </button>
                    <button onClick={() => void run(() => claims(d.id))}>
                      Issued claim references
                    </button>
                  </>
                )}
            </div>
          </article>
        ))}
        {issuedDeal && (
          <section>
            <h3>Merchant redemption reports</h3>
            <p>
              Ask the customer for their claim reference. Codes and customer
              identities are not exposed here.
            </p>
            <label>
              Order reference (optional)<input
                maxLength={120}
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </label>
            {issued.map((c) => (
              <p key={c.id}>
                <code>{c.id}</code> ·{" "}
                {c.redeemed_at ? "Reported used" : "Issued"} ·{" "}
                {c.merchant_order_id}
                <button
                  onClick={() =>
                    void run(async () => {
                      await cityCommand(
                        c.redeemed_at ? "deal_correct" : "deal_report",
                        { id: issuedDeal, claimId: c.id, orderId: order, note },
                      );
                      await claims(issuedDeal);
                    })}
                >
                  {c.redeemed_at
                    ? "Correct report (reason required)"
                    : "Report redeemed"}
                </button>
              </p>
            ))}
            {hasMore && (
              <button
                onClick={() =>
                  void run(() => claims(issuedDeal, issued.length))}
              >
                More claims
              </button>
            )}
          </section>
        )}
      </fieldset>
    </section>
  );
}
export function DealExhibitPicker(
  { businessId, value, onChange }: {
    businessId: string;
    value?: string;
    onChange: (id: string | undefined) => void;
  },
) {
  const [rows, setRows] = useState<CityDeal[]>([]);
  useEffect(() => {
    void cityCall<{ deals: CityDeal[] }>("city-api", {
      action: "deal_workspace",
      businessId,
    }).then((r) => setRows(Array.isArray(r.deals) ? r.deals : [])).catch(() => {});
  }, [businessId]);
  return (
    <label>
      Offer linked to this exhibit<select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">No specific link (offer stands show all approved deals)</option>
        {value && !rows.some((d) => d.id === value) && (
          <option value={value}>Previously selected deal</option>
        )}
        {rows.map((d) => (
          <option key={d.id} value={d.id}>{d.terms.title} · {d.status}</option>
        ))}
      </select>
    </label>
  );
}
