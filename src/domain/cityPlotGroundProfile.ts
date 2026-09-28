/** Walkable plot ground of a building design (docs/city-ground-contact.md); see cityPlotGround.ts. */
import {buildingParts,type CityBuildingDesign} from './cityBuildingDesign.ts';
import {DEFAULT_PLOT_GROUND,plotGroundProfileFromParts,type GroundPart,type PlotGroundProfile} from './cityPlotGround.ts';

const cache=new Map<string,PlotGroundProfile>();
/** Walkable ground of a plot drawn with `design` (cached by content; callers often rebuild equal designs).
 * Resolution failures use the default. */
export function plotGroundProfile(design:CityBuildingDesign|undefined|null):PlotGroundProfile{
 if(!design)return DEFAULT_PLOT_GROUND;
 const key=JSON.stringify(design);let profile=cache.get(key);if(profile)return profile;
 try{profile=plotGroundProfileFromParts(buildingParts(design,'#ffffff') as GroundPart[]);}catch{profile=DEFAULT_PLOT_GROUND;}
 if(!profile.pads.length)profile={...profile,pads:DEFAULT_PLOT_GROUND.pads};
 cache.set(key,profile);while(cache.size>96)cache.delete(cache.keys().next().value!);return profile;
}
