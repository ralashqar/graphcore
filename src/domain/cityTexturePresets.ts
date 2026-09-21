export const TEXTURE_IDS = ["none","brick","plaster","concrete","terracotta","metal","timber","pavers","checker"] as const;
export type CityTextureId = typeof TEXTURE_IDS[number];
export type CityTextureChoices = Partial<Record<"wall"|"roof"|"ground",CityTextureId>>;
export const CITY_TEXTURES:Record<CityTextureId,{label:string;asset:string;meters:number}> = {
 none:{label:"Palette only",asset:"",meters:1},
 brick:{label:"Red brick",asset:"Bricks051",meters:1.25},
 plaster:{label:"Painted plaster",asset:"PaintedPlaster017",meters:2},
 concrete:{label:"Concrete",asset:"Concrete034",meters:3},
 terracotta:{label:"Terracotta roof",asset:"RoofingTiles012A",meters:2},
 metal:{label:"Metal",asset:"Metal032",meters:2},
 timber:{label:"Timber siding",asset:"WoodSiding005",meters:2},
 pavers:{label:"Paving stones",asset:"PavingStones036",meters:2},
 checker:{label:"Decorative checker tiles",asset:"Tiles074",meters:2},
};
