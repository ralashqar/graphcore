/** Closed, outward-wound triangular prism. Ridge runs along X; Y is up. */
export function pitchedRoofPositions(profile: "gable" | "hip" | "shed" = "gable"): number[] {
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
