// Plano maestro del campus (metros). +X = este, +Z = sur.
export const TURBINES = [[-95, -150], [-12, -178], [72, -158]];
export const WIND_J = [58, -78];
export const HUB = { x: 52, z: -12 };
export const BESS_X = [46, 50, 54, 58];
export const BESS_Z = -25;
export const PYLONS = [[106, -18], [172, -26], [245, -38], [330, -52]];
export const CARPORT_Z = [30, 50];
export const CARPORT_X0 = 44, CARPORT_X1 = 86;

// rutas de cable sobre terreno (XZ), usadas por los cables y para despejar árboles
export const WIND_ROUTES = [
  [TURBINES[0], [-40, -112], WIND_J],
  [TURBINES[1], [10, -128], WIND_J],
  [TURBINES[2], [68, -112], WIND_J],
  [WIND_J, [64, -42], [64, -12], [56, -12]],
];

export const COLORS = {
  solar: 0xffc531,
  wind: 0x49d6ff,
  batt: 0x62ff9a,
  load: 0xff6f4d,
  ev: 0xb98bff,
  grid: 0xdfe8ff,
};
