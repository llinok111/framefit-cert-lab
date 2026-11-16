// Shared case list: 6 meshes x 24 yaw x 2 aspect ratios = 288 view cases.
export const BASE = {
  fovY: (45 * Math.PI) / 180,
  margin: 0.9,
  pitch: 0.35,
  nearFrac: 0.005,
};
export const YAWS = 24;
export const ASPECTS = [16 / 9, 4 / 3];

export function caseList(meshes) {
  const cases = [];
  for (let mi = 0; mi < meshes.length; mi++) {
    for (const aspect of ASPECTS) {
      for (let k = 0; k < YAWS; k++) {
        cases.push({
          meshIndex: mi, mesh: meshes[mi].name,
          yaw: (k / YAWS) * Math.PI * 2,
          pitch: BASE.pitch, fovY: BASE.fovY, aspect, margin: BASE.margin, nearFrac: BASE.nearFrac,
        });
      }
    }
  }
  return cases;
}
