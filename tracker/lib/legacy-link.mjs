export function legacyDestination(hash,base){
 if(!/^#(?:KRH-[a-z0-9]+(?:-\d+)?(?:-3d)?|insiden|dekat|cuaca|drone|laporan|lainnya|integrasi|sumber|bot)$/i.test(hash))return null;
 const url=new URL('legacy/',base);url.hash=hash;return url.href;
}
