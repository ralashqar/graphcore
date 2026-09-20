import { useEffect, useRef, useState } from "react";
import { CITY_TIERS, formatGBP, type CityProperty } from "../../domain/city";
import {
  marketHeadline,
  type CityMarket,
  type MarketEvent,
  type CityQuote,
} from "../../domain/cityMarket";
import { cityCall, cityCommand, downloadCityCard } from "./api";
import { CityDialog } from "./CityAuth";
import "./city-market.css";
export const marketQuote = (businessId: string, amount: number) =>
  cityCall<CityQuote>("city-api", {
    action: "market_quote",
    businessId,
    amount,
  });
export function CityMarketBoard({
  revision,
  onSelect,
  onChallenge,
  onTransition,
  demoProperties,
}: {
  demoProperties?: CityProperty[];
  revision: number;
  onSelect: (p: CityProperty) => void;
  onChallenge: () => void;
  onTransition: (e: MarketEvent, replay?: boolean) => void;
}) {
  const [data, setData] = useState<CityMarket | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [more, setMore] = useState(true),
    [busy, setBusy] = useState(false);
  const loadedOlder=useRef(false);
  const seen = useRef<number | null>(null),
    callback = useRef(onTransition);
  callback.current = onTransition;
  useEffect(() => {
    if (demoProperties) {
      setData({
        revision,
        top: demoProperties
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 10),
        events: [],
      });
      setMore(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const next = await cityCall<CityMarket>("city-api", {
          action: "market_public",
        });
        if (!active || (seen.current !== null && next.revision < seen.current))
          return;
        const latest = next.events[0];
        if (
          seen.current !== null &&
          latest &&
          latest.revision > seen.current &&
          Date.now() - Date.parse(latest.created_at) < 15000
        )
          callback.current(latest);
        seen.current = next.revision;
        setData(current=>current&&loadedOlder.current?{...next,events:[...next.events,...current.events.filter(e=>e.revision<(next.events.at(-1)?.revision??Infinity))]}:next);
        if(!loadedOlder.current)setMore(next.events.length === 20);
        setError("");
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [revision, demoProperties]);
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("market"));
    if (demoProperties || !Number.isSafeInteger(id) || id < 1) return;
    let active = true;
    void cityCall<CityMarket>("city-api", {
      action: "market_public",
      before: id + 1,
    })
      .then((d) => {
        if (!active) return;
        const event = d.events.find((e) => e.revision === id);
        if (event) callback.current(event, true);
        else setError("This market event is unavailable.");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const leader = data?.top[0];
  async function older() {
    if (!data || busy) return;
    setBusy(true);
    loadedOlder.current=true;
    try {
      const next = await cityCall<CityMarket>("city-api", {
        action: "market_public",
        before: data.events.at(-1)?.revision,
      });
      setData((current) =>
        current
          ? {
              ...current,
              events: [
                ...current.events,
                ...next.events.filter(
                  (e) => !current.events.some((c) => c.revision === e.revision),
                ),
              ],
            }
          : current,
      );
      setMore(next.events.length === 20);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="city-market-leader" aria-label="Paid city positions">
        <span className="city-eyebrow">CENTRAL PLAZA · SPONSORED LOCATION</span>
        {leader ? (
          <>
            <button
              className="city-market-title"
              onClick={() => onSelect(leader)}
            >
              #1 {leader.profile.name}
            </button>
            <small>
              {formatGBP(leader.landValue)} City Value ·{" "}
              {CITY_TIERS[leader.tier].name}
            </small>
          </>
        ) : (
          <strong>{error ? "Market unavailable" : "Central Plaza"}</strong>
        )}
        <div>
          <button onClick={() => setOpen(true)}>Top spots & market feed</button>
          <button onClick={onChallenge}>Challenge #1 ↗</button>
        </div>
      </section>
      {open && (
        <CityDialog title="City market" onClose={() => setOpen(false)}>
          <p>
            City Value buys sponsored geography. Hot Now ranks customer activity
            separately.
          </p>
          {error && <p role="alert">{error}</p>}
          <ol className="city-market-top">
            {data?.top.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    onSelect(p);
                    setOpen(false);
                  }}
                >
                  <strong>
                    #{p.rank} {p.profile.name}
                  </strong>
                  <span>
                    {formatGBP(p.landValue)} · {CITY_TIERS[p.tier].name}
                    {(() => {
                      const m = data?.events
                        .flatMap((e) => e.moves)
                        .find((m) => m.id === p.id);
                      return m?.before &&
                        m.after &&
                        m.before.rank !== m.after.rank
                        ? ` · ${m.before.rank > m.after.rank ? "↑" : "↓"}${Math.abs(m.before.rank - m.after.rank)}`
                        : "";
                    })()}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <h3>Market feed</h3>
          {data?.events.map((e) => (
            <article className="city-market-event" key={e.revision}>
              <strong>{marketHeadline(e)}</strong>
              <small>
                {new Date(e.created_at).toLocaleString()} · revision{" "}
                {e.revision}
              </small>
              {e.moves
                .filter((m) => m.id === e.initiator)
                .map((m) => (
                  <p key={m.id}>
                    {m.before ? `#${m.before.rank}` : "New arrival"} →{" "}
                    {m.after
                      ? `#${m.after.rank} · ${formatGBP(m.after.value)}`
                      : "Unplaced"}
                  </p>
                ))}
              <button
                onClick={() => {
                  callback.current(e, true);
                  setOpen(false);
                }}
              >
                Replay movement
              </button>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`${location.origin}/city?market=${e.revision}`)
                    .catch((err) => setError(String(err)))
                }
              >
                Copy event link
              </button>
              {e.moves.find((m) => m.id === e.initiator)?.after && (
                <button
                  onClick={() => {
                    const p = e.moves.find((m) => m.id === e.initiator)!.after!;
                    void downloadCityCard(
                      p.name,
                      p.rank,
                      formatGBP(p.value),
                      p.color,
                      e.created_at,
                    ).catch((err) => setError(String(err)));
                  }}
                >
                  Save rank card
                </button>
              )}
            </article>
          ))}
          {more && (
            <button disabled={busy} onClick={() => void older()}>
              Older events
            </button>
          )}
        </CityDialog>
      )}
    </>
  );
}
export function QuotePreview({
  quote,
  onAmount,
}: {
  quote: CityQuote | null;
  onAmount: (value: string) => void;
}) {
  if (!quote)
    return (
      <p>Enter a valid amount to request a city-wide position estimate.</p>
    );
  return (
    <div className="city-market-quote">
      <div className="city-market-ranks">
        <span>
          NOW
          <strong>
            {quote.currentRank ? `#${quote.currentRank}` : "Unplaced"}
          </strong>
        </span>
        <span>→</span>
        <span>
          ESTIMATED<strong>#{quote.rank}</strong>
        </span>
      </div>
      <p>
        {CITY_TIERS[quote.currentTier].name} → {CITY_TIERS[quote.tier].name}
      </p>
      {quote.to && (
        <svg
          viewBox="-12 -12 24 24"
          role="img"
          aria-label="Estimated position relative to Central Plaza"
        >
          <path
            d="M -12 0 H 12 M 0 -12 V 12"
            stroke="#bcc9bf"
            strokeWidth=".3"
          />
          <circle r=".7" fill="#b28a35" />
          {quote.from && (
            <>
              <path
                d={`M ${quote.from.x} ${quote.from.z} L ${quote.to.x} ${quote.to.z}`}
                stroke="#355b45"
                strokeWidth=".25"
                strokeDasharray=".5 .5"
              />
              <circle cx={quote.from.x} cy={quote.from.z} r=".5" fill="#999" />
            </>
          )}
          <circle cx={quote.to.x} cy={quote.to.z} r=".65" fill="#355b45" />
        </svg>
      )}
      <div>
        {quote.targets.map((t) => (
          <button
            key={t.rank}
            disabled={!t.available}
            onClick={() => onAmount((t.amount / 100).toFixed(2))}
          >
            Reach #{t.rank} · +{formatGBP(t.amount)}
          </button>
        ))}
      </div>
      <small>
        Targets exceed the incumbent by 1p, subject to the £10 minimum and
        £50,000 maximum. Ties favour the earlier incumbent.
      </small>
      {quote.overtaken.length > 0 && (
        <p>
          Potentially passing: {quote.overtaken.map((p) => p.name).join(", ")}
          {quote.overtaken.length === 10 ? " (first ten shown)" : ""}.
        </p>
      )}
      <small>
        Market revision {quote.revision} ·{" "}
        {new Date(quote.quotedAt).toLocaleTimeString()}. Final rank is confirmed
        after payment settles.
      </small>
    </div>
  );
}
type Position = {
  category?: string;
  categoryRank?: number;
  metrics: { source: string; kind: string; count: number }[];
  place: { rank: number; land_value: number; tier: number } | null;
  bestRank: number | null;
  history: {
    id: string;
    to_rank: number;
    from_rank: number | null;
    created_at: string;
    kind: string;
  }[];
  alerts: {
    id: string;
    from_rank: number;
    to_rank: number | null;
    read_at: string | null;
  }[];
  preferences: {
    lose_central: boolean;
    leave_top_ten: boolean;
    below_rank: number | null;
  } | null;
};
export function MerchantPosition({
  businessId,
  revision,
}: {
  businessId: string;
  revision: number;
}) {
  const [data, setData] = useState<Position | null>(null),
    [error, setError] = useState("");
  const [prefs, setPrefs] = useState({
    lose_central: true,
    leave_top_ten: true,
    below_rank: null as number | null,
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void cityCall<Position>("city-api", {
      action: "market_position",
      businessId,
    })
      .then((d) => {
        if (active) {
          setData(d);
          if (d.preferences) setPrefs(d.preferences);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [businessId, revision]);
  async function save() {
    setSaving(true);
    try {
      await cityCommand("market_preferences", { businessId, ...prefs });
      setError("Alert preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="city-business-section city-merchant-position">
      <span className="city-eyebrow">YOUR CITY POSITION</span>
      <h2>
        {data?.place
          ? `#${data.place.rank} · ${CITY_TIERS[data.place.tier].name}`
          : "No paid position yet"}
      </h2>
      {data?.place&&<p>{formatGBP(data.place.land_value)} City Value</p>}
      <a href="#city-next-move">Increase City Value →</a>
      {data?.categoryRank&&<p>#{data.categoryRank} by City Value in {data.category}. Category comparison; no separate district plot.</p>}
      {data?.bestRank && <p>Best recorded position: #{data.bestRank}</p>}
      {data?.place && CITY_TIERS[data.place.tier + 1] && (
        <p>
          Next building upgrade at{" "}
          {formatGBP(CITY_TIERS[data.place.tier + 1].minimum)} City Value.
        </p>
      )}
      <h3>Traffic sources · last 30 days</h3>
      <p>
        Daily deduplicated interactions. These are property opens and outbound
        clicks, not measured canvas exposure or attributed purchases.
      </p>
      {data?.metrics?.map((m) => (
        <p key={m.source + m.kind}>
          {m.source.replaceAll("_", " ")} · {m.kind}: {m.count}
        </p>
      ))}
      <h3>Position alerts</h3>
      {data?.alerts
        .filter((a) => !a.read_at)
        .map((a) => (
          <p key={a.id}>
            Your position moved #{a.from_rank} →{" "}
            {a.to_rank ? `#${a.to_rank}` : "unplaced"}. Use the current bid
            preview to estimate regaining it.{" "}
            <button
              onClick={() =>
                void cityCommand("market_read", { businessId, alertId: a.id })
                  .then(() =>
                    setData((d) =>
                      d
                        ? {
                            ...d,
                            alerts: d.alerts.map((x) =>
                              x.id === a.id
                                ? { ...x, read_at: new Date().toISOString() }
                                : x,
                            ),
                          }
                        : d,
                    ),
                  )
                  .catch((e) => setError(e.message))
              }
            >
              Mark read
            </button>
          </p>
        ))}
      <label className="city-checkbox">
        <input
          type="checkbox"
          checked={prefs.lose_central}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, lose_central: e.target.checked }))
          }
        />{" "}
        Lose Central Plaza
      </label>
      <label className="city-checkbox">
        <input
          type="checkbox"
          checked={prefs.leave_top_ten}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, leave_top_ten: e.target.checked }))
          }
        />{" "}
        Leave Top 10
      </label>
      <label>
        Fall below rank{" "}
        <input
          type="number"
          min="1"
          max="100000"
          value={prefs.below_rank ?? ""}
          onChange={(e) =>
            setPrefs((p) => ({
              ...p,
              below_rank: e.target.value ? Number(e.target.value) : null,
            }))
          }
        />
      </label>
      <button disabled={saving} onClick={() => void save()}>
        Save in-app alerts
      </button>
      {error && <p role="status">{error}</p>}
      <details>
        <summary>Position history</summary>
        {data?.history.map((h) => (
          <p key={h.id}>
            {new Date(h.created_at).toLocaleDateString()} ·{" "}
            {h.from_rank ? `#${h.from_rank}` : "Arrival"} → #{h.to_rank} ·{" "}
            {h.kind}
          </p>
        ))}
      </details>
    </section>
  );
}
