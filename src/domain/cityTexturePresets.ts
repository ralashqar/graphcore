export const TEXTURE_IDS = ["none","brick","plaster","concrete","terracotta","metal","timber","pavers","checker"] as const;
export type CityTextureId = typeof TEXTURE_IDS[number];
export type CityTextureChoices = Partial<Record<"wall"|"roof"|"ground",CityTextureId>> & Partial<Record<"wallBorder"|"groundBorder",CityTextureId|"primary">>;
// World-space metres per repeat: deliberately oversized for readable city-scale materials.
export const CITY_TEXTURES:Record<CityTextureId,{label:string;asset:string;meters:number}> = {
 none:{label:"Palette only",asset:"",meters:1},
 brick:{label:"Red brick",asset:"Bricks051",meters:5},
 plaster:{label:"Painted plaster",asset:"PaintedPlaster017",meters:8},
 concrete:{label:"Concrete",asset:"Concrete034",meters:12},
 terracotta:{label:"Terracotta roof",asset:"RoofingTiles012A",meters:8},
 metal:{label:"Metal",asset:"Metal032",meters:8},
 timber:{label:"Timber siding",asset:"WoodSiding005",meters:8},
 pavers:{label:"Paving stones",asset:"PavingStones036",meters:8},
 checker:{label:"Decorative checker tiles",asset:"Tiles074",meters:8},
};

export function borderTexture(choices: CityTextureChoices | undefined, primary: "wall" | "ground"): CityTextureId | undefined {
 const secondary = choices?.[primary === "wall" ? "wallBorder" : "groundBorder"];
 return !secondary || secondary === "primary" ? choices?.[primary] : secondary;
}
