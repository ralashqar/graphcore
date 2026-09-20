import { type MarketEvent, marketHeadline } from "../../domain/cityMarket";
import { formatGBP } from "../../domain/city";
import { useEffect, useRef, useState } from "react";
import { CityDialog } from "./CityAuth";
import { cityCall } from "./api";
import type { CityProperty } from "../../domain/city";
import type { CustomerItem } from "../../domain/cityCustomer";
import { discoveryLabel } from "../../domain/cityCustomer";
import { clearCityViewport, type ViewportRect } from "../../domain/cityLanding";
import "./city-landing.css";
export function CityAbout(
  { business, onClose, onBuild }: {
    business: boolean;
    onClose: () => void;
    onBuild: () => void;
  },
) {
  return (
    <CityDialog
      title={business
        ? "Your business, a place worth visiting"
        : "Welcome to Synarc City"}
      onClose={onClose}
    >
      <p className="city-eyebrow">A LIVING CITY OF BUSINESSES</p>
      <h2>
        {business
          ? "Build a presence. Give people a reason to visit."
          : "Discover what’s happening here."}
      </h2>
      <p>
        {business
          ? "Your website becomes a branded property. Compete for a visible position, then fill your space with deals, launches and experiences."
          : "Explore businesses, exclusive deals, new launches and experiences. Browse freely; sign in when you want to save and claim."}
      </p>
      <ol className="city-about-steps">
        <li>
          <strong>Bring your website</strong>
          <span>
            Import your identity, review the content and preview your property.
          </span>
        </li>
        <li>
          <strong>Choose your position</strong>
          <span>
            City Value ranks sponsored locations. Every new map visit begins at
            Central Plaza. Higher contributions can move you closer; locations
            and traffic are not guaranteed.
          </span>
        </li>
        <li>
          <strong>Make a destination</strong>
          <span>
            Publish a useful offer, demo or launch. Your main plot opens into a
            larger business space.
          </span>
        </li>
        <li>
          <strong>See what happens</strong>
          <span>
            Follow views, visits, claims and redemptions. Organic discovery is
            earned through customer activity.
          </span>
        </li>
      </ol>
      <button className="city-primary" onClick={onBuild}>
        Build your place in the city ↗
      </button>
      <button onClick={onClose}>Keep exploring</button>
    </CityDialog>
  );
}
export function useClearCityViewport(key: string) {
  const [viewport, setViewport] = useState<ViewportRect | null>(null);
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".city-canvas");
    if (!canvas) return;
    const update = () => {
      const c = canvas.getBoundingClientRect();
      const panels = [
        ...document.querySelectorAll<HTMLElement>(
          ".city-discovery,.city-property-panel,.city-linked-deal,.city-market-leader,.city-map-tools,.city-activity",
        ),
      ].filter((p) => p.offsetWidth && p.offsetHeight).map((p) => {
        const r = p.getBoundingClientRect();
        return {
          left: r.left - c.left,
          top: r.top - c.top,
          right: r.right - c.left,
          bottom: r.bottom - c.top,
        };
      });
      const next = clearCityViewport(c.width, c.height, panels);
      setViewport((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    document.querySelectorAll(
      ".city-discovery,.city-property-panel,.city-linked-deal,.city-market-leader",
    ).forEach((p) => observer.observe(p));
    update();
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [key]);
  return viewport;
}
export function BusinessDestination(
  { property, enabled, onChoose, onEnter }: {
    property: CityProperty;
    enabled: boolean;
    onChoose: (item: CustomerItem) => void;
    onEnter?: () => void;
  },
) {
  const [items, setItems] = useState<CustomerItem[]>([]),
    [loading, setLoading] = useState(enabled),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setItems([]);
    setFailed(false);
    setLoading(enabled);
    if (!enabled) return;
    let active = true;
    setLoading(true);
    void cityCall<{ items: CustomerItem[] }>("city-api", {
      action: "customer_destination",
      businessId: property.id,
    }).then((r) => {
      if (active) setItems(r.items);
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [property.id, enabled]);
  const item = items[0];
  return (
    <section
      className="city-destination"
      aria-label="Featured business experience"
    >
      <span className="city-eyebrow">START HERE</span>
      {item
        ? (
          <>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <button className="city-primary" onClick={() => onChoose(item)}>
              {item.kind === "deal"
                ? "View deal"
                : item.kind === "launch"
                ? "Explore launch"
                : "Try this experience"} ↗
            </button>
            <small>
              {discoveryLabel(item, "all")}
              {item.remaining !== null ? ` · ${item.remaining} remaining` : ""}
            </small>
          </>
        )
        : (
          <>
            <h3>
              {loading
                ? "Finding what’s available…"
                : property.profile.sample
                ? "Try something from " + property.profile.name
                : "Explore " + property.profile.name}
            </h3>
            <p>
              {property.profile.tagline ||
                "Products, offers and experiences from this business."}
            </p>
          </>
        )}
      {failed && (
        <small>
          Featured content is temporarily unavailable. You can still explore
          this business.
        </small>
      )}
      {onEnter && (
        <button onClick={onEnter}>
          Enter full business space ↗
        </button>
      )}
    </section>
  );
}
/** Card visibility is measured independently of scene visibility. */
export function useCardExposure(
  id: string | undefined,
  enabled: boolean,
  onExposure: (ids: string[], kind: "card") => void,
) {
  const ref = useRef<HTMLElement>(null), callback = useRef(onExposure);
  callback.current = onExposure;
  useEffect(() => {
    if (!id || !enabled || !ref.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const observer = new IntersectionObserver((entries) => {
      clear();
      if (
        entries[0]?.intersectionRatio >= .75 &&
        document.visibilityState === "visible" &&
        !document.querySelector("dialog[open]") && !sent
      ) {
        timer = setTimeout(() => {
          if (
            document.visibilityState === "visible" &&
            !document.querySelector("dialog[open]")
          ) {
            sent = true;
            callback.current([id], "card");
          }
        }, 2000);
      }
    }, { threshold: [0, .75] });
    observer.observe(ref.current);
    const changed = () => {
      clear();
      observer.disconnect();
      if (ref.current) observer.observe(ref.current);
    };
    document.addEventListener("visibilitychange", changed);
    return () => {
      clear();
      observer.disconnect();
      document.removeEventListener("visibilitychange", changed);
    };
  }, [id, enabled]);
  return ref;
}

export function TakeoverResult(
  { event, onReplay, onClose }: {
    event: MarketEvent;
    onReplay: () => void;
    onClose: () => void;
  },
) {
  const actor = event.moves.find((m) => m.id === event.initiator),
    previous = event.moves.find((m) =>
      m.before?.rank === 1 && m.id !== event.initiator
    );
  return (
    <section className="city-takeover-result" aria-label="Settled city result">
      <span className="city-eyebrow">
        {event.cause === "purchase"
          ? "CONFIRMED CITY MOVEMENT"
          : "POSITION CORRECTION"}
      </span>
      <p>
        <strong>{marketHeadline(event)}</strong>
      </p>
      {actor?.after && (
        <p>
          {actor.before ? `#${actor.before.rank}` : "New arrival"}{" "}
          → #{actor.after.rank} · {formatGBP(actor.after.value)} City Value
        </p>
      )}
      {previous?.after && (
        <small>
          {previous.after.name} remains in the city at #{previous.after.rank}.
        </small>
      )}
      <small>
        Recorded {new Date(event.created_at).toLocaleTimeString()} · revision
        {" "}
        {event.revision}
      </small>
      <button onClick={onReplay}>Watch movement</button>
      <button onClick={onClose}>Dismiss result</button>
    </section>
  );
}
