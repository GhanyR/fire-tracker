import { FIRE_BRAND } from '../lib/fire-brand.mjs';

export default function FireLogo() {
 return (
  <svg className="fire-logo" viewBox={FIRE_BRAND.viewBox} fill="none" aria-hidden="true" focusable="false">
   <path d={FIRE_BRAND.flamePath} fill={`var(--fire-logo-flame, ${FIRE_BRAND.flame})`} />
   <path d={FIRE_BRAND.terrainPath} fill={`var(--fire-logo-terrain, ${FIRE_BRAND.terrain})`} />
  </svg>
 );
}
