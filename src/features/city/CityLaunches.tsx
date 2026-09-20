import { useEffect, useState } from "react";
import {
  type LaunchCatalog,
  type LaunchItem,
  launchPhase,
  launchPhaseLabel,
} from "../../domain/cityLaunches";
import { cityCall, cityCommand, cityNavigate } from "./api";
import { downloadMoment, LaunchReminder, useLiving } from "./CityLiving";
import { CustomerSave } from "./CityCustomer";
import type { CustomerItem } from "../../domain/cityCustomer";
import { CityDeals } from "./CityDeals";
import { enterCampus } from "./CityCampus";
import "./city-launches.css";

export function BusinessLaunchHistory({businessId}:{businessId:string}){
 const [items,setItems]=useState<{id:string;slug:string;title:string;startsAt:string;interested:number}[]>([]),[offset,setOffset]=useState(0),[more,setMore]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;setError('');void cityCall<{items:typeof items;hasMore:boolean}>('city-api',{action:'launch_history',businessId,offset}).then(r=>{if(live){setItems(r.items);setMore(r.hasMore);}}).catch(e=>{if(live){setItems([]);setError(e.message);}});return()=>{live=false;};},[businessId,offset]);
 return <section><h3>Launch history</h3>{error&&<p role="status">{error}</p>}{items.map(i=><button key={i.id} onClick={()=>cityNavigate('/city/launches/'+i.slug)}>{i.title} · {new Date(i.startsAt).toLocaleDateString()} · {i.interested} interested</button>)}{!items.length&&!error&&<p>No published launches yet.</p>}<div className="city-actions">{offset>0&&<button onClick={()=>setOffset(v=>Math.max(0,v-25))}>Previous launches</button>}{more&&<button onClick={()=>setOffset(v=>v+25)}>Older launches</button>}</div></section>;
}

