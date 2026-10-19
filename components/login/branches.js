// @ts-check

/**
 * Where the firm is (spec section 15, branch constellation).
 *
 * One list of real coordinates, used by both the flat illustration and the
 * 3D scene, so the two show the same country and the pins cannot drift
 * apart. Noida is the hub because it is the head office, which is why the
 * arcs radiate from it rather than forming a ring.
 */

/** @typedef {{code: string, name: string, lat: number, lon: number, hub?: boolean}} Branch */

/** @type {Branch[]} */
export const BRANCHES = [
  { code: "LDH", name: "Ludhiana", lat: 30.91, lon: 75.85 },
  { code: "MRT", name: "Meerut", lat: 28.98, lon: 77.7 },
  { code: "DEL", name: "Delhi", lat: 28.72, lon: 77.11 },
  { code: "NOI", name: "Noida", lat: 28.53, lon: 77.39, hub: true },
];

export const HUB = BRANCHES.find((branch) => branch.hub) ?? BRANCHES[0];

/** The window of North India the scene shows. */
export const BOUNDS = { west: 74.5, east: 78.5, south: 27.5, north: 31.5 };

/**
 * Longitude and latitude to the flat illustration's coordinates.
 * @param {Branch} branch
 * @param {{width: number, height: number, pad: number}} box
 */
export function toSvg(branch, { width, height, pad }) {
  const x =
    pad +
    ((branch.lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) *
      (width - pad * 2);
  const y =
    pad +
    ((BOUNDS.north - branch.lat) / (BOUNDS.north - BOUNDS.south)) *
      (height - pad * 2);
  return { x, y };
}

/**
 * The same thing for the 3D scene: a plane 8 units wide lying in x/z, with
 * north towards negative z.
 * @param {Branch} branch
 * @returns {[number, number, number]}
 */
export function toWorld(branch) {
  const x =
    ((branch.lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west) - 0.5) * 8;
  const z =
    ((BOUNDS.north - branch.lat) / (BOUNDS.north - BOUNDS.south) - 0.5) * 8;
  return [x, groundAt(x, z), z];
}

/**
 * The height of the relief at a point.
 *
 * Deliberately a formula rather than a heightmap: the Himalayan foothills
 * rise along the north edge and the Indo-Gangetic plain is flat, which is
 * the only geographic fact this scene is making, and it is three lines of
 * arithmetic instead of a texture to download.
 *
 * @param {number} x
 * @param {number} z
 */
export function groundAt(x, z) {
  // z runs north (negative) to south (positive): the foothills are the ridge
  const foothills = Math.max(0, (-z - 1.2) / 2.8);
  const ridge = Math.sin(x * 0.9 + 0.4) * 0.18 + Math.sin(x * 2.3 - 1.1) * 0.07;
  const plain = Math.sin(x * 0.6 - z * 0.5) * 0.02;
  return foothills * foothills * (0.55 + ridge) + plain;
}
