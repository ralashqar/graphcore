import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUpRight,
  BookmarkSimple,
  Buildings,
  Compass,
  House,
  List,
  MagnifyingGlass,
  MapPin,
  ShareNetwork,
  Storefront,
  X,
} from "@phosphor-icons/react";
import {
  activeOffer,
  CITY_TIERS,
  formatGBP,
  type CityProperty,
  type CitySnapshot,
  type CityWorkspace,
} from "../../domain/city";
import { getCurrentSession, subscribeToAuthChanges } from "../../data/auth";
import { supabase } from "../../utils/supabase";
import {
  cityCall,
  cityCommand,
  cityNavigate,
  citySnapshot,
  cityWorkspace,
  downloadCityCard,
} from "./api";
import { CityAuth, CityDialog } from "./CityAuth";
import { CityManage } from "./CityManage";
import { CityAdmin } from "./CityAdmin";
import { demoCity } from "./demo";
import "./city.css";
const CityScene = lazy(() => import("./CityScene"));
const blankWorkspace: CityWorkspace = {
  business: null,
  orders: [],
  saved: [],
  claims: [],
  analytics: {},
  history: [],
  admin: false,
};

export function CityApp() {
  const [path, setPath] = useState(location.pathname),
    [snapshot, setSnapshot] = useState<CitySnapshot | null>(null),
    [selected, setSelected] = useState<CityProperty | null>(null),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<CityProperty[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [workspace, setWorkspace] = useState<CityWorkspace>(blankWorkspace);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [auth, setAuth] = useState(false),
    [report, setReport] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [directory, setDirectory] = useState(false),
    [home, setHome] = useState(0),
    [claim, setClaim] = useState<{ code: string; url: string } | null>(null),
    [sort, setSort] = useState("rank");
  const [page, setPage] = useState(0),
    [savedPlaces, setSavedPlaces] = useState<CityProperty[]>([]);
  const demo = useRef(new URLSearchParams(location.search).get("demo") === "1"),
    region = useRef({ x: 0, z: 0 }),
    requestId = useRef(0),
    latestPath = useRef(path);
  const sessionUser = useRef<string | null>(null);
  sessionUser.current = session?.user.id || null;
  latestPath.current = path;
  useEffect(() => {
    document.title = selected
      ? `${selected.profile.name} | Synarc City`
      : "Synarc City | Discover your next favourite";
  }, [selected?.profile.name]);
  const navigate = (url: string) =>
    cityNavigate(url + (demo.current ? "?demo=1" : ""));
  const refreshWorkspace = useCallback(async () => {
    const userId = sessionUser.current;
    if (demo.current || !userId) return;
    const next = await cityWorkspace();
    if (sessionUser.current === userId) setWorkspace(next);
  }, []);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const slug = latestPath.current.startsWith("/city/business/")
        ? decodeURIComponent(latestPath.current.split("/")[3])
        : undefined;
      const next = demo.current
        ? demoCity(
            new URLSearchParams(location.search).get("stress") === "1"
              ? 2000
              : 72,
          )
        : await citySnapshot({ ...region.current, slug });
      if (id !== requestId.current) return;
      setSnapshot(next);
      setError("");
      if (slug) {
        const property = next.properties.find((p) => p.slug === slug);
        if (property) setSelected(property);
        else {
          setSelected(null);
          setNotice("This property is unavailable or has not been published.");
        }
      } else setSelected(null);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const route = () => {
      setPath(location.pathname);
      setClaim(null);
    };
    window.addEventListener("popstate", route);
    void getCurrentSession()
      .then(setSession)
      .catch((e) => setError((e as Error).message));
    const unsubscribe = subscribeToAuthChanges((_, next) => {
      if (sessionUser.current !== next?.user.id) setWorkspace(blankWorkspace);
      setSession(next);
    });
    return () => {
      window.removeEventListener("popstate", route);
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    void refresh();
  }, [path, refresh]);
  useEffect(() => {
    if (demo.current) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const channel = supabase
      .channel("synarc-city-revision")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "city_state" },
        () => {
          void refresh();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    const online = () => {
      void refresh();
    };
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
      window.removeEventListener("online", online);
    };
  }, [refresh]);
  useEffect(() => {
    if (!session) {
      setWorkspace(blankWorkspace);
      return;
    }
    void refreshWorkspace().catch((e) => setError((e as Error).message));
    const pending = sessionStorage.getItem("synarc-city-intent");
    if (pending) {
      sessionStorage.removeItem("synarc-city-intent");
      try {
        const intent = JSON.parse(pending);
        void cityCommand(intent.action, { businessId: intent.id, saved: true })
          .then(() => {
            setNotice("Your action was saved.");
            return refreshWorkspace();
          })
          .catch((e) => setError(e.message));
      } catch {
        /* ignore invalid local intent */
      }
    }
  }, [session?.user.id, refreshWorkspace]);
  useEffect(() => {
    if (
      !session ||
      demo.current ||
      !["/city/manage", "/city/account"].includes(path)
    )
      return;
    void refreshWorkspace().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void refreshWorkspace().catch((e) => setError(e.message));
    }, 30000);
    return () => clearInterval(timer);
  }, [path, session?.user.id, refreshWorkspace]);
  useEffect(() => {
    setPage(0);
  }, [query, sort, directory]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!query.trim() && !directory && sort === "rank") {
        setResults([]);
        return;
      }
      try {
        const properties = demo.current
          ? [...(snapshot?.properties || [])]
              .filter((p) =>
                `${p.profile.name} ${p.profile.category} ${p.profile.offer.title}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .sort((a, b) =>
                sort === "saves"
                  ? b.saves - a.saves || a.rank - b.rank
                  : sort === "claims"
                    ? b.claims - a.claims || a.rank - b.rank
                    : a.rank - b.rank,
              )
              .slice(page * 40, page * 40 + 40)
          : (
              await cityCall<CitySnapshot>("city-api", {
                action: query ? "search" : "directory",
                query,
                sort,
                offset: page * 40,
              })
            ).properties;
        if (active) setResults(properties);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, sort, directory, page, snapshot?.revision]);
  useEffect(() => {
    if (path !== "/city/account" || !session || demo.current) return;
    let active = true;
    void cityCall<{ properties: CityProperty[] }>("city-api", {
      action: "saved",
    })
      .then((data) => {
        if (active) setSavedPlaces(data.properties);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [path, session?.user.id, workspace.saved.join(",")]);
  useEffect(() => {
    if (!selected || demo.current) return;
    const timer = setTimeout(() => {
      void cityCommand("track", {
        businessId: selected.id,
        kind: "view",
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [selected?.id]);
  const onRegion = useCallback(
    (x: number, z: number) => {
      region.current = { x, z };
      if (!demo.current) void refresh();
    },
    [refresh],
  );
  function select(p: CityProperty) {
    setSelected(p);
    setQuery("");
    setClaim(null);
    setNotice("");
    navigate(`/city/business/${p.slug}`);
  }
  async function interaction(action: "save_business" | "claim") {
    if (!selected) return;
    if (demo.current) {
      setNotice(
        "This is a demonstration property. Saves and offers open with the live city.",
      );
      return;
    }
    if (!session) {
      sessionStorage.setItem(
        "synarc-city-intent",
        JSON.stringify({ action, id: selected.id }),
      );
      setAuth(true);
      return;
    }
    setBusy(true);
    try {
      const result = await cityCommand<{ code: string; url: string }>(action, {
        businessId: selected.id,
        saved: !workspace.saved.includes(selected.id),
      });
      if (action === "claim") setClaim(result);
      await refreshWorkspace();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const map = path === "/city" || path.startsWith("/city/business/"),
    management = path === "/city/manage",
    admin = path === "/city/admin",
    account = path === "/city/account";
  const globalDiscovery = !!query || directory || sort !== "rank";
  const properties = globalDiscovery ? results : snapshot?.properties || [];
  return (
    <div className="city-app">
      <header className="city-header">
        <a className="city-wordmark" href="/" aria-label="Synarc home">
          <span className="city-brand-symbol">
            <Buildings weight="fill" size={25} />
          </span>
          synarc<span className="city-wordmark-divider">/</span>
          <span>city</span>
        </a>
        <nav aria-label="City navigation">
          <button
            className={map ? "is-active" : ""}
            onClick={() => navigate("/city")}
          >
            <Compass size={18} />
            Explore
          </button>
          <button
            className={account ? "is-active" : ""}
            onClick={() => navigate("/city/account")}
          >
            <BookmarkSimple size={18} />
            Saved places
          </button>
          {workspace.admin && (
            <button onClick={() => navigate("/city/admin")}>Operations</button>
          )}
        </nav>
        <div className="city-header-actions">
          <button
            className="city-mobile-saves"
            aria-label="Saved places"
            onClick={() => navigate("/city/account")}
          >
            <BookmarkSimple size={19} />
          </button>
          {session ? (
            <button
              className="city-signin"
              onClick={async () => {
                await supabase.auth.signOut();
                setSession(null);
              }}
            >
              Sign out
            </button>
          ) : (
            <button className="city-signin" onClick={() => setAuth(true)}>
              Sign in
            </button>
          )}
          <button
            className="city-primary"
            aria-label="Your business"
            onClick={() => navigate("/city/manage")}
          >
            <Storefront size={18} />
            <span>Your business</span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </header>
      {demo.current && (
        <div className="city-demo-banner">
          DEMONSTRATION CITY{" "}
          <span>Fictional businesses · no real purchases or offers</span>
          <a href="/city">
            View live city <ArrowUpRight size={14} />
          </a>
        </div>
      )}
      {error && (
        <div className="city-error" role="alert">
          {error}
          <button
            onClick={() => {
              void refresh();
            }}
          >
            Retry
          </button>
          {!snapshot && <a href="/city?demo=1">Explore the demonstration</a>}
        </div>
      )}
      {notice && (
        <div className="city-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {map ? (
        <main
          className={
            directory ? "city-map-shell is-directory" : "city-map-shell"
          }
        >
          <div
            className="city-canvas"
            aria-label="Interactive city map. Drag to pan, scroll to zoom, or use arrow keys."
            tabIndex={0}
          >
            {loading ? (
              <div className="city-map-loading">
                <div />
                <p>Finding your perspective…</p>
              </div>
            ) : snapshot && !directory ? (
              <Suspense
                fallback={
                  <div className="city-map-loading">Building the city…</div>
                }
              >
                <CityScene
                  properties={snapshot.properties}
                  capacity={snapshot.capacity}
                  selected={selected}
                  home={home}
                  onSelect={select}
                  onRegion={onRegion}
                  onFailure={() => {
                    setDirectory(true);
                    setNotice(
                      "The 3D map is unavailable. You can explore every business in the directory.",
                    );
                  }}
                />
              </Suspense>
            ) : null}
          </div>
          <aside className="city-discovery">
            <div className="city-discovery-heading">
              <p className="city-eyebrow">
                <span className="city-live-dot" /> A NEW KIND OF HIGH STREET
              </p>
              <h1>
                Good things
                <br />
                live here.
              </h1>
              <p>
                Discover your next favourite.
                <br />
                One neighbourhood at a time.
              </p>
            </div>
            <label className="city-search">
              <MagnifyingGlass size={20} />
              <input
                aria-label="Search the city"
                placeholder="Find a brand, idea or offer"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={160}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={16} />
                </button>
              )}
            </label>
            <div className="city-directory-heading">
              <span>
                {query
                  ? "SEARCH RESULTS"
                  : sort === "rank"
                    ? "AROUND THE PLAZA"
                    : "COMMUNITY FAVOURITES"}
              </span>
              <select
                aria-label="Discovery order"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="rank">Land Value</option>
                <option value="saves">Most saved</option>
                <option value="claims">Most claimed</option>
              </select>
            </div>
            <div className="city-property-list">
              {properties.slice(0, globalDiscovery ? 40 : 6).map((p) => (
                <button
                  className={`city-property-row ${p.id === selected?.id ? "is-selected" : ""}`}
                  key={p.id}
                  onClick={() => select(p)}
                >
                  <span
                    className="city-brand-avatar"
                    style={{ background: p.profile.color }}
                  >
                    {p.profile.logo ? (
                      <img src={p.profile.logo} alt="" />
                    ) : (
                      p.profile.name.slice(0, 1)
                    )}
                  </span>
                  <span>
                    <strong>{p.profile.name}</strong>
                    <small>
                      {p.profile.category}
                      {activeOffer(p.profile) ? " · Offer available" : ""}
                    </small>
                  </span>
                  <span className="city-rank">
                    {sort === "rank"
                      ? `#${p.rank}`
                      : sort === "saves"
                        ? `${p.saves} saves`
                        : `${p.claims} claims`}
                  </span>
                </button>
              ))}
              {!loading && !properties.length && (
                <div className="city-list-empty">
                  <MapPin size={28} />
                  <p>
                    {query
                      ? "No matches yet. Try another business or category."
                      : "The first addresses are waiting."}
                  </p>
                  {!query && (
                    <button onClick={() => navigate("/city/manage")}>
                      Bring your business here
                    </button>
                  )}
                </div>
              )}
            </div>
            {globalDiscovery && (
              <div className="city-pagination">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>Page {page + 1}</span>
                <button
                  disabled={properties.length < 40}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
            <div className="city-discovery-footer">
              <span>
                Money buys geography.
                <br />
                <strong>Engagement creates life.</strong>
              </span>
              <span className="city-coordinate">CITY / 01</span>
            </div>
          </aside>
          <div className="city-map-tools">
            <button
              aria-label="Return to Central Plaza"
              onClick={() => {
                setSelected(null);
                setHome((h) => h + 1);
                navigate("/city");
              }}
            >
              <House size={20} />
              <span>Central Plaza</span>
            </button>
            <button
              aria-pressed={directory}
              onClick={() => setDirectory((v) => !v)}
            >
              <List size={20} />
              <span>{directory ? "3D map" : "Directory"}</span>
            </button>
          </div>
          <div className="city-map-caption">
            <span>EXPLORE AT YOUR OWN PACE</span>
            <p>
              Drag to explore <span>·</span> Scroll to get closer
            </p>
          </div>
          {snapshot && (
            <div className="city-city-status">
              <span className="city-live-dot" />
              {snapshot.total} neighbours <span>·</span> {snapshot.capacity}{" "}
              addresses
            </div>
          )}
          {selected && (
            <aside
              className="city-property-panel"
              aria-label={`${selected.profile.name} property`}
            >
              <div
                className="city-panel-cover"
                style={{ background: selected.profile.color }}
              >
                {selected.profile.hero ? (
                  <img
                    src={selected.profile.hero}
                    alt={`${selected.profile.name} showcase`}
                  />
                ) : (
                  <div className="city-cover-architecture">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <button
                  className="city-panel-close"
                  aria-label="Close property"
                  onClick={() => {
                    setSelected(null);
                    navigate("/city");
                  }}
                >
                  <X size={20} />
                </button>
                <span className="city-sponsored">SPONSORED LOCATION</span>
              </div>
              <div className="city-panel-content">
                <div className="city-property-meta">
                  <span>{selected.profile.category}</span>
                  <span>City #{selected.rank}</span>
                </div>
                <h2>{selected.profile.name}</h2>
                <p className="city-tagline">{selected.profile.tagline}</p>
                <div className="city-property-stats">
                  <div>
                    <strong>{formatGBP(selected.landValue)}</strong>
                    <small>Land Value</small>
                  </div>
                  <div>
                    <strong>{CITY_TIERS[selected.tier].name}</strong>
                    <small>Property type</small>
                  </div>
                </div>
                <p>{selected.profile.description}</p>
                {selected.profile.video && (
                  <video
                    controls
                    preload="none"
                    poster={selected.profile.hero || undefined}
                    src={selected.profile.video}
                  />
                )}
                {activeOffer(selected.profile) && (
                  <section className="city-offer">
                    <span className="city-eyebrow">SOMETHING FOR YOU</span>
                    <h3>{selected.profile.offer.title}</h3>
                    <p>{selected.profile.offer.description}</p>
                    {selected.profile.offer.expiresAt && (
                      <small>
                        Ends{" "}
                        {new Date(
                          selected.profile.offer.expiresAt,
                        ).toLocaleString()}
                      </small>
                    )}
                    {claim ? (
                      <div className="city-claimed">
                        <strong>
                          {claim.code || "Offer saved to your history"}
                        </strong>
                        {claim.url && (
                          <a
                            href={claim.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open offer <ArrowUpRight size={16} />
                          </a>
                        )}
                      </div>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => interaction("claim")}
                      >
                        Claim offer <ArrowUpRight size={16} />
                      </button>
                    )}
                  </section>
                )}
                <a
                  className="city-primary city-website"
                  href={selected.profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (!demo.current)
                      void cityCommand("track", {
                        businessId: selected.id,
                        kind: "click",
                      }).catch(() => {});
                  }}
                >
                  Visit website <ArrowUpRight size={18} />
                </a>
                <div className="city-actions">
                  <button
                    disabled={busy}
                    aria-pressed={workspace.saved.includes(selected.id)}
                    onClick={() => interaction("save_business")}
                  >
                    <BookmarkSimple
                      weight={
                        workspace.saved.includes(selected.id)
                          ? "fill"
                          : "regular"
                      }
                      size={19}
                    />
                    {workspace.saved.includes(selected.id)
                      ? "Saved"
                      : "Save place"}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await downloadCityCard(
                          selected.profile.name,
                          selected.rank,
                          formatGBP(selected.landValue),
                          selected.profile.color,
                        );
                        if (!demo.current)
                          void cityCommand("track", {
                            businessId: selected.id,
                            kind: "share",
                          }).catch(() => {});
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <ShareNetwork size={19} />
                    Share card
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(location.href);
                        setNotice("Property link copied.");
                      } catch {
                        setNotice(
                          "Copy the address from your browser to share this property.",
                        );
                      }
                    }}
                  >
                    Copy link
                  </button>
                </div>
                <small className="city-placement-note">
                  Paid location is not an endorsement. Offers are provided by
                  the business.
                </small>
                <button
                  className="city-text-button"
                  onClick={() => {
                    if (demo.current) {
                      setNotice("Demonstration property.");
                      return;
                    }
                    if (!session) {
                      setAuth(true);
                      return;
                    }
                    setReport(true);
                  }}
                >
                  Report this property
                </button>
              </div>
            </aside>
          )}
          {snapshot && snapshot.events.length > 0 && (
            <div className="city-activity">
              <span>CITY JOURNAL</span>
              <p>
                {snapshot.events[0].name}{" "}
                {snapshot.events[0].kind === "arrival"
                  ? "arrived at"
                  : snapshot.events[0].kind === "upgrade"
                    ? "upgraded their building at"
                    : `moved ${snapshot.events[0].fromRank ? `from #${snapshot.events[0].fromRank} ` : ""}to`}{" "}
                #{snapshot.events[0].toRank}
              </p>
            </div>
          )}
        </main>
      ) : (
        <main className="city-page">
          <button className="city-back" onClick={() => navigate("/city")}>
            <ArrowLeft size={18} />
            Back to the city
          </button>
          {!session ? (
            <section className="city-signin-page">
              <p className="city-eyebrow">YOUR SYNARC ACCOUNT</p>
              <h1>
                {management
                  ? "Give your business an address."
                  : "Keep your favourite places close."}
              </h1>
              <p>
                Sign in to{" "}
                {management
                  ? "create a property, submit it for review and manage your position."
                  : "save businesses and keep track of offers."}
              </p>
              <button className="city-primary" onClick={() => setAuth(true)}>
                Sign in or create an account
              </button>
            </section>
          ) : management ? (
            <CityManage
              workspace={workspace}
              snapshot={snapshot}
              onRefresh={refreshWorkspace}
            />
          ) : admin ? (
            <CityAdmin />
          ) : account ? (
            <section className="city-management">
              <header className="city-page-heading">
                <p className="city-eyebrow">YOUR NEIGHBOURHOOD</p>
                <h1>Places worth coming back to.</h1>
              </header>
              <h2>Saved businesses</h2>
              {workspace.saved.length ? (
                workspace.saved.map((id) => {
                  const p =
                    savedPlaces.find((p) => p.id === id) ||
                    snapshot?.properties.find((p) => p.id === id);
                  return (
                    <button
                      className="city-account-place"
                      key={id}
                      onClick={async () => {
                        if (p) select(p);
                        else {
                          try {
                            const data = await cityCall<{
                              properties: CityProperty[];
                            }>("city-api", { action: "saved" });
                            const found = data.properties.find(
                              (p) => p.id === id,
                            );
                            if (found) select(found);
                            else
                              setNotice(
                                "This saved property is currently unavailable.",
                              );
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }
                      }}
                    >
                      <BookmarkSimple size={20} />
                      {p?.profile.name || "Open saved property"}
                      <ArrowUpRight size={18} />
                    </button>
                  );
                })
              ) : (
                <p>Save a business while exploring and it will appear here.</p>
              )}
              <h2>Offer history</h2>
              {workspace.claims.length ? (
                workspace.claims.map((c, i) => (
                  <p key={`${c.business_id}-${i}`}>
                    {new Date(c.created_at).toLocaleDateString()} ·{" "}
                    {c.business_name} · {c.offer.title}{" "}
                    {c.offer.code && <code>{c.offer.code}</code>}
                  </p>
                ))
              ) : (
                <p>
                  Your claimed offers will appear here. Claims record interest,
                  not verified purchases.
                </p>
              )}
            </section>
          ) : (
            <p>Page not found.</p>
          )}
        </main>
      )}
      {auth && (
        <CityAuth
          onClose={() => setAuth(false)}
          onSuccess={() => {
            void getCurrentSession().then(setSession);
          }}
        />
      )}
      {report && selected && (
        <CityDialog
          title="Report this property"
          onClose={() => setReport(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await cityCommand("report", {
                  businessId: selected.id,
                  reason,
                });
                setReport(false);
                setReason("");
                setNotice("Your report has been submitted for review.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              What should we review?
              <textarea
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="city-primary" disabled={busy}>
              Submit report
            </button>
          </form>
        </CityDialog>
      )}
    </div>
  );
}
