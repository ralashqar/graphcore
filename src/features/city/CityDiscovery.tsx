import { CityDeals } from "./CityDeals";
import { enterCampus } from "./CityCampus";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CitySnapshot, CityProperty } from "../../domain/city";
import { activeOffer } from "../../domain/city";
import {
  launchState,
  type DiscoveryData,
  type CityStorefront,
  type TrailContent,
  type LaunchContent,
} from "../../domain/cityDiscovery";
import { cityCall, cityCommand } from "./api";
import { discoveryDemo } from "./discoveryDemo";
import { CitySample } from "./CitySample";
const Scene = lazy(() => import("./CityScene"));
export function CityDiscovery({
  path,
  demo,
  userId,
  snapshot,
  navigate,
  onAuth,
}: {
  path: string;
  demo: boolean;
  userId?: string;
  snapshot: CitySnapshot | null;
  navigate: (p: string) => void;
  onAuth: () => void;
}) {
  const [data, setData] = useState<DiscoveryData | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [index, setIndex] = useState(0),
    [completed, setCompleted] = useState<string[]>([]),
    [chosen, setChosen] = useState<string | null>(null),
    [claim, setClaim] = useState<{ code: string; url: string } | null>(null),
    [fallback, setFallback] = useState(false),
    [clock, setClock] = useState(Date.now()),
    [home, setHome] = useState(0),
    [busy, setBusy] = useState(false);
  const request = useRef(0),
    offset = useRef(0),
    lastTrack = useRef("");
  const slug = decodeURIComponent(path.split("/")[3] || ""),
    isBusiness = path.startsWith("/city/business/"),
    isTrail = path.startsWith("/city/trails/"),
    isLaunch = path.startsWith("/city/launches/"),
    following = path === "/city/following";
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const next = demo
        ? discoveryDemo()
        : await cityCall<DiscoveryData>("city-api", {
            action: "discovery_catalog",
            query,
            offset: page * 50,
            ...(isBusiness ? { slug } : {}),
          });
      if (id !== request.current) return;
      offset.current = Date.parse(next.now) - Date.now();
      setData(next);
      setError("");
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    }
  }, [demo, query, page, isBusiness, slug, userId]);
  useEffect(() => {
    void refresh();
    const tick = setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      ++request.current;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const entry = data?.entries.find(
    (e) => e.slug === slug && e.kind === (isTrail ? "trail" : "launch"),
  );
  const trail = isTrail && entry ? (entry.content as TrailContent) : null;
  const launch = isLaunch && entry ? (entry.content as LaunchContent) : null;
  useEffect(() => {
    if (trail) setIndex((v) => Math.min(v, trail.stops.length - 1));
  }, [trail?.stops.length]);
  const stop = trail?.stops[index];
  const business = data?.storefronts.find(
    (b) =>
      b.id ===
        (isTrail ? stop?.businessId : isLaunch ? entry?.business_id : chosen) ||
      (isBusiness && b.slug === slug),
  );
  const now = clock + offset.current;
  useEffect(() => {
    setIndex(
      Math.max(
        0,
        Math.min(
          4,
          Number(new URLSearchParams(location.search).get("stop")) || 0,
        ),
      ),
    );
    setChosen(null);
    setQuery("");
    setPage(0);
    setClaim(null);
    lastTrack.current = "";
  }, [path]);
  useEffect(() => {
    setClaim(null);
    setHome((v) => v + 1);
  }, [business?.id]);
  const progressKey = `city-trail:${userId || "anonymous"}:${entry?.id}`;
  useEffect(() => {
    if (!trail || !entry) return;
    let local: string[] = [];
    try {
      local = JSON.parse(localStorage.getItem(progressKey) || "[]");
    } catch {
      /* private storage */
    }
    const valid = trail.stops.map((s) => s.businessId);
    setCompleted(
      [
        ...new Set([
          ...local,
          ...(data?.progress.find((p) => p.trail_id === entry.id)?.completed ||
            []),
        ]),
      ].filter((id) => valid.includes(id)),
    );
  }, [
    entry?.id,
    progressKey,
    JSON.stringify(data?.progress),
    JSON.stringify(trail?.stops),
  ]);
  useEffect(() => {
    if (!userId || !entry || !trail || demo) return;
    let previous: string[] = [];
    try {
      previous = JSON.parse(
        localStorage.getItem(`city-trail:anonymous:${entry.id}`) || "[]",
      );
    } catch {
      return;
    }
    if (previous.length)
      void cityCommand("discovery_progress", {
        id: entry.id,
        completed: previous
          .filter((id) => trail.stops.some((s) => s.businessId === id))
          .slice(0, 5),
      })
        .then(() => {
          localStorage.removeItem(`city-trail:anonymous:${entry.id}`);
          void refresh();
        })
        .catch((e) => setError(e.message));
  }, [userId, entry?.id]);
  const track = useCallback(
    (kind: string, businessId?: string, contextId?: string) => {
      if (!demo)
        void cityCommand("discovery_track", {
          kind,
          businessId,
          contextId,
        }).catch(() => {});
    },
    [demo],
  );
  useEffect(() => {
    if (!entry) return;
    const key = entry.id + ":" + path;
    if (lastTrack.current === key) return;
    lastTrack.current = key;
    track(
      isTrail ? "trail_start" : "launch_view",
      isLaunch ? entry.business_id || undefined : undefined,
      entry.id,
    );
  }, [entry?.id, isTrail, isLaunch, path, track]);
  useEffect(() => {
    if (!business || demo) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible")
        void cityCommand("track", {
          businessId: business.id,
          kind: "view",
        }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [business?.id, demo]);
  async function action(name: string, payload: Record<string, unknown>) {
    if (demo) {
      setError(
        "Fictional exhibit. Sign in to the live city to follow or claim real offers.",
      );
      return;
    }
    if (!userId) {
      sessionStorage.setItem(
        "city-explore-intent",
        JSON.stringify({ name, payload }),
      );
      onAuth();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await cityCommand<any>(name, payload);
      if (name === "claim") setClaim(result);
      if (name === "discovery_follow" && payload.enabled)
        track("follow", String(payload.businessId));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!userId || demo) return;
    const raw = sessionStorage.getItem("city-explore-intent");
    if (raw) {
      sessionStorage.removeItem("city-explore-intent");
      try {
        const intent = JSON.parse(raw);
        if (
          [
            "claim",
            "save_business",
            "discovery_follow",
            "discovery_save_launch",
          ].includes(intent.name)
        )
          void action(intent.name, intent.payload);
      } catch {
        /* invalid local intent */
      }
    }
  }, [userId]);
  async function completeStop() {
    if (!entry || !stop || !trail) return;
    const next = [...new Set([...completed, stop.businessId])];
    setCompleted(next);
    try {
      localStorage.setItem(progressKey, JSON.stringify(next));
    } catch {
      /* local persistence optional */
    }
    if (userId && !demo)
      try {
        await cityCommand("discovery_progress", {
          id: entry.id,
          completed: next,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    if (trail.stops.every((s) => next.includes(s.businessId)))
      track("trail_complete", undefined, entry.id);
  }
  function step(n: number) {
    setIndex(n);
    const params = new URLSearchParams(location.search);
    params.set("stop", String(n));
    history.replaceState(null, "", `${path}?${params}`);
  }
  const storefront = (b: CityStorefront) => (
    <section className="city-explore-storefront" key={b.id}>
      <p className="city-eyebrow">
        {b.placement
          ? `SPONSORED LOCATION #${b.placement.rank}`
          : "SHARED PAVILION EXHIBIT"}
      </p>
      <h2>{b.profile.name}</h2>
      <p>{b.profile.tagline}</p>
      <p>{b.profile.description}</p>
      {b.profile.sample && (
        <CitySample
          key={b.id}
          sample={b.profile.sample}
          onEvent={(kind) => track(kind, b.id, entry?.id)}
        />
      )}
      {snapshot?.dealsEnabled && <CityDeals businessId={b.id} userId={userId} onAuth={onAuth} demo={demo}/>}
      {activeOffer(b.profile) && (
        <section className="city-offer">
          <h3>Public offer: {b.profile.offer.title}</h3>
          <p>{b.profile.offer.description}</p>
          {b.profile.offer.expiresAt && (
            <small>
              Expires {new Date(b.profile.offer.expiresAt).toLocaleString()}
            </small>
          )}
          {claim ? (
            <>
              <strong>{claim.code || "Offer claimed"}</strong>
              {claim.url && (
                <a
                  href={claim.url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                >
                  Use offer
                </a>
              )}
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => action("claim", { businessId: b.id })}
            >
              Claim offer
            </button>
          )}
        </section>
      )}
      <div className="city-actions">
        <button
          disabled={busy}
          aria-pressed={data?.follows.includes(b.id) || false}
          onClick={() =>
            action("discovery_follow", {
              businessId: b.id,
              enabled: !data?.follows.includes(b.id),
            })
          }
        >
          {data?.follows.includes(b.id) ? "Following" : "Follow business"}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            action("save_business", { businessId: b.id, saved: true })
          }
        >
          Save business
        </button>
        <a
          href={b.profile.website}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => {
            if (!demo)
              void cityCommand("track", {
                businessId: b.id,
                kind: "click",
              }).catch(() => {});
          }}
        >
          Visit website
        </a>
      </div>
      {(demo || snapshot?.campusEnabled) && <button className="city-primary" onClick={()=>enterCampus(b.slug,demo)}>Enter business space ↗</button>}
      <button
        onClick={() => {
          const reason = window.prompt(
            "Describe the problem with this business (at least 10 characters).",
          );
          if (reason) void action("report", { businessId: b.id, reason });
        }}
      >
        Report business
      </button>
    </section>
  );
  return (
    <main className="city-explore">
      <header className="city-explore-heading">
        <p className="city-eyebrow">THE CREATOR DISTRICT</p>
        <h1>
          {entry?.content.title ||
            (isBusiness
              ? business?.profile.name
              : following
                ? "Your next discoveries"
                : "Find your next creative possibility.")}
        </h1>
        <p>
          {entry?.content.description ||
            "Explore tools, try an idea, and meet the people building what comes next."}
        </p>
        <div className="city-actions">
          <button onClick={() => navigate("/city/discover")}>Discover</button>
          <button onClick={() => navigate("/city/following")}>
            Following & saved launches
          </button>
          <button onClick={() => navigate("/city")}>City map</button>
        </div>
      </header>
      {error && (
        <p role="status" className="city-message">
          {error}
        </p>
      )}
      {!data && !error && <p>Opening the creator district…</p>}
      {following && !userId && !demo && (
        <button onClick={onAuth}>Sign in to see followed businesses</button>
      )}
      {(isTrail || isLaunch) && data && !entry && (
        <p>This trail or launch is unavailable.</p>
      )}
      {launch && entry && (
        <section className="city-launch-banner">
          <strong>{launchState(launch, now)}</strong>
          <p>
            {new Date(launch.startsAt).toLocaleString()} —{" "}
            {new Date(launch.endsAt).toLocaleString()}
          </p>
          <button
            disabled={busy}
            aria-pressed={data?.savedLaunches.includes(entry.id) || false}
            onClick={() =>
              action("discovery_save_launch", {
                id: entry.id,
                enabled: !data?.savedLaunches.includes(entry.id),
              })
            }
          >
            {data?.savedLaunches.includes(entry.id)
              ? "Remove saved launch"
              : "Save launch"}
          </button>
        </section>
      )}
      {trail && (
        <section className="city-trail-nav">
          <p>
            <strong>Your outcome:</strong> {trail.outcome}
          </p>
          <ol>
            {trail.stops.map((s, n) => (
              <li key={s.businessId}>
                <button
                  aria-current={n === index ? "step" : undefined}
                  onClick={() => step(n)}
                >
                  {n + 1}.{" "}
                  {data?.storefronts.find((b) => b.id === s.businessId)?.profile
                    .name || "Unavailable stop"}{" "}
                  {completed.includes(s.businessId) ? "✓" : ""}
                </button>
              </li>
            ))}
          </ol>
          <p>{stop?.reason}</p>
          <div className="city-actions">
            <button disabled={index <= 0} onClick={() => step(index - 1)}>
              Previous stop
            </button>
            <button onClick={() => void completeStop()} disabled={!stop}>
              Mark stop explored
            </button>
            <button
              disabled={index >= trail.stops.length - 1}
              onClick={() => step(index + 1)}
            >
              Next stop
            </button>
          </div>
          <small>
            {completed.length} of {trail.stops.length} explored. Progress
            records your choices, not verified product use.
          </small>
        </section>
      )}
      {(business || trail || isBusiness) && (
        <div className="city-explore-split">
          <div className="city-explore-map" aria-label="Discovery map">
            {fallback ? (
              <p>
                Map unavailable. All exhibits and trail navigation remain
                accessible here.
              </p>
            ) : (
              <Suspense fallback={<p>Building the district…</p>}>
                <Scene
                  properties={[
                    ...(snapshot?.properties || []).filter(
                      (p) => p.id !== business?.id,
                    ),
                    ...(business?.placement ? [business.placement] : []),
                  ]}
                  selected={business?.placement || null}
                  capacity={snapshot?.capacity || 400}
                  home={home}
                  onSelect={(p: CityProperty) =>
                    navigate(`/city/business/${p.slug}`)
                  }
                  onRegion={() => {}}
                  onFailure={() => setFallback(true)}
                  pavilion={{
                    profile:
                      business && !business.placement
                        ? business.profile
                        : undefined,
                    title:
                      launch && launchState(launch, now) === "Live"
                        ? launch.title
                        : undefined,
                  }}
                  trailMarkers={trail?.stops.flatMap((s, n) => {
                    const p = data?.storefronts.find(
                      (b) => b.id === s.businessId,
                    )?.placement;
                    return p ? [{ ...p, number: n + 1 }] : [];
                  })}
                />
              </Suspense>
            )}
          </div>
          <div>
            {business ? (
              storefront(business)
            ) : (
              <p>
                This exhibit is unavailable. Continue to another trail stop.
              </p>
            )}
          </div>
        </div>
      )}
      {!isBusiness && !isTrail && !isLaunch && data && (
        <>
          {!following && (
            <>
              <h2>Start with a trail</h2>
              <div className="city-explore-cards">
                {data.entries
                  .filter((e) => e.kind === "trail")
                  .map((e) => (
                    <button
                      className="city-explore-card"
                      key={e.id}
                      onClick={() => navigate(`/city/trails/${e.slug}`)}
                    >
                      {(e.content as TrailContent).cover && (
                        <img src={(e.content as TrailContent).cover} alt="" />
                      )}
                      <h3>{e.content.title}</h3>
                      <p>{e.content.description}</p>
                      <span>
                        {(e.content as TrailContent).stops.length} stops
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
          <h2>
            {following ? "From businesses you follow" : "The launch programme"}
          </h2>
          <div className="city-explore-cards">
            {data.entries
              .filter(
                (e) =>
                  e.kind === "launch" &&
                  (!following || data.follows.includes(e.business_id!)) &&
                  (!following ||
                    launchState(e.content as LaunchContent, now) !== "Past"),
              )
              .map((e) => (
                <button
                  className="city-explore-card"
                  key={e.id}
                  onClick={() => navigate(`/city/launches/${e.slug}`)}
                >
                  <span>
                    {e.featured ? "FEATURED · " : ""}
                    {launchState(e.content as LaunchContent, now)}
                  </span>
                  <h3>{e.content.title}</h3>
                  <p>{e.content.description}</p>
                </button>
              ))}
          </div>
          {following && (
            <>
              <h2>Saved launches</h2>
              {data.entries
                .filter((e) => data.savedLaunches.includes(e.id))
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/city/launches/${e.slug}`)}
                  >
                    {e.content.title} ·{" "}
                    {launchState(e.content as LaunchContent, now)}
                  </button>
                ))}
              {!data.savedLaunches.length && <p>No saved launches yet.</p>}
            </>
          )}
          <h2>{following ? "Followed businesses" : "Meet the creators"}</h2>
          {!following && (
            <label>
              Search creator tools
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
          <div className="city-explore-cards">
            {data.storefronts
              .filter((b) => !following || data.follows.includes(b.id))
              .map((b) => (
                <button
                  className="city-explore-card"
                  key={b.id}
                  onClick={() => navigate(`/city/business/${b.slug}`)}
                >
                  <h3>{b.profile.name}</h3>
                  <p>{b.profile.tagline}</p>
                  <small>
                    {b.placement
                      ? "Visit their building"
                      : "Discover at the pavilion"}
                  </small>
                </button>
              ))}
          </div>
          {!following && (
            <div className="city-actions">
              <button disabled={!page} onClick={() => setPage((v) => v - 1)}>
                Previous businesses
              </button>
              <button
                disabled={!data.hasMore}
                onClick={() => setPage((v) => v + 1)}
              >
                More businesses
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
