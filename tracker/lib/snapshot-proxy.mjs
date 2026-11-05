const SOURCES=[
 'https://ghanyr.github.io/fire-tracker/data/observations.json',
 'https://raw.githubusercontent.com/GhanyR/fire-tracker/data/data/observations.json',
];
// Fixed public sources only: no user-supplied URL, credentials or location.
export async function fetchPublishedSnapshot(fetcher=fetch){
 for(const url of SOURCES){
  try{
   const response=await fetcher(url,{signal:AbortSignal.timeout(60000),cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':300,'400-599':0}}});
   if(!response.ok||!/(application\/json|text\/plain)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();continue;}
   return new Response(response.body,{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'}});
  }catch{}
 }
 return Response.json({error:'Pembaruan satelit belum tersedia.'},{status:502,headers:{'Cache-Control':'no-store'}});
}