export function useLaunchPlaza(enabled: boolean, revision: number) {
  const [items, setItems] = useState<LaunchItem[]>([]);
  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    let live = true, inflight = false, expiry = 0;
    const load = () => {
      if (document.visibilityState !== "visible" || inflight) return;
      if (Date.now() >= expiry) {
        setItems((old) =>
          old.filter((i) => launchPhase(i.content, Date.now()) !== "archived")
            .map((i) => ({ ...i, score: 0, rank: null }))
        );
      }
      inflight = true;
      void cityCall<LaunchCatalog>("city-api", { action: "launch_plaza" }).then(
        (r) => {
          if (live) {
            expiry = Date.parse(r.expiresAt);
            setItems((old) => {
              if (!r.plazaEnabled) return [];
              const next = new Map(r.items.map((i) => [i.id, i]));
              return [
                ...old.flatMap((i) => {
                  const updated = next.get(i.id);
                  next.delete(i.id);
                  return updated ? [updated] : [];
                }),
                ...next.values(),
              ];
            });
          }
        },
      ).catch(() => {
        if (live) {
          expiry = Date.now() + 30000;
          setItems((old) => old.map((i) => ({ ...i, score: 0, rank: null })));
        }
      }).finally(() => {
        inflight = false;
      });
    };
    load();
    const timer = setInterval(() => {
      if (Date.now() >= expiry) load();
    }, 1000);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled, revision]);
  return items;
}
export function LaunchBrowser(
  { slug, userId, onAuth, onClose }: {
    slug?: string;
    userId?: string;
    onAuth: () => void;
    onClose: () => void;
  },
) {
  const living = useLiving();
  const [data, setData] = useState<LaunchCatalog | null>(null),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [serial, setSerial] = useState(0),
    [busy, setBusy] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setOffset(0), [filter, query, category]);
  useEffect(() => {
    let live = true, sequence = 0;
    setData(null);
    setError("");
    setCollapsed(false);
    const load = () => {
      if (document.visibilityState !== "visible") return;
      const request = ++sequence;
      void cityCall<LaunchCatalog>("city-api", {
        action: slug ? "launch_detail" : "launch_catalog",
        id: slug,
        filter,
        query,
        category,
        offset,
      }).then((r) => {
        if (live && request === sequence) setData(r);
      }).catch((e) => {
        if (live && request === sequence) {
          setError(e.message);
          setData(null);
        }
      });
    };
    const debounce = setTimeout(load, 200), timer = setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      clearTimeout(debounce);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [slug, filter, query, category, offset, serial, userId]);
  useEffect(() => {
    const root = document.querySelector(".city-launches-browser");
    if (!root || collapsed) return;
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const old = timers.get(entry.target);
        if (old) clearTimeout(old);
        timers.delete(entry.target);
        if (entry.isIntersecting && entry.intersectionRatio >= .6) {
          timers.set(
            entry.target,
            setTimeout(() => {
              if (document.visibilityState === "visible") {
                const id =
                  (entry.target as HTMLElement).dataset.launchImpression;
                if (id) {
                  void cityCommand("launch_track", { id, kind: "impression" })
                    .catch(() => {});
                }
              }
              timers.delete(entry.target);
            }, 1000),
          );
        }
      }
    }, { root, threshold: .6 });
    root.querySelectorAll("[data-launch-impression]").forEach((el) =>
      observer.observe(el)
    );
    return () => {
      observer.disconnect();
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [data?.items.map((i) => i.id).join(","), collapsed]);
  useEffect(() => {
    const item = data?.items[0];
    if (!slug || !item) return;
    void cityCommand("discovery_track", {
      kind: "launch_view",
      contextId: item.id,
      businessId: item.business_id,
    }).catch(() => {});
  }, [slug, data?.items[0]?.id]);
  async function interest(item: LaunchItem) {
    if (!userId) {
      onAuth();
      return;
    }
    setBusy(true);
    try {
      await cityCommand("launch_interest", {
        id: item.id,
        enabled: !item.viewerInterested,
      });
      setSerial((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      className={`city-launches-browser ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Launches"
    >
      <header>
        <div>
          <small>WHAT’S NEW IN THE CITY</small>
          <h2>{slug ? "Launch" : "Launch Plaza"}</h2>
        </div>
        <button onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "Expand" : "Minimise"}
        </button>
        <button onClick={onClose} aria-label="Close launches">×</button>
      </header>
      {!collapsed && (
        <>
          <p>
            New ideas. Permanent homes. Attention earned through customer
            interest.
          </p>
          {!slug && (
            <>
              <label>
                Search launches<input
                  value={query}
                  maxLength={160}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <nav aria-label="Launch filters">
                {[
                  ["all", "Discover"],
                  ["today", "Today"],
                  ["upcoming", "Coming soon"],
                  ["trending", "Trending"],
                  ["recent", "Recent"],
                  ["saved", "Saved launches"],
                ["reminders", "My reminders"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <label>
                Category<select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {[
                    "Games",
                    "AI",
                    "Apps",
                    "Shopping",
                    "Food",
                    "Fashion",
                    "Entertainment",
                    "Travel",
                    "Creators",
                    "SaaS",
                    "Physical Products",
                    "Events",
                  ].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </>
          )}
          {filter === "saved" && !userId && (
            <p>
              Saved launches on this device are in My Deals → Saved. Sign in to
              sync them across devices.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {!data && !error && <p role="status">Loading launches…</p>}
          {data?.items.length === 0 && (
            <p>
              No launches here yet. Explore another category or check back soon.
            </p>
          )}
          {data?.items.map((item) => {
            const phase = launchPhase(item.content, now);
            return (
              <article
                key={item.id}
                className={`city-launch-card phase-${phase}`}
              >
                {item.content.cover && (
                  <img
                    loading="lazy"
                    src={item.content.cover}
                    alt={item.content.title}
                  />
                )}
                <small>
                  🚀 {launchPhaseLabel[phase]} · {item.business_name}
                </small>
                <h3 data-launch-impression={item.id}>{item.content.title}</h3>
                <p>{item.content.tagline || item.content.description}</p>
                <p>
                  {new Date(item.content.startsAt).toLocaleString()}
                  {phase === "coming_soon" &&
                    ` · ${
                      Math.max(
                        1,
                        Math.ceil(
                          (Date.parse(item.content.startsAt) - now) / 60000,
                        ),
                      )
                    } min to launch`}
                </p>
                <p>
                  {item.interested} interested{item.rank
                    ? ` · #${item.rank} rolling launch rank`
                    : ""}
                </p>
                <div className="city-actions">
                  <button
                    disabled={busy}
                    aria-pressed={item.viewerInterested}
                    onClick={() => void interest(item)}
                  >
                    {item.viewerInterested ? "♥ Interested" : "♡ Interested"}
                  </button>
                  {!slug && (
                    <button
                      onClick={() =>
                        cityNavigate("/city/launches/" + item.slug)}
                    >
                      Explore launch ↗
                    </button>
                  )}
                  <CustomerSave
                    item={{
                      key: "launch:" + item.id,
                      business_id: item.business_id,
                      slug: item.business_slug,
                      business_name: item.business_name,
                      category: item.content.category || "",
                      kind: "launch",
                      content_id: item.id,
                      title: item.content.title,
                      description: item.content.description,
                      destination: "/city/launches/" + item.slug,
                      rank: null,
                      x: null,
                      z: null,
                      created_at: item.content.startsAt,
                      starts_at: item.content.startsAt,
                      ends_at: item.content.endsAt,
                      remaining: null,
                      free: false,
                      exclusive: false,
                      available: phase !== "archived",
                    } satisfies CustomerItem}
                  />
                </div>
                {slug && (
                  <>
                    <p>{item.content.description}</p>
                    {phase !== "archived" && (
                      <LaunchReminder launchId={item.id} />
                    )}
                    <div className="city-launch-gallery">
                      {item.content.screenshots?.map((src, i) => (
                        <img
                          key={src}
                          src={src}
                          alt={`${item.content.title} screenshot ${i + 1}`}
                          loading="lazy"
                        />
                      ))}
                    </div>
                    {item.content.trailer && (
                      <video
                        controls
                        preload="none"
                        src={item.content.trailer}
                        aria-label="Launch trailer"
                      />
                    )}
                    {item.content.destination && (
                      <a
                        onClick={() =>
                          void cityCommand("launch_track", {
                            id: item.id,
                            kind: "product_visit",
                          }).catch(() => {})}
                        href={item.content.destination}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Visit product ↗
                      </a>
                    )}
                    {item.content.rewardDealId && phase !== "coming_soon" &&
                      phase !== "archived" && (
                      <CityDeals
                        businessId={item.business_id}
                        userId={userId}
                        onAuth={onAuth}
                        dealId={item.content.rewardDealId}
                        sourceLaunchId={item.id}
                        autoOpen
                      />
                    )}
                    <div className="city-actions">
                      <button
                        onClick={() =>
                          cityNavigate("/city/business/" + item.business_slug)}
                      >
                        View permanent HQ
                      </button>
                      <button onClick={() => enterCampus(item.business_slug)}>
                        Enter business space
                      </button>
                      <button
                        aria-pressed={living.inbox.follows.includes(
                          item.business_id,
                        )}
                        onClick={() => {
                          if (!userId) {
                            onAuth();
                            return;
                          }
                          void cityCommand("discovery_follow", {
                            businessId: item.business_id,
                            enabled: !living.inbox.follows.includes(
                              item.business_id,
                            ),
                          }).then(() => living.refresh()).catch((e) =>
                            setError(e.message)
                          );
                        }}
                      >
                        {living.inbox.follows.includes(item.business_id)
                          ? "Following business"
                          : "Follow business"}
                      </button>
                      <button
                        onClick={() =>
                          void navigator.clipboard.writeText(
                            location.origin + "/city/launches/" + item.slug,
                          ).then(() =>
                            cityCommand("launch_track", {
                              id: item.id,
                              kind: "share",
                            })
                          ).catch(() =>
                            setError("Copy unavailable. Use the address bar.")
                          )}
                      >
                        Copy launch link
                      </button>
                      <button
                        onClick={() =>
                          void cityCall<{ id: string }>("city-api", {
                            action: "launch_share",
                            id: item.id,
                          }).then((m) => downloadMoment(m.id)).catch((e) =>
                            setError(e.message)
                          )}
                      >
                        Download launch card
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
          {!slug && (
            <div className="city-actions">
              <button
                disabled={!offset}
                onClick={() => setOffset((v) => Math.max(0, v - 25))}
              >
                Previous
              </button>
              <button
                disabled={!data?.hasMore}
                onClick={() => setOffset((v) => v + 25)}
              >
                More launches
              </button>
            </div>
          )}
          <small>
            Organic launch rank is separate from sponsored City Rank. Interest
            counts represent accounts, not concurrent visitors.
          </small>
        </>
      )}
    </aside>
  );
}
