import { createContext, useContext } from "react";
import { plotAxis, logicalAxis, estatePlotAxis, estateLogicalAxis } from "../../domain/cityLayout";

export const standardMapLayout = { plotAxis, logicalAxis, plotSize: 24, roadCapacityMultiplier: 1 };
export const estateMapLayout = {
  plotAxis: estatePlotAxis,
  logicalAxis: estateLogicalAxis,
  plotSize: 48,
  roadCapacityMultiplier: 4,
};
export const CityMapLayoutContext = createContext(standardMapLayout);
export const useCityMapLayout = () => useContext(CityMapLayoutContext);
