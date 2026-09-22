/** Closed, outward-wound triangular prism. Ridge runs along X; Y is up. */
export function pitchedRoofPositions(profile: "gable" | "hip" | "shed" | "mansard" = "gable"): number[] {
  if(profile === "mansard") {
    const rings=[[-.5,.5], [.3,.36], [.5,.28]];
    const vertices=rings.flatMap(([y,r])=>[[-r,y,-r],[r,y,-r],[r,y,r],[-r,y,r]]);
    const triangles:number[]=[];
    const face=(a:number,b:number,c:number)=>triangles.push(...vertices[a],...vertices[b],...vertices[c]);
    for(let level=0;level<2;level++)for(let i=0;i<4;i++){
      const a=level*4+i,b=level*4+(i+1)%4,c=b+4,d=a+4;
      face(a,d,b);face(b,d,c);
    }
    face(0,1,2);face(0,2,3);face(8,10,9);face(8,11,10);
    return triangles;
  }
  const vertices = [
    [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5],
    [-.5, -.5, .5], [-.5, .5, 0], [.5, .5, 0],
  ];
  if (profile === "hip") { vertices[4][0] = -.25; vertices[5][0] = .25; }
  if (profile === "shed") { vertices[4][2] = .5; vertices[5][2] = .5; }
  const faces = [
    0, 5, 1, 0, 4, 5,
    4, 2, 5, 4, 3, 2,
    0, 3, 4, 1, 5, 2,
    0, 2, 3, 0, 1, 2,
  ];
  return faces.flatMap((index) => vertices[index]);
}
