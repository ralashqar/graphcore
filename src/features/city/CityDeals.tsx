import {
  customerEvent,
  CustomerSave,
  useCustomerEnabled,
} from "./CityCustomer";
import { useEffect, useRef, useState } from "react";
import {
  type CityDeal,
  claimState,
  dealAvailability,
  type DealClaim,
  type DealTerms,
} from "../../domain/cityDeals";
import { cityCall, cityCommand } from "./api";
export function RewardTerms({ terms: t }: { terms: DealTerms }) {
  const amount = (n: number) => `${(n / 100).toFixed(2)} ${t.currency}`;
  return (
    <p>
      {t.kind === "percentage"
        ? `${t.value}% discount`
        : t.kind === "fixed"
        ? `${amount(t.value)} discount`
        : t.kind === "free_product"
        ? "Free product"
        : "Trial / access code"}
      {t.minimumSpend > 0 ? ` · minimum spend ${amount(t.minimumSpend)}` : ""}
      {t.freeConfirmed && " · merchant-confirmed free reward"}
      {t.cardRequired && " · payment card required"}
      {t.renewalTerms && ` · ${t.renewalTerms}`}
      {t.maximumDiscount
        ? ` · maximum discount ${amount(t.maximumDiscount)}`
        : ""} · one claim per account
    </p>
  );
}
export function DealReceipt({ claim }: { claim: DealClaim }) {
  const customerEnabled = useCustomerEnabled();
  const [copied, setCopied] = useState(false), [error, setError] = useState("");
  return (
    <article className="city-deal-receipt">
      <p className="city-eyebrow">
        {claim.business_name} · {claimState(claim)}
      </p>
      <h3>{claim.terms.title}</h3>
      <p>{claim.terms.description}</p>
      <RewardTerms terms={claim.terms} />
      <p>
        Claim reference: <code>{claim.id}</code>
      </p>
      {claimState(claim) === "active" && (
        <>
          <code className="city-deal-code">{claim.code}</code>
          <div className="city-actions">
            <button
              onClick={() =>
                void navigator.clipboard.writeText(claim.code).then(() =>
                  setCopied(true)
                ).catch(() =>
                  setError("Copy unavailable. Select the code above.")
                )}
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <a
              href={claim.terms.destination}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => {
                if (customerEnabled) customerEvent("merchant_visit", undefined, claim.deal_id);
                void cityCommand("deal_track", {
                  id: claim.deal_id,
                  sourceExhibitId: claim.source_exhibit_id || undefined,
                  kind: "click",
                }).catch(() => {});
              }}
            >
              Shop now ↗
            </a>
          </div>
        </>
      )}
      <p>
        {claim.terms.redeemBy
          ? `Merchant redemption deadline: ${
            new Date(claim.terms.redeemBy).toLocaleString()
          }`
          : "See the merchant’s terms for checkout conditions and expiry."}
      </p>
      {claim.redeemed_at && (
        <small>
          Redemption reported by the merchant; not independently verified.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function CityDeals(
  {
    businessId,
    userId,
    onAuth,
    dealId,
    sourceExhibitId,
    demo = false,
    autoOpen = false,
  }: {
    businessId: string;
    userId?: string;
    onAuth: () => void;
    dealId?: string;
    sourceExhibitId?: string;
    demo?: boolean;
    autoOpen?: boolean;
  },
) {
  const customerEnabled = useCustomerEnabled();
  const [rows, setRows] = useState<CityDeal[]>([]),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState(() => {
      try {
        return sessionStorage.getItem(`city-deal-choice:${businessId}`) || "";
      } catch {
        return "";
      }
    }),
    [receipt, setReceipt] = useState<DealClaim | null>(null);
  useEffect(() => {
    if (!selected || demo || !customerEnabled) return;
    const timer = setTimeout(() => {
      void cityCommand("customer_track", {
        businessId,
        dealId: selected,
        kind: "deal_open",
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [selected, businessId, demo, customerEnabled]);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  useEffect(() => {
    let active = true;
    setEnabled(false);
    try {
      setSelected(
        (autoOpen ? dealId : "") ||
          sessionStorage.getItem(`city-deal-choice:${businessId}`) || "",
      );
    } catch {
      setSelected(autoOpen ? dealId || "" : "");
    }
    setRows([]);
    setReceipt(null);
    setError("");
    if (demo) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void cityCall<{ enabled: boolean; deals: CityDeal[] }>("city-api", {
        action: "deal_catalog",
        businessId,
      }).then((r) => {
        if (active) {
          setRows(r.deals || []);
          setEnabled(r.enabled);
        }
      }).catch((e) => {
        if (active) setError(e.message);
      });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("city-wallet-change", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("city-wallet-change", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [businessId, dealId, demo, autoOpen]);
  useEffect(() => {
    setReceipt(null);
  }, [userId]);
  if (demo) return null;
  const shown = dealId ? rows.filter((d) => d.id === dealId) : rows;
  if (!enabled && !error) return null;
  return (
    <section className="city-deals" aria-label="City deals">
      <h2>City deals</h2>
      {userId && (
        <a href="/city/account">Find your claimed codes in My Deals ↗</a>
      )}
      <p>
        One unique code per account. Discover here, redeem with the business.
      </p>
      {error && <p role="alert">{error}</p>}
      {!shown.length && <p>No approved deals are available here yet.</p>}
      {shown.map((d) => (
        <article key={d.id} className="city-deal-card">
          <p className="city-eyebrow">
            {d.terms.exclusive
              ? "✦ City exclusive · merchant confirmed"
              : "✦ City deal"} · {dealAvailability(d)}
          </p>
          <h3>{d.terms.title}</h3>
          {d.imageUrl && <img src={d.imageUrl} alt="" loading="lazy" />}
          <p>{d.quantity - d.issued} claims remaining</p>
          <button
            aria-expanded={selected === d.id}
            onClick={() => {
              setSelected(selected === d.id ? "" : d.id);
              if (selected !== d.id) {
                void cityCommand("deal_track", {
                  id: d.id,
                  kind: "open",
                  sourceExhibitId,
                })
                  .catch(() => {});
              }
            }}
          >
            View terms and claim
          </button>
          {customerEnabled && <>
          <a
            href={`/api/city-share?kind=deal&slug=${d.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share card ↗
          </a>
          <a href={`/city/deal/${d.id}`}>Deal link</a>
          </>}
          <CustomerSave
            item={{
              key: `deal:${d.id}`,
              business_id: businessId,
              slug: "",
              business_name: d.business_name || "",
              category: "",
              kind: "deal",
              content_id: d.id,
              title: d.terms.title,
              description: d.terms.description,
              destination: `/city/deal/${d.id}`,
              rank: null,
              x: null,
              z: null,
              created_at: "",
              starts_at: d.terms.startsAt,
              ends_at: d.terms.endsAt,
              remaining: d.quantity - d.issued,
              free: !!d.terms.freeConfirmed,
              exclusive: d.terms.exclusive,
              available: dealAvailability(d) === "live",
            }}
          />
          {selected === d.id && (
            <>
              <p>{d.terms.description}</p>
              <RewardTerms terms={d.terms} />
              <p>
                Claim window: {new Date(d.terms.startsAt).toLocaleString()} –
                {" "}
                {new Date(d.terms.endsAt).toLocaleString()}
              </p>
              <p>
                {d.terms.redeemBy
                  ? `Redeem by ${new Date(d.terms.redeemBy).toLocaleString()}`
                  : "Check the merchant’s terms before claiming."}
              </p>
              <button
                className="city-primary"
                disabled={!!busy || dealAvailability(d) !== "live"}
                onClick={async () => {
                  if (!userId) {
                    try {
                      sessionStorage.setItem(
                        `city-deal-choice:${businessId}`,
                        d.id,
                      );
                    } catch {}
                    onAuth();
                    return;
                  }
                  setBusy(d.id);
                  setError("");
                  try {
                    const c = await cityCommand<DealClaim>("deal_claim", {
                      id: d.id,
                      sourceExhibitId,
                    });
                    if (currentUser.current !== userId) return;
                    setReceipt(c);
                    window.dispatchEvent(new Event("city-wallet-change"));
                    const r = await cityCall<{ deals: CityDeal[] }>(
                      "city-api",
                      { action: "deal_catalog", businessId },
                    );
                    setRows(r.deals);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === d.id
                  ? "Claiming…"
                  : userId
                  ? "Claim unique code"
                  : "Sign in to claim"}
              </button>
            </>
          )}
        </article>
      ))}
      {receipt && <DealReceipt claim={receipt} />}
    </section>
  );
}
export function CityDealWallet() {
  const mounted=useRef(true);
  const [claims, setClaims] = useState<DealClaim[]>([]),
    [enabled, setEnabled] = useState(false),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(offset = 0) {
    setBusy(true);
    try {
      const r = await cityCall<
        { enabled: boolean; claims: DealClaim[]; hasMore: boolean }
      >("city-api", { action: "deal_wallet", offset });
      if(!mounted.current)return;
      setEnabled(r.enabled);
      setClaims((prev) => offset ? [...prev, ...r.claims] : r.claims);
      setMore(r.hasMore);
    } catch (e) {
      if(mounted.current)setError((e as Error).message);
    } finally {
      if(mounted.current)setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current=true;void load();
    const refresh=()=>{if(document.visibilityState==='visible')void load();};
    const timer=setInterval(refresh,30000);window.addEventListener('city-wallet-change',refresh);
    return()=>{mounted.current=false;clearInterval(timer);window.removeEventListener('city-wallet-change',refresh);};
  }, []);
  if (!enabled && !error) return null;
  return (
    <section className="city-deals">
      <h2>My Deals</h2>
      <button disabled={busy} onClick={() => void load()}>Refresh deals</button>
      {error && <p role="alert">{error}</p>}
      {!claims.length && (
        <p>Your unique codes will be saved here after you claim.</p>
      )}
      {["active", "used", "expired", "cancelled"].map((state) => {
        const items = claims.filter((c) => claimState(c) === state);
        return items.length
          ? (
            <section key={state}>
              <h3>{state[0].toUpperCase() + state.slice(1)}</h3>
              {items.map((c) => <DealReceipt key={c.id} claim={c} />)}
            </section>
          )
          : null;
      })}
      {more && (
        <button disabled={busy} onClick={() => void load(claims.length)}>
          Load more deals
        </button>
      )}
    </section>
  );
}
