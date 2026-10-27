/** Concept 13: a tall flame over a mountain ridge, separated by open space. */
export const FIRE_BRAND = Object.freeze({
  width: 80,
  height: 106,
  viewBox: '0 0 80 106',
  flame: '#e45522',
  terrain: '#173e32',
  terrainDark: '#c5eadc',
  flamePath: 'M50 3C43 23 59 29 68 44C78 59 82 72 75 85L63 68C62 66 60.5 66 59 68L57 70L47.5 55.5C46 53 44 53 42.5 55.5L30.5 72L27.5 68C26.5 66.5 24.5 66.5 23 69C17.5 76 10.5 82.5 5 86C-2 71 1.5 58 11 46C17 38 20 33 21 29C25 35 25 42 21.5 49C31 43.5 32 35 33 27C34.5 15 40 8 50 3Z',
  terrainPath: 'M7 90C12 87 17 83 20.5 78.5C22.5 76 24.5 77.5 25.5 84C31 80 38 69 42.5 64.5C44.5 62.5 46 62 48 65C52 70.5 52 80 60.5 88C58.5 82.5 58 77 60.5 76.5C63 77.5 68.5 86 73 90C65 99 55 102 40 102C26 102 15 99 7 90Z',
});

/** Used to generate the public favicon assets from the same geometry. */
export function fireBrandFavicon({ dark = false, adaptive = false } = {}) {
  const background = dark ? '#0b211d' : '#fafbf6';
  const terrain = dark ? FIRE_BRAND.terrainDark : FIRE_BRAND.terrain;
  const theme = adaptive ? '<style>@media(prefers-color-scheme:dark){.back{fill:#0b211d}.terrain{fill:#c5eadc}}</style>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112">${theme}<rect class="back" width="112" height="112" rx="23" fill="${background}"/><g transform="translate(16 2)"><path d="${FIRE_BRAND.flamePath}" fill="${FIRE_BRAND.flame}"/><path class="terrain" d="${FIRE_BRAND.terrainPath}" fill="${terrain}"/></g></svg>\n`;
}
