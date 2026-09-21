import { StorefrontBadge, LivingFollow } from "./CityLiving";
import { CityDeals } from "./CityDeals";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { CityProfile } from "../../domain/city";
import { activeOffer } from "../../domain/city";
import { legacyCampus } from "../../domain/cityCampus";
import { CitySample } from "./CitySample";
import { cityCall, cityCommand, cityNavigate } from "./api";
import { demoCity } from "./demo";
import { discoveryDemo } from "./discoveryDemo";
const Scene = lazy(() => import("./CityCampusScene"));
export function enterCampus(slug: string, demo = false) {
  try {
    sessionStorage.setItem(
      "city-campus-return",
      location.pathname + location.search,
    );
  } catch {}
  cityNavigate(`/city/business/${slug}/space${demo ? "?demo=1" : ""}`);
}
export function CampusPreview({
  profile,
  selected,
  onSelect,
  onEvent = () => {},
  footer,
}: {
  profile: CityProfile;
  selected?: string;
  onSelect?: (id: string) => void;
  onEvent?: (id: string, kind: string) => void;
  footer?: (kind: string, dealId?: string, exhibitId?: string) => React.ReactNode;
}) {
  const campus = legacyCampus(profile),
    [local, setLocal] = useState(campus.primaryId),
    [fallback, setFallback] = useState(false);
  const current =
    campus.exhibits.find((e) => e.id === (selected || local)) ||
    campus.exhibits[0];
  const pick = (id: string) => {
    setLocal(id);
    onSelect?.(id);
  };
  const fail = useCallback(() => setFallback(true), []);
  useEffect(() => {
    if (current) onEvent(current.id, "view");
  }, [current?.id, onEvent]);
  return (
    <>
      <div className="city-campus-layout">
        <div
          className="city-campus-map"
          aria-label="Business campus. Drag to pan, scroll to zoom."
        >
          {fallback ? (
            <p>Explore all exhibits using the list below.</p>
          ) : (
            <Suspense fallback={<p>Opening the business campus…</p>}>
              <Scene
                profile={profile}
                campus={campus}
                selected={current?.id || ""}
                onSelect={pick}
                onFailure={fail}
              />
            </Suspense>
          )}
        </div>
        <section className="city-campus-exhibit" aria-label="Selected exhibit">
          <p className="city-eyebrow">{profile.name} / EXHIBIT</p>
          <h2>{current?.title}</h2>
          {current && !["offer", "launch"].includes(current.kind) && (
            <CitySample
              key={current.id}
              sample={{
                kind:
                  current.kind === "walkthrough"
                    ? "guided"
                    : (current.kind as "gallery" | "guided" | "comparison"),
                title: current.title,
                items: current.items,
              }}
              onEvent={(kind) => onEvent(current.id, kind)}
            />
          )}
          {current && footer?.(current.kind, current.dealId, current.id)}
          {current && !["offer", "launch"].includes(current.kind) && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => onEvent(current.id, "click")}
            >
              Explore on {profile.name}'s website ↗
            </a>
          )}
        </section>
      </div>
      <nav className="city-campus-stations" aria-label="Campus exhibits">
        {campus.exhibits.map((e, i) => (
          <button
            key={e.id}
            aria-pressed={current?.id === e.id}
            onClick={() => pick(e.id)}
          >
            <span>
              0{i + 1} / {e.kind}
            </span>
            <strong>{e.title}</strong>
          </button>
        ))}
      </nav>
    </>
  );
}
export function CampusPreviewDetails({
  profile,
  label = "Preview campus",
}: {
  profile: CityProfile;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{label}</summary>
      {open && <CampusPreview profile={profile} />}
    </details>
  );
}
export default function CityCampus({
  path,
  demo,
  userId,
  onAuth,
  dealsEnabled = false,
}: {
  path: string;
  demo: boolean;
  userId?: string;
  onAuth: () => void;
  dealsEnabled?: boolean;
}) {
  const slug = decodeURIComponent(path.split("/")[3] || ""),
    station = path.split("/")[5];
  const [data, setData] = useState<{
      businessId: string;
      profile: CityProfile;
      launches: {
        id: string;
        slug: string;
        published: { title: string; startsAt: string; endsAt: string };
      }[];
    } | null>(null),
    [error, setError] = useState(""),
    [claim, setClaim] = useState<{ code: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setClaim(null);
    if (demo) {
      const b =
        (new URLSearchParams(location.search).get("cityRender") === "corporate"
          ? demoCity(72, true).properties.find((b) => b.slug === slug)
          : undefined) ||
        discoveryDemo().storefronts.find((b) => b.slug === slug) ||
        demoCity().properties.find((b) => b.slug === slug);
      if (b) {
        const space = legacyCampus(b.profile);
        const items = b.profile.sample?.items || [
          {
            label: "Product detail",
            image: b.profile.hero,
            description: b.profile.description,
          },
          {
            label: "Brand identity",
            image: b.profile.logo,
            description: b.profile.tagline,
          },
        ];
        space.exhibits.splice(
          1,
          0,
          {
            id: "products",
            title: "Explore the collection",
            kind: "gallery",
            confirmedPair: false,
            items: items.map((i) => ({ ...i, sourceUrl: b.profile.website })),
          },
          {
            id: "walkthrough",
            title: "A closer look",
            kind: "walkthrough",
            confirmedPair: false,
            items: items.map((i) => ({ ...i, sourceUrl: b.profile.website })),
          },
        );
        setData({
          businessId: b.id,
          profile: { ...b.profile, campus: space },
          launches: [],
        });
      } else setError("Business unavailable.");
      return;
    }
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void cityCall<any>("city-api", { action: "campus_public", slug })
        .then((v) => {
          if (active) {
            setData(v);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setData(null);
            setError(e.message);
          }
        });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [slug, demo]);
  const track = useCallback(
    (id: string, kind: string) => {
      if (!demo && data)
        void cityCommand("campus_track", {
          businessId: data.businessId,
          exhibitId: id,
          kind,
        }).catch(() => {});
    },
    [data?.businessId, demo],
  );
  const back = () => {
    let target = "/city/business/" + slug;
    try {
      const saved = sessionStorage.getItem("city-campus-return");
      if (saved && /^\/city(?:[/?]|$)/.test(saved) && !saved.includes("/space"))
        target = saved;
    } catch {}
    if (demo && !target.includes("demo=1"))
      target += (target.includes("?") ? "&" : "?") + "demo=1";
    cityNavigate(target);
  };
  return (
    <main className="city-campus-page">
      <header className="city-campus-heading">
        <button onClick={back}>← Back to city / trail</button>
        <p className="city-eyebrow">YOUR NEXT CREATIVE POSSIBILITY</p>
        <h1>{data?.profile.name || "Business space"}</h1>
        <p>
          {data?.profile.tagline ||
            "Explore the people, products and ideas behind this address."}
        </p>
        <small>One city address. A whole space to discover.</small>
        {data&&<><StorefrontBadge businessId={data.businessId}/><LivingFollow businessId={data.businessId}/></>}
      </header>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Loading exhibits…</p>}
      {data &&
        station &&
        !legacyCampus(data.profile).exhibits.some((e) => e.id === station) && (
          <p role="status">
            This exhibit is no longer here. Explore the current exhibits below.
          </p>
        )}
      {dealsEnabled && data && !legacyCampus(data.profile).exhibits.some(e=>e.kind==="offer") && <CityDeals businessId={data.businessId} userId={userId} onAuth={onAuth} demo={demo}/>}
      {data && (
        <CampusPreview
          profile={data.profile}
          selected={station}
          onSelect={(id) =>
            cityNavigate(
              `/city/business/${slug}/space/${id}${demo ? "?demo=1" : ""}`,
            )
          }
          onEvent={track}
          footer={(kind, dealId, exhibitId) =>
            kind === "offer" ? (
              <>
                {dealsEnabled && <CityDeals key={dealId || data.businessId} businessId={data.businessId} dealId={dealId} sourceExhibitId={dealId ? exhibitId : undefined} userId={userId} onAuth={onAuth} demo={demo}/>}
                <h3>{data.profile.offer.title ? "Public offer: " + data.profile.offer.title : ""}</h3>
                <p>{data.profile.offer.description}</p>
                {activeOffer(data.profile) && (
                  <button
                    onClick={async () => {
                      if (demo) {
                        setError("Fictional exhibit: no real claims.");
                        return;
                      }
                      if (!userId) {
                        onAuth();
                        return;
                      }
                      try {
                        setClaim(
                          await cityCommand<any>("claim", {
                            businessId: data.businessId,
                          }),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Claim offer
                  </button>
                )}
                {claim && (
                  <p role="status">
                    {claim.code || "Offer saved"}{" "}
                    {claim.url && (
                      <a
                        href={claim.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        Use offer ↗
                      </a>
                    )}
                  </p>
                )}
              </>
            ) : kind === "launch" ? (
              <>
                {data.launches.length ? (
                  data.launches.map((l) => (
                    <p key={l.id}>
                      <a href={`/city/launches/${l.slug}`}>
                        {l.published.title}
                      </a>{" "}
                      · {new Date(l.published.startsAt).toLocaleDateString()}
                    </p>
                  ))
                ) : (
                  <p>
                    No published launches yet. Follow this business from its
                    property page for future discoveries.
                  </p>
                )}
              </>
            ) : dealsEnabled && dealId ? (
              <div><p className="city-eyebrow">LIKE WHAT YOU SEE? TRY IT WITH THIS OFFER</p><CityDeals key={`${exhibitId}:${dealId}`} businessId={data.businessId} dealId={dealId} sourceExhibitId={exhibitId} userId={userId} onAuth={onAuth} demo={demo}/></div>
            ) : null
          }
        />
      )}
    </main>
  );
}
