import { BusinessLaunchHistory, LaunchBrowser, useLaunchPlaza } from "./CityLaunches";
import {
  LaunchReminder,
  LivingInbox,
  LivingProvider,
  StorefrontBadge,
} from "./CityLiving";
import {
  BusinessDestination,
  CityAbout,
  TakeoverResult,
  useClearCityViewport,
} from "./CityLanding";
import { initialWelcome } from "../../domain/cityLanding";
import { CityMarketBoard } from "./CityMarket";
import type { MarketPlayback } from "./CityMarketMotion";
import { type MarketEvent, marketHeadline } from "../../domain/cityMarket";
import {
  CustomerDiscovery,
  CustomerProvider,
  CustomerSave,
} from "./CityCustomer";
import { businessItem, type CustomerItem } from "../../domain/cityCustomer";
import { CityDeals, CityDealWallet } from "./CityDeals";
import CityCampus, { enterCampus } from "./CityCampus";
import { CityDiscovery } from "./CityDiscovery";
import { CitySample } from "./CitySample";
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
  type CityProperty,
  type CitySnapshot,
  type CityWorkspace,
  emptyCityProfile,
  formatGBP,
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
  const [welcome, setWelcome] = useState(() => {
    try {
      return initialWelcome(
        localStorage,
        location.pathname,
        sessionStorage.getItem("city-discovery-query") || "",
      );
    } catch {
      return location.pathname === "/city";
    }
  });
  const [about, setAbout] = useState<"city" | "business" | null>(null);
  const [marketOpen, setMarketOpen] = useState(0);
  const [lastMarketEvent, setLastMarketEvent] = useState<MarketEvent | null>(
    null,
  );
  useEffect(() => {
    if (!lastMarketEvent) return;
    const timer = setTimeout(() => setLastMarketEvent(null), 20000);
    return () => clearTimeout(timer);
  }, [lastMarketEvent]);
  const [centralLeader, setCentralLeader] = useState<CityProperty | null>(null);
  const explore = useCallback(() => {
    setWelcome(false);
    try {
      localStorage.setItem("city-explored-v1", "1");
    } catch {}
  }, []);

  const [sceneReady, setSceneReady] = useState(false);
  const [queuedPlayback, setQueuedPlayback] = useState<MarketPlayback | null>(
    null,
  );
  const markSceneReady = useCallback(() => setSceneReady(true), []);
  useEffect(() => {
    if (sceneReady && queuedPlayback) {
      setMarketPlayback({ ...queuedPlayback, started: performance.now() });
      setQueuedPlayback(null);
    }
  }, [sceneReady, queuedPlayback]);
  const [marketPlayback, setMarketPlayback] = useState<MarketPlayback | null>(
    null,
  );
  useEffect(() => {
    if (!marketPlayback) return;
    const timer = setTimeout(() => setMarketPlayback(null), 3300);
    return () => clearTimeout(timer);
  }, [marketPlayback]);
  const [path, setPath] = useState(location.pathname),
    [snapshot, setSnapshot] = useState<CitySnapshot | null>(null),
    [selected, setSelected] = useState<CityProperty | null>(null),
    [query, setQuery] = useState(() => {
      try {
        return sessionStorage.getItem("city-discovery-query") || "";
      } catch {
        return "";
      }
    }),
    [results, setResults] = useState<CityProperty[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [workspace, setWorkspace] = useState<CityWorkspace>(blankWorkspace);
  useEffect(() => {
    if (path !== "/city") explore();
  }, [path, explore]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [auth, setAuth] = useState(false),
    [report, setReport] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [directory, setDirectory] = useState(false),
    [driving, setDriving] = useState(false),
    [home, setHome] = useState(0),
    [claim, setClaim] = useState<{ code: string; url: string } | null>(null),
    [sort, setSort] = useState("rank");
  const [page, setPage] = useState(0),
    [savedPlaces, setSavedPlaces] = useState<CityProperty[]>([]);
  const [savedStorefronts, setSavedStorefronts] = useState<
    { id: string; slug: string; name: string }[]
  >([]);
  useEffect(() => {
    try {
      sessionStorage.setItem("city-discovery-query", query);
    } catch {}
  }, [query]);
  const [customerMatches, setCustomerMatches] = useState<string[] | null>(null);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  useEffect(() => setSheetCollapsed(false), [path]);
  const [nearbyMarkers, setNearbyMarkers] = useState<CustomerItem[]>([]);
  const [nearbyCenter, setNearbyCenter] = useState({ x: 0, z: 0 });
  const [customerMarkers, setCustomerMarkers] = useState<CustomerItem[]>([]);
  const updateCustomerResults = useCallback(
    (items: CustomerItem[], filtered: boolean, matches?: string[]) => {
      setCustomerMarkers(items);
      setCustomerMatches(
        filtered ? matches || items.map((i) => i.business_id) : null,
      );
    },
    [],
  );
  const [linkedDeal, setLinkedDeal] = useState<CustomerItem | null>(null);
  const customerEnabled = !!snapshot?.customerDiscoveryEnabled;
  const viewport = useClearCityViewport(
    `${welcome}:${path}:${snapshot?.marketEnabled}:${!!selected}:${sceneReady}`,
  );
  useEffect(() => {
    if (!customerEnabled) return;
    let live = true;
    const timer = setTimeout(() => {
      void cityCall<{ items: CustomerItem[] }>("city-api", {
        action: "customer_nearby",
        ...nearbyCenter,
      }).then((r) => {
        if (live) setNearbyMarkers(r.items || []);
      }).catch(() => {
        if (live) setNearbyMarkers([]);
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [customerEnabled, nearbyCenter.x, nearbyCenter.z, snapshot?.revision]);
  const richLaunches = !!snapshot?.launchesEnabled;
  const launchBrowse = richLaunches && path === "/city/launches";
  const richLaunchRoute = richLaunches && path.startsWith("/city/launches/");
  const plazaItems = useLaunchPlaza(richLaunches && !!snapshot?.launchPlazaEnabled, snapshot?.revision || 0);
  const launchRoute = (!!snapshot?.storefrontsEnabled || richLaunches) &&
    path.startsWith("/city/launches/");
  const dealRoute = path.startsWith("/city/deal/");
  useEffect(() => {
    if ((!dealRoute && !launchRoute) || !customerEnabled) {
      setLinkedDeal(null);
      return;
    }
    let live = true;
    setLinkedDeal(null);
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void cityCall<CustomerItem>("city-api", {
        action: launchRoute ? "customer_resolve_launch" : "customer_resolve",
        id: path.split("/")[3],
      })
        .then(async (item) => {
          const city = await citySnapshot({
            ...region.current,
            slug: item.slug,
          });
          if (live) {
            setLinkedDeal(item);
            setSnapshot(city);
            setSelected(
              city.properties.find((p) => p.id === item.business_id) || null,
            );
          }
        })
        .catch((e) => {
          if (live) {
            setNotice(e.message);
            setLinkedDeal(null);
          }
        });
    };
    load();
    const timer = setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [path, customerEnabled, launchRoute]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setFollowingIds([]);
    if (!selected || !session || !snapshot?.discoveryEnabled || demo.current) {
      return;
    }
    void cityCall<{ follows: string[] }>("city-api", {
      action: "discovery_catalog",
      slug: selected.slug,
    })
      .then((d) => {
        if (active) setFollowingIds(d.follows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selected?.id, session?.user.id, snapshot?.discoveryEnabled]);
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
  const navigate = (url: string) => {
    const target = new URL(url, location.origin);
    if (demo.current) {
      target.searchParams.set("demo", "1");
      const rendering = new URLSearchParams(location.search).get("cityRender");
      if (rendering) target.searchParams.set("cityRender", rendering);
    }
    cityNavigate(target.pathname + target.search + target.hash);
  };
  const reportExposure = useCallback(
    (ids: string[], kind: "canvas" | "card") => {
      if (!snapshot?.exposureEnabled || demo.current) return;
      void cityCommand("market_exposure", { ids, kind }).catch(() => {});
    },
    [snapshot?.exposureEnabled],
  );
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
          new URLSearchParams(location.search).get("cityRender") === "corporate",
          [null, "presets"].includes(new URLSearchParams(location.search).get("cityRender")),
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
          if (!next.discoveryEnabled && !next.campusEnabled && !demo.current) {
            setNotice(
              "This property is unavailable or has not been published.",
            );
          }
        }
      } else if (
        !latestPath.current.startsWith("/city/deal/") &&
        !latestPath.current.startsWith("/city/launches/")
      ) {
        setSelected(null);
      }
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
    ) {
      return;
    }
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
      if (customerEnabled || (!query.trim() && !directory && sort === "rank")) {
        setResults([]);
        return;
      }
      try {
        const properties = demo.current
          ? [...(snapshot?.properties || [])]
            .filter((p) =>
              `${p.profile.name} ${p.profile.category} ${p.profile.offer.title}`
                .toLowerCase()
                .includes(query.toLowerCase())
            )
            .sort((a, b) =>
              sort === "saves"
                ? b.saves - a.saves || a.rank - b.rank
                : sort === "claims"
                ? b.claims - a.claims || a.rank - b.rank
                : a.rank - b.rank
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
  }, [query, sort, directory, page, snapshot?.revision, customerEnabled]);
  useEffect(() => {
    if (path !== "/city/account" || !session || demo.current) return;
    let active = true;
    void cityCall<{
      properties: CityProperty[];
      storefronts?: { id: string; slug: string; name: string }[];
    }>("city-api", {
      action: "saved",
    })
      .then((data) => {
        if (active) {
          setSavedPlaces(data.properties);
          setSavedStorefronts(data.storefronts || []);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [path, session?.user.id, workspace.saved.join(",")]);
  useEffect(() => {
    if (!selected || demo.current) return;
    const timer = setTimeout(() => {
      if (snapshot?.customerDiscoveryEnabled) {
        void cityCommand("customer_track", {
          businessId: selected.id,
          kind: "property_open",
        }).catch(() => {});
      }
      void cityCommand("track", {
        businessId: selected.id,
        kind: "view",
        source: new URLSearchParams(location.search).get("source") || "city",
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [selected?.id]);
  const onRegion = useCallback(
    (x: number, z: number) => {
      region.current = { x, z };
      setNearbyCenter((previous) =>
        Math.abs(previous.x - x) > 2 || Math.abs(previous.z - z) > 2
          ? { x, z }
          : previous
      );
      if (!demo.current) void refresh();
    },
    [refresh],
  );
  function select(p: CityProperty, source = "city") {
    explore();
    setSelected(p);
    setQuery("");
    setClaim(null);
    setNotice("");
    navigate(`/city/business/${p.slug}?source=${source}`);
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
  const campusRoute = /^\/city\/business\/[^/]+\/space(?:\/|$)/.test(path);
  const campusEnabled = demo.current || !!snapshot?.campusEnabled;
  const discoveryEnabled = demo.current || !!snapshot?.discoveryEnabled;
  const discoveryRoute = path === "/city/discover" ||
    path === "/city/following" ||
    path.startsWith("/city/trails/") ||
    (path.startsWith("/city/launches/") && !launchRoute) ||
    (discoveryEnabled &&
      !!snapshot &&
      path.startsWith("/city/business/") &&
      !snapshot.properties.some(
        (p) => p.slug === decodeURIComponent(path.split("/")[3] || ""),
      ));
  const map = !discoveryRoute &&
      (path === "/city" || path.startsWith("/city/business/") || dealRoute ||
        launchRoute || launchBrowse),
    management = path === "/city/manage",
    admin = path === "/city/admin",
    account = path === "/city/account";
  const globalDiscovery = !!query || directory || sort !== "rank";
  const properties = globalDiscovery ? results : snapshot?.properties || [];
  return (
    <CustomerProvider
      key={session?.user.id || "guest"}
      enabled={customerEnabled}
      userId={session?.user.id}
      onAuth={() => setAuth(true)}
    >
      <LivingProvider
        enabled={customerEnabled &&
          !!(snapshot?.storefrontsEnabled || snapshot?.activityEnabled || richLaunches) &&
          !demo.current}
        storefronts={!!snapshot?.storefrontsEnabled}
        deals={!!snapshot?.dealsEnabled}
        launches={!!snapshot?.campusEnabled || richLaunches}
        ids={[
          ...(selected ? [selected.id] : []),
          ...(workspace.business ? [workspace.business.id] : []),
          ...(snapshot?.properties.map((p) => p.id) || []),
        ]}
        userId={session?.user.id}
        onAuth={() => setAuth(true)}
        revision={snapshot?.revision}
      >
        <div
          className={`city-app ${driving ? "city-is-driving" : ""} ${
            customerEnabled ? "city-customer-enabled" : ""
          } ${welcome ? "city-landing-welcome" : "city-landing-compact"}`}
        >
          <header className="city-header">
            <a className="city-wordmark" href="/" aria-label="Synarc home">
              <span className="city-brand-symbol">
                <img src="/brand/synarc-logo.png" alt="" />
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
              {(snapshot?.marketEnabled || demo.current) && (
                <button
                  onClick={() => {
                    navigate("/city");
                    setMarketOpen((v) => v + 1);
                  }}
                >
                  Top spots
                </button>
              )}
              {discoveryEnabled && (
                <button onClick={() => navigate("/city/discover")}>
                  Discover
                </button>
              )}
              {workspace.admin && (
                <button onClick={() => navigate("/city/admin")}>
                  Operations
                </button>
              )}
            </nav>
            <div className="city-header-actions">
              <LivingInbox />
              <button
                className="city-about-nav"
                onClick={() => setAbout("city")}
              >
                About City
              </button>
              <button
                className="city-mobile-saves"
                aria-label="Saved places"
                onClick={() => navigate("/city/account")}
              >
                <BookmarkSimple size={19} />
              </button>
              {session
                ? (
                  <button
                    className="city-signin"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setSession(null);
                    }}
                  >
                    Sign out
                  </button>
                )
                : (
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
              <span>{new URLSearchParams(location.search).get("cityRender") === "corporate" ? "Unofficial brand concepts · simulated positions · no affiliation" : "Fictional businesses · no real purchases or offers"}</span>
              <label>View <select aria-label="Demo city rendering" value={new URLSearchParams(window.location.search).get("cityRender") || "presets"}
                onChange={e => { const url=new URL(window.location.href);url.searchParams.set("cityRender",e.target.value);window.location.assign(url.toString()); }}>
                <option value="presets">Customised 3D buildings</option>
                <option value="sprites">Illustrated buildings</option>
                <option value="corporate">Nike / Slack / Zoom concepts</option>
                <option value="empty">Roads &amp; plots</option>
                <option value="offices">3D offices</option>
              </select></label>
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
              {!snapshot && (
                <a href="/city?demo=1">Explore the demonstration</a>
              )}
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
          {campusRoute
            ? (
              campusEnabled
                ? (
                  <Suspense
                    fallback={
                      <main className="city-page">Opening business space…</main>
                    }
                  >
                    <CityCampus
                      dealsEnabled={snapshot?.dealsEnabled}
                      path={path}
                      demo={demo.current}
                      userId={session?.user.id}
                      onAuth={() => setAuth(true)}
                    />
                  </Suspense>
                )
                : (
                  <main className="city-page">
                    Business spaces are not open yet.
                  </main>
                )
            )
            : discoveryRoute
            ? (
              discoveryEnabled
                ? (
                  <CityDiscovery
                    path={path}
                    demo={demo.current}
                    userId={session?.user.id}
                    snapshot={snapshot}
                    navigate={navigate}
                    onAuth={() => setAuth(true)}
                  />
                )
                : (
                  <main className="city-page">
                    <p>Discovery is not open yet.</p>
                  </main>
                )
            )
            : map
            ? (
              <main
                className={directory
                  ? "city-map-shell is-directory"
                  : "city-map-shell"}
              >
                <div
                  className="city-canvas"
                  aria-label={driving ? "Drive the city. WASD or arrow keys to drive, Space to brake, Escape to return to map." : "Interactive city map. Drag to pan, scroll to zoom, or use arrow keys."}
                  tabIndex={0}
                >
                  {loading
                    ? (
                      <div className="city-map-loading">
                        <div />
                        <p>Finding your perspective…</p>
                      </div>
                    )
                    : snapshot && !directory
                    ? (
                      <Suspense
                        fallback={
                          <div className="city-map-loading">
                            Building the city…
                          </div>
                        }
                      >
                        <CityScene driving={driving} onExitDriving={()=>setDriving(false)}
                          estateDemo={demo.current}
                          launches={plazaItems}
                          launchActivity={!!snapshot.activityEnabled}
                          launchFocus={!!snapshot.launchPlazaEnabled && (launchBrowse || (richLaunchRoute && plazaItems.some(i=>i.slug===path.split("/")[3])))}
                          onReady={markSceneReady}
                          viewport={viewport}
                          central={centralLeader ||
                            snapshot.properties.find((p) => p.rank === 1) ||
                            null}
                          onExplore={explore}
                          onExposure={snapshot.exposureEnabled && !demo.current
                            ? reportExposure
                            : undefined}
                          playback={marketPlayback}
                          pavilion={snapshot.discoveryEnabled || demo.current
                            ? {}
                            : undefined}
                          properties={marketPlayback
                            ? [
                              ...snapshot.properties.filter(
                                (p) =>
                                  !marketPlayback.event.moves.some(
                                    (m) => m.id === p.id,
                                  ),
                              ),
                              ...marketPlayback.event.moves.flatMap((m) =>
                                m.after
                                  ? [
                                    {
                                      id: m.id,
                                      slug: m.after.slug,
                                      profile: {
                                        ...emptyCityProfile(),
                                        name: m.after.name,
                                        color: m.after.color,
                                        logo: m.after.logo || "",
                                        billboard: m.after.billboard || "",
                                        billboardCrop: m.after.billboardCrop,
                                      },
                                      rank: m.after.rank,
                                      landValue: m.after.value,
                                      x: m.after.x,
                                      z: m.after.z,
                                      tier: m.after.tier,
                                      saves: 0,
                                      claims: 0,
                                    },
                                  ]
                                  : []
                              ),
                            ]
                            : snapshot.properties}
                          matches={launchBrowse || richLaunchRoute ? [...plazaItems.map(i=>i.business_id),...(linkedDeal?[linkedDeal.business_id]:[])] : customerMatches}
                          markers={customerEnabled
                            ? (customerMatches
                              ? customerMarkers
                              : nearbyMarkers)
                            : undefined}
                          onDiscoverySelect={(item) =>
                            navigate(item.destination)}
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
                    )
                    : null}
                </div>
                {(snapshot?.marketEnabled || demo.current) && snapshot && (
                  <CityMarketBoard
                    openToken={marketOpen}
                    onLeader={setCentralLeader}
                    onExposure={reportExposure}
                    exposureEnabled={!!snapshot.exposureEnabled &&
                      !demo.current}
                    demoProperties={demo.current
                      ? snapshot.properties
                      : undefined}
                    revision={snapshot.revision}
                    onSelect={(p) => select(p, "paid_top_spots")}
                    onChallenge={() => {
                      explore();
                      navigate("/city/manage?challenge=1#city-next-move");
                    }}
                    onTransition={(event, replay) => {
                      setLastMarketEvent(event);
                      if (replay) {
                        if (launchBrowse || richLaunchRoute) navigate("/city");
                        setSelected(null);
                        setHome((h) => h + 1);
                      }
                      (sceneReady ? setMarketPlayback : setQueuedPlayback)({
                        event,
                        started: performance.now(),
                        replay,
                      });
                    }}
                  />
                )}
                {lastMarketEvent && !marketPlayback && (
                  <TakeoverResult
                    event={lastMarketEvent}
                    onClose={() => setLastMarketEvent(null)}
                    onReplay={() => {
                      if (launchBrowse || richLaunchRoute) navigate("/city");
                      setDriving(false);
                      setSelected(null);
                      setHome((h) => h + 1);
                      setMarketPlayback({
                        event: lastMarketEvent,
                        started: performance.now(),
                        replay: true,
                      });
                    }}
                  />
                )}
                {marketPlayback && (
                  <div className="city-market-replay" role="status">
                    {marketPlayback.replay
                      ? "Historical movement replay"
                      : "Live city movement"} ·{" "}
                    {marketHeadline(marketPlayback.event)}
                  </div>
                )}
                <aside
                  className="city-discovery"
                  onClickCapture={(e) => {
                    if (
                      (e.target as HTMLElement).closest(
                        "input,select,.city-property-row,.city-customer-result",
                      )
                    ) explore();
                  }}
                >
                  {(customerEnabled || demo.current)
                    ? (
                      <CustomerDiscovery
                        onLaunches={richLaunches ? ()=>navigate("/city/launches") : undefined}
                        demoProperties={demo.current
                          ? snapshot?.properties
                          : undefined}
                        onExplore={explore}
                        query={query}
                        onQuery={(value) => {
                          explore();
                          setQuery(value);
                        }}
                        onResults={updateCustomerResults}
                        onChoose={(item) => {
                          explore();
                          navigate(
                            item.destination +
                              (item.destination.includes("?")
                                ? "&source="
                                : "?source=") +
                              (item.kind === "deal" ? "deal" : "organic"),
                          );
                        }}
                      />
                    )
                    : (
                      <>
                        <div className="city-discovery-heading">
                          <p className="city-eyebrow">
                            <span className="city-live-dot" />{" "}
                            A NEW KIND OF HIGH STREET
                          </p>
                          <h1>
                            Discover what’s happening here.
                          </h1>
                          <p>
                            Explore businesses, exclusive deals, new launches
                            and experiences.
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
                            <button
                              aria-label="Clear search"
                              onClick={() => setQuery("")}
                            >
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
                            <option value="rank">City Value</option>
                            <option value="saves">Most saved</option>
                            <option value="claims">Most claimed</option>
                          </select>
                        </div>
                        <div className="city-property-list">
                          {properties.slice(0, globalDiscovery ? 40 : 6).map((
                            p,
                          ) => (
                            <button
                              className={`city-property-row ${
                                p.id === selected?.id ? "is-selected" : ""
                              }`}
                              key={p.id}
                              onClick={() => select(p)}
                            >
                              <span
                                className="city-brand-avatar"
                                style={{ background: p.profile.color }}
                              >
                                {p.profile.logo
                                  ? <img src={p.profile.logo} alt="" />
                                  : (
                                    p.profile.name.slice(0, 1)
                                  )}
                              </span>
                              <span>
                                <strong>{p.profile.name}</strong>
                                <small>
                                  {p.profile.category}
                                  {activeOffer(p.profile)
                                    ? " · Offer available"
                                    : ""}
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
                                <button
                                  onClick={() => navigate("/city/manage")}
                                >
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
                      </>
                    )}
                  <div className="city-welcome-footer">
                    <button onClick={() => setAbout("business")}>
                      For businesses: build your place ↗
                    </button>
                    {welcome && <button onClick={explore}>Explore city</button>}
                  </div>
                </aside>
                {(launchBrowse || richLaunchRoute) && <LaunchBrowser key={session?.user.id || "guest"} slug={richLaunchRoute ? path.split("/")[3] : undefined} userId={session?.user.id} onAuth={()=>setAuth(true)} onClose={()=>navigate("/city")}/>}
                {!richLaunches && launchRoute && linkedDeal && (
                  <aside
                    className={`city-launch-panel city-property-panel ${
                      sheetCollapsed ? "is-collapsed" : ""
                    }`}
                    aria-label="Business launch"
                  >
                    <button
                      className="city-sheet-toggle"
                      onClick={() => setSheetCollapsed((v) => !v)}
                    >
                      {sheetCollapsed ? "Expand launch" : "Minimise launch"}
                    </button>
                    <button onClick={() => navigate("/city")}>
                      Close launch
                    </button>
                    <p className="city-eyebrow">
                      {linkedDeal.business_name} / LAUNCH
                    </p>
                    <h2>{linkedDeal.title}</h2>
                    <p>{linkedDeal.description}</p>
                    <p>
                      {linkedDeal.available
                        ? (linkedDeal.starts_at &&
                            Date.parse(linkedDeal.starts_at) > Date.now()
                          ? "Upcoming launch"
                          : "Live launch")
                        : "This launch has ended"}
                    </p>
                    <p>
                      {linkedDeal.starts_at &&
                        new Date(linkedDeal.starts_at).toLocaleString()} —{" "}
                      {linkedDeal.ends_at &&
                        new Date(linkedDeal.ends_at).toLocaleString()}
                    </p>
                    {linkedDeal.available && (
                      <LaunchReminder launchId={linkedDeal.content_id} />
                    )}
                    <button onClick={() => enterCampus(linkedDeal.slug)}>
                      Enter business space ↗
                    </button>
                    <StorefrontBadge businessId={linkedDeal.business_id} />
                  </aside>
                )}
                {dealRoute && linkedDeal && (
                  <aside
                    className={`city-linked-deal ${
                      sheetCollapsed ? "is-collapsed" : ""
                    }`}
                  >
                    <button
                      className="city-sheet-toggle"
                      onClick={() => setSheetCollapsed((v) => !v)}
                    >
                      {sheetCollapsed ? "Expand deal" : "Minimise deal"}
                    </button>
                    <button onClick={() => navigate("/city")}>
                      Close deal
                    </button>
                    <h2>{linkedDeal.business_name}</h2>
                    <p>
                      {linkedDeal.rank
                        ? "Sponsored city location"
                        : "Discovery Pavilion"}
                    </p>
                    {!linkedDeal.available && (
                      <p>
                        This offer is currently unavailable. Saved claims remain
                        in My Deals.
                      </p>
                    )}
                    <CityDeals
                      key={linkedDeal.content_id}
                      businessId={linkedDeal.business_id}
                      dealId={linkedDeal.content_id}
                      autoOpen
                      userId={session?.user.id}
                      onAuth={() => setAuth(true)}
                    />
                    <button
                      onClick={() =>
                        navigate(`/city/business/${linkedDeal.slug}/space`)}
                    >
                      Explore this business
                    </button>
                  </aside>
                )}
                <div className="city-map-tools">
                  {!directory && <button aria-pressed={driving} onClick={()=>{setDriving(v=>!v);explore();}}>{driving?"Map mode":"Drive mode"}</button>}

                  <button
                    aria-label="Return to Central Plaza"
                    onClick={() => {
                      setDriving(false);
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
                    onClick={() => {setDriving(false);setDirectory((v) => !v);}}
                  >
                    <List size={20} />
                    <span>{directory ? "3D map" : "Directory"}</span>
                  </button>
                </div>
                <div className="city-map-caption" hidden={driving}>
                  <span>EXPLORE AT YOUR OWN PACE</span>
                  <p>
                    Drag to explore <span>·</span> Scroll to get closer
                  </p>
                </div>
                {snapshot && (
                  <div className="city-city-status">
                    <span className="city-live-dot" />
                    {snapshot.total} neighbours <span>·</span>{" "}
                    {snapshot.capacity} addresses
                  </div>
                )}
                {selected && !dealRoute && !launchRoute && (
                  <aside
                    className={`city-property-panel ${
                      sheetCollapsed ? "is-collapsed" : ""
                    }`}
                    aria-label={`${selected.profile.name} property`}
                  >
                    {customerEnabled && (
                      <button
                        className="city-sheet-toggle"
                        onClick={() => setSheetCollapsed((v) => !v)}
                      >
                        {sheetCollapsed
                          ? "Expand property"
                          : "Minimise property"}
                      </button>
                    )}
                    <div
                      className="city-panel-cover"
                      style={{ background: selected.profile.color }}
                    >
                      {selected.profile.hero
                        ? (
                          <img
                            src={selected.profile.hero}
                            alt={`${selected.profile.name} showcase`}
                          />
                        )
                        : (
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
                        <span>City Rank #{selected.rank}</span>
                      </div>
                      <h2>{selected.profile.name}</h2>
                      <p className="city-tagline">{selected.profile.tagline}</p>
                      <StorefrontBadge businessId={selected.id} />
                      <BusinessDestination
                        key={selected.id}
                        property={selected}
                        enabled={customerEnabled && !demo.current}
                        onChoose={(item) => {
                          explore();
                          navigate(
                            item.destination +
                              (item.destination.includes("?") ? "&" : "?") +
                              "source=organic",
                          );
                        }}
                        onEnter={campusEnabled
                          ? () => {
                            explore();
                            enterCampus(selected.slug, demo.current);
                          }
                          : undefined}
                      />
                      <div className="city-property-stats">
                        <div>
                          <strong>{formatGBP(selected.landValue)}</strong>
                          <small>City Value</small>
                        </div>
                        <div>
                          <strong>{CITY_TIERS[selected.tier].name}</strong>
                          <small>Property type</small>
                        </div>
                      </div>
                      {snapshot?.dealsEnabled && (
                        <CityDeals
                          key={selected.id}
                          businessId={selected.id}
                          userId={session?.user.id}
                          onAuth={() => setAuth(true)}
                          demo={demo.current}
                        />
                      )}
                      <p>{selected.profile.description}</p>
                      {richLaunches && <BusinessLaunchHistory key={selected.id} businessId={selected.id}/>}
                      {discoveryEnabled && (
                        <button
                          aria-pressed={followingIds.includes(selected.id)}
                          onClick={async () => {
                            if (demo.current) {
                              setNotice("This is a demonstration property.");
                              return;
                            }
                            if (!session) {
                              setAuth(true);
                              return;
                            }
                            try {
                              const enabled = !followingIds.includes(
                                selected.id,
                              );
                              await cityCommand("discovery_follow", {
                                businessId: selected.id,
                                enabled,
                              });
                              window.dispatchEvent(
                                new Event("city-wallet-change"),
                              );
                              setFollowingIds((ids) =>
                                enabled
                                  ? [...ids, selected.id]
                                  : ids.filter((id) => id !== selected.id)
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {followingIds.includes(selected.id)
                            ? "Following"
                            : "Follow business"}
                        </button>
                      )}
                      {discoveryEnabled && selected.profile.sample && (
                        <CitySample
                          key={selected.id}
                          sample={selected.profile.sample}
                          onEvent={(kind) => {
                            if (!demo.current && snapshot?.discoveryEnabled) {
                              void cityCommand("discovery_track", {
                                businessId: selected.id,
                                kind,
                              }).catch(() => {});
                            }
                          }}
                        />
                      )}
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
                          <span className="city-eyebrow">PUBLIC OFFER</span>
                          <h3>{selected.profile.offer.title}</h3>
                          <p>{selected.profile.offer.description}</p>
                          {selected.profile.offer.expiresAt && (
                            <small>
                              Ends {new Date(
                                selected.profile.offer.expiresAt,
                              ).toLocaleString()}
                            </small>
                          )}
                          {claim
                            ? (
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
                            )
                            : (
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
                          if (!demo.current) {
                            void cityCommand("track", {
                              businessId: selected.id,
                              kind: "click",
                              source: new URLSearchParams(location.search).get(
                                "source",
                              ) || "city",
                            }).catch(() => {});
                          }
                        }}
                      >
                        Visit website <ArrowUpRight size={18} />
                      </a>
                      <div className="city-actions">
                        {customerEnabled
                          ? <CustomerSave item={businessItem(selected)} />
                          : (
                            <button
                              disabled={busy}
                              aria-pressed={workspace.saved.includes(
                                selected.id,
                              )}
                              onClick={() => interaction("save_business")}
                            >
                              <BookmarkSimple
                                weight={workspace.saved.includes(selected.id)
                                  ? "fill"
                                  : "regular"}
                                size={19}
                              />
                              {workspace.saved.includes(selected.id)
                                ? "Saved"
                                : "Save place"}
                            </button>
                          )}
                        <button
                          onClick={async () => {
                            try {
                              await downloadCityCard(
                                selected.profile.name,
                                selected.rank,
                                formatGBP(selected.landValue),
                                selected.profile.color,
                              );
                              if (!demo.current) {
                                void cityCommand("track", {
                                  businessId: selected.id,
                                  kind: "share",
                                }).catch(() => {});
                              }
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
                              await navigator.clipboard.writeText(
                                location.href,
                              );
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
                        Paid location is not an endorsement. Offers are provided
                        by the business.
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
                    <span>SPONSORED LOCATION ACTIVITY</span>
                    <p>
                      {snapshot.events[0].name}{" "}
                      {snapshot.events[0].kind === "arrival"
                        ? "arrived at"
                        : snapshot.events[0].kind === "upgrade"
                        ? "upgraded their building at"
                        : `moved ${
                          snapshot.events[0].fromRank
                            ? `from #${snapshot.events[0].fromRank} `
                            : ""
                        }to`} #{snapshot.events[0].toRank}
                    </p>
                  </div>
                )}
              </main>
            )
            : (
              <main className="city-page">
                <button className="city-back" onClick={() => navigate("/city")}>
                  <ArrowLeft size={18} />
                  Back to the city
                </button>
                {!session
                  ? (
                    <section className="city-signin-page">
                      <p className="city-eyebrow">YOUR SYNARC ACCOUNT</p>
                      <h1>
                        {management
                          ? "Give your business an address."
                          : "Keep your favourite places close."}
                      </h1>
                      <p>
                        Sign in to {management
                          ? "create a property, submit it for review and manage your position."
                          : "save businesses and keep track of offers."}
                      </p>
                      <button
                        className="city-primary"
                        onClick={() => setAuth(true)}
                      >
                        Sign in or create an account
                      </button>
                    </section>
                  )
                  : management
                  ? (
                    <CityManage
                      workspace={workspace}
                      snapshot={snapshot}
                      onRefresh={refreshWorkspace}
                    />
                  )
                  : admin
                  ? (
                    <CityAdmin
                      discoveryEnabled={discoveryEnabled}
                      dealsEnabled={snapshot?.dealsEnabled}
                    />
                  )
                  : account
                  ? (
                    <section className="city-management">
                      <header className="city-page-heading">
                        <p className="city-eyebrow">YOUR NEIGHBOURHOOD</p>
                        <h1>Places worth coming back to.</h1>
                      </header>
                      {snapshot?.dealsEnabled && (
                        <CityDealWallet key={session.user.id} />
                      )}
                      <h2>Saved businesses</h2>
                      {workspace.saved.length
                        ? (
                          workspace.saved.map((id) => {
                            const p = savedPlaces.find((p) => p.id === id) ||
                              snapshot?.properties.find((p) => p.id === id);
                            return (
                              <button
                                className="city-account-place"
                                key={id}
                                onClick={async () => {
                                  const free = savedStorefronts.find(
                                    (s) => s.id === id,
                                  );
                                  if (free) {
                                    navigate(`/city/business/${free.slug}`);
                                  } else if (p) select(p);
                                  else {
                                    try {
                                      const data = await cityCall<{
                                        properties: CityProperty[];
                                      }>("city-api", { action: "saved" });
                                      const found = data.properties.find(
                                        (p) => p.id === id,
                                      );
                                      if (found) select(found);
                                      else {
                                        setNotice(
                                          "This saved property is currently unavailable.",
                                        );
                                      }
                                    } catch (e) {
                                      setError((e as Error).message);
                                    }
                                  }
                                }}
                              >
                                <BookmarkSimple size={20} />
                                {p?.profile.name ||
                                  savedStorefronts.find((s) => s.id === id)
                                    ?.name ||
                                  "Open saved property"}
                                <ArrowUpRight size={18} />
                              </button>
                            );
                          })
                        )
                        : (
                          <p>
                            Save a business while exploring and it will appear
                            here.
                          </p>
                        )}
                      <h2>Public offer history</h2>
                      {workspace.claims.length
                        ? (
                          workspace.claims.map((c, i) => (
                            <p key={`${c.business_id}-${i}`}>
                              {new Date(c.created_at).toLocaleDateString()} ·
                              {" "}
                              {c.business_name} · {c.offer.title}{" "}
                              {c.offer.code && <code>{c.offer.code}</code>}
                            </p>
                          ))
                        )
                        : (
                          <p>
                            Your claimed offers will appear here. Claims record
                            interest, not verified purchases.
                          </p>
                        )}
                    </section>
                  )
                  : <p>Page not found.</p>}
              </main>
            )}
          {about && (
            <CityAbout
              business={about === "business"}
              onClose={() => setAbout(null)}
              onBuild={() => {
                setAbout(null);
                navigate("/city/manage");
              }}
            />
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
      </LivingProvider>
    </CustomerProvider>
  );
}
