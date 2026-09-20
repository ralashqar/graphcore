import { supabase } from "../../utils/supabase";
import { CityDialog } from "./CityAuth";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cityCall, cityCommand, cityNavigate } from "./api";
import { CityDealWallet } from "./CityDeals";
import {
  type CustomerItem,
  type CustomerResults,
  type DiscoveryFilter,
  discoveryLabel,
  surpriseItem,
} from "../../domain/cityCustomer";
import type { CityProperty } from "../../domain/city";
const localKey = "synarc-city-saved-deals";
function localSaves(): CustomerItem[] {
  try {
    return JSON.parse(localStorage.getItem(localKey) || "[]").filter((
      r: CustomerItem,
    ) =>
      ["deal", "business", "launch"].includes(r.kind) &&
      typeof r.content_id === "string" && typeof r.destination === "string" &&
      r.destination.startsWith("/city/")
    ).slice(0, 200);
  } catch {
    return [];
  }
}
type CustomerState = {
  enabled: boolean;
  userId?: string;
  saved: CustomerItem[];
  save: (item: CustomerItem) => Promise<void>;
  refresh: () => void;
  open: () => void;
};
const Context = createContext<CustomerState>({
  enabled: false,
  saved: [],
  save: async () => {},
  refresh: () => {},
  open: () => {},
});
export function CustomerProvider(
  { enabled, userId, onAuth, children }: {
    enabled: boolean;
    userId?: string;
    onAuth: () => void;
    children: ReactNode;
  },
) {
  const [saved, setSaved] = useState<CustomerItem[]>(localSaves),
    [active, setActive] = useState(0),
    [wallet, setWallet] = useState(false),
    [error, setError] = useState(""),
    [reminders, setReminders] = useState<CustomerItem[]>([]);
  const current = useRef(userId);
  current.current = userId;
  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (!userId) {
      setSaved(localSaves());
      setActive(0);
      return;
    }
    const r = await cityCall<
      { active: number; saved: CustomerItem[]; reminders?: CustomerItem[] }
    >("city-api", { action: "customer_wallet" });
    if (current.current === userId) {
      setSaved(r.saved);
      setActive(r.active);
      setReminders(r.reminders || []);
    }
  }, [enabled, userId]);
  useEffect(() => {
    if (enabled) customerEvent("city_open");
  }, [enabled]);
  useEffect(() => {
    setSaved(userId ? [] : localSaves());
    setActive(0);
    setReminders([]);
    setWallet(false);
  }, [userId]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      if (userId) {
        const local=localSaves();
        if(local.length){
          const result=await cityCommand<{merged:string[]}>('customer_merge',{items:local.map(i=>({id:i.content_id,kind:i.kind}))});
          if(live){const remaining=local.filter(i=>!result.merged.includes(i.content_id));localStorage.setItem(localKey,JSON.stringify(remaining));if(remaining.length)setError('Some saved items are unavailable and remain on this device.');}
        }
      }
      if (live) await refresh();
    })().catch((e) => {
      if (live) setError(e.message);
    });
    const channel = supabase.channel("city-customer-availability").on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "city_customer_revision" },
      () => window.dispatchEvent(new Event("city-wallet-change")),
    ).subscribe();
    const update = () => {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => {});
      }
    };
    const timer = setInterval(update, 30000);
    window.addEventListener("city-wallet-change", update);
    window.addEventListener("online", update);
    return () => {
      live = false;
      void supabase.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("city-wallet-change", update);
      window.removeEventListener("online", update);
    };
  }, [enabled, userId, refresh]);
  async function save(item: CustomerItem) {
    const exists = saved.some((s) => s.content_id === item.content_id);
    if (userId) {
      await cityCommand("customer_save", {
        id: item.content_id,
        kind: item.kind,
        saved: !exists,
      });
      await refresh();
    } else {
      const next = exists
        ? saved.filter((s) => s.content_id !== item.content_id)
        : [item, ...saved].slice(0, 200);
      localStorage.setItem(localKey, JSON.stringify(next));
      setSaved(next);
    }
  }
  return (
    <Context.Provider
      value={{
        enabled,
        userId,
        saved,
        save,
        refresh: () => void refresh().catch(() => {}),
        open: () => setWallet(true),
      }}
    >
      {children}
      {enabled && (
        <button
          className="city-wallet-fab"
          onClick={() => {
            setWallet(true);
            customerEvent("wallet_open");
          }}
          aria-label={`My deals, ${active} active`}
        >
          My deals <strong>{active}</strong>
        </button>
      )}
      {enabled && wallet && (
        <CityDialog
          title="My deals"
          onClose={() => setWallet(false)}
        >
          <section className="city-customer-wallet">
            <button autoFocus onClick={() => setWallet(false)}>
              Close wallet
            </button>
            {userId ? <CityDealWallet key={userId} /> : (
              <>
                <h2>My deals</h2>
                <p>
                  Browse and save freely. Sign in to claim a unique code and
                  keep it across devices.
                </p>
                <button onClick={onAuth}>Sign in to claim</button>
              </>
            )}
            <h3>Saved{!userId ? " · this device" : ""}</h3>
            <p>Saving does not reserve a code.</p>
            {saved.length
              ? saved.map((item) => (
                <article key={item.content_id}>
                  <button
                    onClick={() => {
                      cityNavigate(item.destination);
                      setWallet(false);
                    }}
                  >
                    <strong>{item.title}</strong> · {item.business_name}
                  </button>
                  <small>
                    {item.available
                      ? "View current availability"
                      : "Currently unavailable"}
                  </small>
                  <CustomerSave item={item} />
                </article>
              ))
              : <p>Save an offer to come back to it.</p>}
            <h3>Coming up & followed businesses</h3>
            {reminders.map((r) => (
              <article key={r.key}>
                <button
                  onClick={() => {
                    cityNavigate(r.destination);
                    setWallet(false);
                  }}
                >
                  {r.title} · {r.business_name}
                </button>
                {r.starts_at && (
                  <small>Starts {new Date(r.starts_at).toLocaleString()}</small>
                )}
              </article>
            ))}
            <p>
              Follow businesses and save launches to find their latest activity
              in your in-app feed.
            </p>
            <button
              onClick={() => {
                cityNavigate("/city/following");
                setWallet(false);
              }}
            >
              Following & saved launches
            </button>
            {error && <p role="alert">{error}</p>}
          </section>
        </CityDialog>
      )}
    </Context.Provider>
  );
}
export function CustomerSave({ item }: { item: CustomerItem }) {
  const c = useContext(Context),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!c.enabled) return null;
  const saved = c.saved.some((s) => s.content_id === item.content_id);
  return (
    <>
      <button
        disabled={busy}
        aria-pressed={saved}
        onClick={() => {
          setBusy(true);
          void c.save(item).catch((e) => setError(e.message)).finally(() =>
            setBusy(false)
          );
        }}
      >
        {saved
          ? "Saved · remove"
          : item.kind === "business"
          ? "Save business"
          : item.kind === "launch" ? "Save launch" : "Save deal"}
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
export function CustomerDiscovery({
  query,
  onQuery,
  onResults,
  onChoose,
  demoProperties,
}: {
  query: string;
  onQuery: (q: string) => void;
  onResults: (items: CustomerItem[], filtered: boolean, matches?:string[]) => void;
  onChoose: (item: CustomerItem) => void;
  demoProperties?: CityProperty[];
}) {
  const [filter, setFilter] = useState<DiscoveryFilter>(() => {
      try {
        const v = sessionStorage.getItem("city-discovery-filter");
        return ["all", "hot", "free", "exclusive", "ending"].includes(v || "")
          ? v as DiscoveryFilter
          : "all";
      } catch {
        return "all";
      }
    }),
    [category, setCategory] = useState(() => {
      try {
        return sessionStorage.getItem("city-discovery-category") || "";
      } catch {
        return "";
      }
    }),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<CustomerResults | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [activity, setActivity] = useState<
      { key: string; label: string; destination: string }[]
    >([]),
    [hint, setHint] = useState(() => {
      try {
        return !localStorage.getItem("city-discovery-hint");
      } catch {
        return true;
      }
    });
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listRef.current) return;
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !timers.has(entry.target)) {
          const row = data?.items.find((i) =>
            i.key === (entry.target as HTMLElement).dataset.discoveryKey
          );
          if (row) {
            timers.set(
              entry.target,
              setTimeout(() => {
                customerEvent("property_impression", row.business_id);
                if (row.kind === "deal") {
                  customerEvent("deal_impression", row.business_id);
                }
              }, 1000),
            );
          }
        } else if (!entry.isIntersecting) {
          clearTimeout(timers.get(entry.target));
          timers.delete(entry.target);
        }
      }
    }, { threshold: 0.5 });
    listRef.current.querySelectorAll("[data-discovery-key]").forEach((e) =>
      observer.observe(e)
    );
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [data]);
  const recent = useRef<string[]>([]),
    choose = useCallback((item: CustomerItem) => {
      customerEvent("search_result_click", item.business_id);
      recent.current = [item.business_id, ...recent.current].slice(0, 8);
      onChoose(item);
    }, [onChoose]);
  useEffect(() => {
    setOffset(0);
    try {
      sessionStorage.setItem("city-discovery-filter", filter);
      sessionStorage.setItem("city-discovery-category", category);
    } catch {}
  }, [query, filter, category]);
  useEffect(() => {
    let live = true, sequence = 0;
    const load = async () => {
      const request = ++sequence;
      if (document.visibilityState !== "visible") return;
      setBusy(true);
      try {
        let r: CustomerResults;
        if (demoProperties) {
          const items: CustomerItem[] = demoProperties.map((p) => ({
            key: "business:" + p.id,
            business_id: p.id,
            slug: p.slug,
            business_name: p.profile.name,
            category: p.profile.category,
            kind: "business",
            content_id: p.id,
            title: p.profile.name,
            description: p.profile.tagline,
            destination: "/city/business/" + p.slug + "?demo=1",
            rank: p.rank,
            x: p.x,
            z: p.z,
            created_at: new Date().toISOString(),
            starts_at: null,
            ends_at: null,
            remaining: null,
            free: false,
            exclusive: false,
            available: true,
          }));
          const matches = items.filter((i) =>
            (!category || i.category === category) &&
            `${i.title} ${i.category}`.toLowerCase().includes(
              query.toLowerCase(),
            ) && (filter === "all" || filter === "hot")
          );
          r = {
            items: matches.slice(offset, offset + 40),
            hasMore: matches.length > offset + 40,
            categories: [...new Set(items.map((i) => i.category))],
            now: new Date().toISOString(),
            revision: 0,
          };
        } else {r = await cityCall<CustomerResults>("city-api", {
            action: "customer_search",
            query,
            filter,
            category,
            offset,
          });}
        if (live && request === sequence) {
          setData(r);
          setError("");
          onResults(r.items, !!(query || filter !== "all" || category),r.matches);
        }
      } catch (e) {
        if (live && request === sequence) setError((e as Error).message);
      } finally {
        if (live && request === sequence) setBusy(false);
      }
    };
    if (query) customerEvent("search");
    const timeout = setTimeout(() => void load(), 200),
      timer = setInterval(() => void load(), 30000);
    window.addEventListener("online", load);
    window.addEventListener("city-wallet-change", load);
    return () => {
      live = false;
      clearTimeout(timeout);
      clearInterval(timer);
      window.removeEventListener("online", load);
      window.removeEventListener("city-wallet-change", load);
    };
  }, [query, filter, category, offset, demoProperties, onResults]);
  useEffect(() => {
    if (demoProperties) return;
    let live = true;
    const load = () =>
      document.visibilityState === "visible" &&
      void cityCall<{ items: typeof activity }>("city-api", {
        action: "customer_activity",
      }).then((r) => {
        if (live) setActivity(r.items);
      }).catch(() => {});
    load();
    window.addEventListener("city-wallet-change", load);
    const timer = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("city-wallet-change", load);
    };
  }, [demoProperties]);
  return (
    <>
      <p className="city-eyebrow">THE CREATOR DISTRICT</p>
      <h1>Find your next good thing.</h1>
      <p>Tools to try. Offers to claim. Ideas to explore.</p>
      <label className="city-search">
        <input
          aria-label="Search the city"
          placeholder="Search tools, demos and deals"
          maxLength={160}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => onQuery("")} aria-label="Clear search">
            ×
          </button>
        )}
      </label>
      <div className="city-customer-filters" aria-label="Discovery filters">
        {([["all", "Discover"], ["hot", "Hot now"], ["free", "Freebies"], [
          "exclusive",
          "Exclusives",
        ], ["ending", "Ending soon"]] as const).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        Category{" "}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All creators</option>
          {data?.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {hint && (
        <p className="city-customer-hint">
          Explore a business. Try something useful. Save or claim an
          offer.<button
            aria-label="Dismiss discovery hint"
            onClick={() => {
              setHint(false);
              localStorage.setItem("city-discovery-hint", "1");
            }}
          >
            Got it
          </button>
        </p>
      )}
      <button
        disabled={!data?.items.length || busy}
        onClick={() => {
          const item = surpriseItem(data?.items || [], recent.current);
          if (item) {
            customerEvent("surprise_me", item.business_id);
            choose(item);
          }
        }}
      >
        Surprise me ↗
      </button>
      <h2>
        {filter === "hot" && !data?.items.some((i) => i.trending)
          ? "New discoveries"
          : query
          ? "Search results"
          : "Worth a look"}
      </h2>
      {busy && <small role="status">Finding discoveries…</small>}
      {error && <p role="alert">{error}</p>}
      <div className="city-property-list" ref={listRef}>
        {data?.items.map((item) => (
          <article
            className="city-customer-result"
            key={item.key}
            data-discovery-key={item.key}
          >
            <button
              onClick={() => choose(item)}
            >
              <small>
                {discoveryLabel(item, filter)} · {item.business_name}
              </small>
              <strong>{item.title}</strong>
              <span>{item.description.slice(0, 100)}</span>
              <small>
                {item.remaining !== null
                  ? `${item.remaining} codes available · `
                  : ""}
                {item.ends_at && `Ends ${new Date(item.ends_at).toLocaleString()} · `}
                {item.rank ? "Sponsored city location" : "Discovery Pavilion"}
              </small>
            </button>
            {(item.kind === "deal" || item.kind === "business" || item.kind === "launch") && (
              <CustomerSave item={item} />
            )}
          </article>
        ))}
        {data && !data.items.length && (
          <p>No matching discoveries yet. Try another filter.</p>
        )}
      </div>
      <div className="city-pagination">
        <button
          disabled={!offset || busy}
          onClick={() => setOffset(Math.max(0, offset - 40))}
        >
          Previous
        </button>
        <span>Page {offset / 40 + 1}</span>
        <button
          disabled={!data?.hasMore || busy}
          onClick={() => setOffset(offset + 40)}
        >
          Next
        </button>
      </div>
      <details className="city-customer-activity">
        <summary>Happening in the city</summary>
        {activity.length
          ? activity.map((a) => (
            <button
              key={a.key}
              onClick={() => cityNavigate(a.destination)}
            >
              {a.label}
            </button>
          ))
          : <p>New launches and available offers will appear here.</p>}
      </details>
    </>
  );
}

export function CustomerMetrics({ businessId }: { businessId: string }) {
  const [metrics, setMetrics] = useState<Record<string, number>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void cityCall<Record<string, number>>("city-api", {
      action: "customer_metrics",
      businessId,
    }).then((r) => {
      if (live) setMetrics(r);
    }).catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [businessId]);
  return (
    <section className="city-deals">
      <h2>Discovery funnel · last 30 days</h2>
      <p>
        Opens, impressions and visits are daily deduplicated activity, not
        unique people. Claims are committed entitlements. Purchases require a
        merchant integration.
      </p>
      {Object.entries(metrics).map(([key, value]) => (
        <p key={key}>
          {key.replace(/([A-Z])/g, " $1")}: <strong>{value}</strong>
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function customerEvent(
  kind: string,
  businessId?: string,
  dealId?: string,
) {
  void cityCommand("customer_event", { kind, businessId, dealId }).catch(
    () => {},
  );
}

export function useCustomerEnabled() {
  return useContext(Context).enabled;
}
