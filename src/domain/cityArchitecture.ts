import { buildingMassing, buildingVariant } from "./cityLayout.ts";
export const FACADE = { pitch: 3, floorHeight: 3, windowWidth: 1.5, windowHeight: 1.8 } as const;
export function architecture(tier: number, variant: number, near: boolean) {
  const id = ["preset-0", "preset-1"].find(id => buildingVariant(id) === variant)!;
  const layout = buildingMassing(tier, id);
  const windows: {x:number;y:number;z:number;rotation:number;width:number;height:number}[] = [];
  layout.wings.forEach((wing, index) => {
    const other = layout.wings[1-index];
    for (const [rotation, length, offset] of [[0,wing.width,wing.depth/2],[Math.PI,wing.width,wing.depth/2],
      [Math.PI/2,wing.depth,wing.width/2],[-Math.PI/2,wing.depth,wing.width/2]]) {
      const count = Math.floor(length / FACADE.pitch);
      for (let floor=0;floor<wing.height / FACADE.floorHeight;floor += near ? 1 : 2) {
        for (let bay=0;bay<count;bay++) {
          const along = (bay-(count-1)/2)*FACADE.pitch;
          const x=wing.x+Math.cos(rotation)*along+Math.sin(rotation)*(offset+0.025);
          const z=wing.z-Math.sin(rotation)*along+Math.cos(rotation)*(offset+0.025);
          const y=floor*FACADE.floorHeight+1.5;
          // Omit detail on the shared internal wall between joined wings.
          if (Math.abs(x-other.x)<other.width/2+0.04 && Math.abs(z-other.z)<other.depth/2+0.04 && y<other.height) continue;
          windows.push({x,y,z,rotation,width:FACADE.windowWidth,height:FACADE.windowHeight});
        }
      }
    }
  });
  return { ...layout, windows };
}
