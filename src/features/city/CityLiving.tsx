import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  activityLabel,
  freshLiving,
  type LivingState,
  storefrontVisual,
} from "../../domain/cityLiving";
import { cityCall, cityCommand, cityNavigate } from "./api";
import { CityDialog } from "./CityAuth";
import "./city-living.css";
type InboxItem = {
  key: string;
  title: string;
  business_name: string;
  destination: string;
  kind: string;
  at: string;
  read_at: string | null;
};
type Inbox = {
  items: InboxItem[];
  unread: number;
  total: number;
  reminders: string[];
  follows: string[];
};
const empty: Inbox = {
  items: [],
  unread: 0,
  total: 0,
  reminders: [],
  follows: [],
};
type LivingContext = {
  storefronts: boolean;
  deals: boolean;
  launches: boolean;
  enabled: boolean;
  states: LivingState[];
  inbox: Inbox;
  userId?: string;
  refresh: () => void;
  onAuth: () => void;
};
const Context = createContext<LivingContext>({
  storefronts: false,
  deals: false,
  launches: false,
  enabled: false,
  states: [],
  inbox: empty,
  refresh: () => {},
  onAuth: () => {},
});
export const useLiving = () => useContext(Context);
export function LivingProvider(
  {
    enabled,
    storefronts,
    deals,
    launches,
    ids,
    userId,
    onAuth,
    revision,
    children,
  }: {
    storefronts: boolean;
    deals: boolean;
    launches: boolean;
    enabled: boolean;
    ids: string[];
    userId?: string;
    onAuth: () => void;
    revision?: number;
    children: ReactNode;
  },
) {
  const [states, setStates] = useState<LivingState[]>([]),
    [inbox, setInbox] = useState(empty),
    [serial, setSerial] = useState(0);
  const refresh = useCallback(() => setSerial((v) => v + 1), []),
    idsKey = [...new Set(ids)].slice(0, 100).sort().join(",");
  useEffect(() => {
    let live = true, sequence = 0;
    if (!enabled) {
      setStates([]);
      return;
    }
    const load = () => {
      if (document.visibilityState !== "visible") return;
      const request = ++sequence;
      void cityCall<{ states: LivingState[] }>("city-api", {
        action: "customer_city_state",
        ids: idsKey ? idsKey.split(",") : [],
      }).then((r) => {
        if (live && request === sequence) setStates(r.states || []);
      }).catch(() => {
        if (live && request === sequence) setStates([]);
      });
    };
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener("online", load);
    window.addEventListener("city-wallet-change", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("online", load);
      window.removeEventListener("city-wallet-change", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled, idsKey, revision, serial]);
  useEffect(() => {
    let live = true;
    setInbox(empty);
    if (!enabled || !userId) return;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void cityCall<Inbox>("city-api", { action: "customer_inbox" }).then(
        (r) => {
          if (live) setInbox(r);
        },
      ).catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener("city-wallet-change", load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("city-wallet-change", load);
    };
  }, [enabled, userId, serial]);
  const value = useMemo(
    () => ({
      enabled,
      storefronts,
      deals,
      launches,
      states,
      inbox,
      userId,
      refresh,
      onAuth,
    }),
    [
      enabled,
      storefronts,
      deals,
      launches,
      states,
      inbox,
      userId,
      refresh,
      onAuth,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function StorefrontBadge(
  { businessId, compact = false }: { businessId: string; compact?: boolean },
) {
  const living = useLiving(),
    [extra, setExtra] = useState<LivingState>(),
    [now, setNow] = useState(Date.now());
  const known = living.states.find((s) => s.businessId === businessId);
  useEffect(() => {
    if (!living.enabled || known || compact) return;
    let live = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void cityCall<{ states: LivingState[] }>("city-api", {
        action: "customer_city_state",
        ids: [businessId],
      }).then((r) => {
        if (live) setExtra(r.states[0]);
      }).catch(() => {
        if (live) setExtra(undefined);
      });
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [businessId, living.enabled, known, compact]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const state = freshLiving(
    known || (extra?.businessId === businessId ? extra : undefined),
    now,
  );
  if (!living.enabled || !state) return null;
  const visual = storefrontVisual[state.kind];
  return (
    <section
      className="city-storefront-state"
      style={{ borderColor: visual.color }}
      aria-label="Current storefront activity"
    >
      {state.kind !== "quiet" && (
        <>
          <strong style={{ color: visual.color }}>
            {visual.icon} {visual.label}
          </strong>
          {!compact && state.primary && (
            <>
              <p>{state.primary.title}</p>
              <button onClick={() => cityNavigate(state.primary!.destination)}>
                Explore {state.primary.kind === "launch" ? "launch" : "deal"} ↗
              </button>
              {state.primary.kind === "deal" &&
                state.primary.remaining !== null && (
                <small>{state.primary.remaining} codes remaining</small>
              )}
              {state.primary.ends_at && (
                <small>
                  Ends {new Date(state.primary.ends_at).toLocaleString()}
                </small>
              )}
            </>
          )}
        </>
      )}
      {state.band !== "quiet" && (
        <small>
          Recent activity · {activityLabel[state.band]}
          {!compact &&
            " · observed engagement over 48 hours, not people online"}
        </small>
      )}
    </section>
  );
}
export function LivingFollow({ businessId }: { businessId: string }) {
  const l = useLiving(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!l.enabled) return null;
  const following = l.inbox.follows.includes(businessId);
  return (
    <>
      <button
        disabled={busy}
        aria-pressed={following}
        onClick={async () => {
          if (!l.userId) {
            l.onAuth();
            return;
          }
          setBusy(true);
          setError("");
          try {
            await cityCommand("discovery_follow", {
              businessId,
              enabled: !following,
            });
            l.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {following ? "Following business" : "Follow business"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function LaunchReminder({ launchId }: { launchId: string }) {
  const l = useLiving(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!l.enabled || !l.launches) return null;
  const enabled = l.inbox.reminders.includes(launchId);
  return (
    <>
      <button
        disabled={busy}
        aria-pressed={enabled}
        onClick={async () => {
          if (!l.userId) {
            l.onAuth();
            return;
          }
          setBusy(true);
          try {
            await cityCommand("customer_reminder", {
              launchId,
              enabled: !enabled,
            });
            l.refresh();
            setError("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {enabled ? "Cancel in-app reminder" : "Remind me in City"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function LivingInbox() {
  const l = useLiving(),
    [open, setOpen] = useState(false),
    [page, setPage] = useState<Inbox | null>(null),
    [offset, setOffset] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open || !l.userId) return;
    let live = true;
    void cityCall<Inbox>("city-api", { action: "customer_inbox", offset }).then(
      (r) => {
        if (live) {
          setPage(r);
          setError("");
        }
      },
    ).catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [open, offset, l.inbox]);
  if (!l.enabled) return null;
  const data = page || l.inbox;
  const read = async (keys: string[]) => {
    try {
      await cityCommand("customer_inbox_read", { keys });
      l.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <button
        className="city-inbox-button"
        onClick={() => {
          if (!l.userId) {
            l.onAuth();
            return;
          }
          setOpen(true);
        }}
      >
        What’s new{l.inbox.unread > 0 ? ` · ${l.inbox.unread}` : ""}
      </button>
      {open && (
        <CityDialog
          title="Following / What’s New"
          onClose={() => setOpen(false)}
        >
          <p>
            Approved updates from businesses you follow and launch reminders you
            chose. Saving a launch does not enable reminders.
          </p>
          {error && <p role="alert">{error}</p>}
          {data.items.length === 0 && (
            <p>
              No new updates. Follow a business or set a launch reminder to
              start.
            </p>
          )}
          {data.items.map((i) => (
            <article className="city-inbox-item" key={i.key}>
              <small>
                {i.business_name} · {i.kind === "launch_reminder"
                  ? "Launch reminder"
                  : "Business update"} · {new Date(i.at).toLocaleString()}
              </small>
              <h3>{i.title}</h3>
              <button
                onClick={() => {
                  void read([i.key]);
                  setOpen(false);
                  cityNavigate(i.destination);
                }}
              >
                Explore ↗
              </button>
              {!i.read_at && (
                <button onClick={() => void read([i.key])}>Mark read</button>
              )}
            </article>
          ))}
          <div>
            <button
              disabled={offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 40))}
            >
              Previous updates
            </button>
            <button
              disabled={offset + 40 >= data.total}
              onClick={() => setOffset((v) => v + 40)}
            >
              More updates
            </button>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              cityNavigate("/city/following");
            }}
          >
            Manage followed businesses
          </button>
        </CityDialog>
      )}
    </>
  );
}
export type CityMoment = {
  id: string;
  kind: string;
  title: string;
  business_name: string;
  destination: string;
  created_at: string;
};
export async function downloadMoment(id: string) {
  const m = await cityCall<CityMoment>("city-api", {
    action: "customer_moment",
    id,
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export unavailable");
  ctx.fillStyle = "#f4f3ec";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#355744";
  ctx.font = "24px sans-serif";
  ctx.fillText("SYNARC CITY / A MOMENT IN THE CITY", 65, 75);
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(m.business_name.slice(0, 35), 65, 220);
  ctx.font = "34px sans-serif";
  const words = m.title.split(" ");
  let line = "", y = 320;
  for (const word of words) {
    if (ctx.measureText(line + word).width > 1050) {
      ctx.fillText(line, 65, y);
      y += 44;
      line = "";
    }
    line += word + " ";
  }
  ctx.fillText(line, 65, y);
  ctx.font = "22px sans-serif";
  ctx.fillText("Recorded " + new Date(m.created_at).toLocaleString(), 65, 550);
  ctx.fillText(
    "Paid position creates the map. Customer activity creates the market.",
    65,
    590,
  );
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "city-moment-" + id + ".png";
  a.click();
}
export function MerchantLiving({ businessId }: { businessId: string }) {
  const l = useLiving(),
    [data, setData] = useState<
      {
        events: CityMoment[];
        followers: number;
        preview?: Pick<LivingState, "kind" | "primary">;
      }
    >(),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!l.enabled) return;
    let live = true;
    void cityCall<
      {
        events: CityMoment[];
        followers: number;
        preview?: Pick<LivingState, "kind" | "primary">;
      }
    >("city-api", {
      action: "customer_campaign_history",
      businessId,
      offset,
    }).then((r) => {
      if (live) setData(r);
    }).catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, [businessId, l.enabled, offset]);
  if (!l.enabled) return null;
  return (
    <section className="city-business-section">
      <p className="city-eyebrow">YOUR LIVING STOREFRONT</p>
      <h2>Give people a reason to return.</h2>
      <StorefrontBadge businessId={businessId} />
      {data?.preview?.primary && (
        <div className="city-storefront-state">
          <small>
            Draft preview · not published · inventory and dates still require
            approval
          </small>
          <strong>
            {storefrontVisual[data.preview.kind].icon}{" "}
            {storefrontVisual[data.preview.kind].label}
          </strong>
          <p>{data.preview.primary.title}</p>
        </div>
      )}
      <p>
        {data?.followers ?? "—"} followers · distinct from saves and customers.
      </p>
      {l.deals && <a href="#city-deal-studio">Create a deal</a>}
      {" · "}
      {l.launches && <a href="#city-launch-studio">Schedule a launch</a>}
      <p>
        Campaign history records approved changes. Claims are entitlements;
        merchant reports do not establish purchases or verified revenue.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.events.map((e) => (
        <article className="city-inbox-item" key={e.id}>
          <small>
            {new Date(e.created_at).toLocaleString()} ·{" "}
            {e.kind.replaceAll("_", " ")}
          </small>
          <h3>{e.title}</h3>
          <button
            onClick={() =>
              void downloadMoment(e.id).catch((e) => setError(e.message))}
          >
            Download moment card
          </button>
          <button
            onClick={() =>
              void navigator.clipboard.writeText(
                location.origin + e.destination,
              ).catch(() => setError("Copy unavailable in this browser."))}
          >
            Copy destination link
          </button>
        </article>
      ))}
      <button
        disabled={!offset}
        onClick={() => setOffset((v) => Math.max(0, v - 40))}
      >
        Previous history
      </button>
      <button
        disabled={!data || data.events.length < 40}
        onClick={() => setOffset((v) => v + 40)}
      >
        More history
      </button>
    </section>
  );
}
