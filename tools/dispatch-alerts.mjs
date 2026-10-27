// Run from a trusted scheduler. Never log the dispatch key or subscriber data.
const token=process.env.ALERT_DISPATCH_TOKEN;
if(!token){console.log('Nearby alert dispatch is not configured.');process.exit(0);}
const origin=new URL(process.env.ALERTS_ORIGIN||'https://fire-tracker.fiveprayerapp.chatgpt.site');
if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash)throw new Error('Set a plain HTTPS alert service origin.');
let cursor=null,processed=0,sent=0,failed=0;
for(let page=0;page<20;page++){
 const response=await fetch(new URL('/api/alerts/dispatch',origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({cursor}),redirect:'error',signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`Alert service returned HTTP ${response.status}. No subscriber details were logged.`);
 const result=await response.json();if(!result.ok)throw new Error('Alert dispatch was not accepted.');
 processed+=result.processed||0;sent+=result.sent||0;failed+=result.failed||0;
 if(!result.nextCursor){console.log(JSON.stringify({processed,acceptedByPushProvider:sent,failed}));process.exit(0);}
 if(result.nextCursor===cursor)throw new Error('Alert dispatch cursor did not advance.');cursor=result.nextCursor;
}
throw new Error('The alert dispatch page limit was reached; remaining watches wait for the next scheduled check.');
