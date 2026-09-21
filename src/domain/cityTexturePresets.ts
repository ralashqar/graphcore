export const TEXTURE_IDS = ["none","brick","plaster","concrete","terracotta","metal","timber","pavers","checker","grass-lawn","grass-meadow","grass-lush"] as const;
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
 // Legacy recipes remain readable, but checkerboard now resolves to paving.
 checker:{label:"Paving stones (legacy)",asset:"PavingStones036",meters:8},
 "grass-lawn":{label:"Short lawn",asset:"Grass005",meters:8},
 "grass-meadow":{label:"Natural grass",asset:"Grass003",meters:8},
 "grass-lush":{label:"Lush garden grass",asset:"Grass004",meters:8},
};

export function borderTexture(choices: CityTextureChoices | undefined, primary: "wall" | "ground"): CityTextureId | undefined {
 const secondary = choices?.[primary === "wall" ? "wallBorder" : "groundBorder"];
 return !secondary || secondary === "primary" ? choices?.[primary] : secondary;
}

export const SELECTABLE_TEXTURE_IDS = TEXTURE_IDS.filter(id => id !== "checker");
export function displayedTexture(id: CityTextureId | "primary" | undefined) { return id === "checker" ? "pavers" : id; }
