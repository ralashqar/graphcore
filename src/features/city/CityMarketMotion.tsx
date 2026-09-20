import { createContext, useContext } from "react";
import type { MarketEvent } from "../../domain/cityMarket";
export type MarketPlayback = {
  event: MarketEvent;
  started: number;
  replay?: boolean;
};
export const MarketMotionContext = createContext<MarketPlayback | null>(null);
export const useMarketMotion = () => useContext(MarketMotionContext);
