/** Closed, outward-wound triangular prism. Ridge runs along X; Y is up. */
export function pitchedRoofPositions(): number[] {
  const vertices = [
    [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5],
    [-.5, -.5, .5], [-.5, .5, 0], [.5, .5, 0],
  ];
  const faces = [
    0, 5, 1, 0, 4, 5,
    4, 2, 5, 4, 3, 2,
    0, 3, 4, 1, 5, 2,
    0, 2, 3, 0, 1, 2,
  ];
  return faces.flatMap((index) => vertices[index]);
}
