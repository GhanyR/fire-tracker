// Pipe directly to a secret manager. Do not commit or log the output.
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
const privateKey=(await crypto.subtle.exportKey('jwk',pair.privateKey)).d;
const random=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
process.stdout.write(JSON.stringify({ALERT_VAPID_PUBLIC_KEY:publicKey,ALERT_VAPID_PRIVATE_KEY:privateKey,ALERT_STORAGE_KEY:random(),ALERT_DISPATCH_TOKEN:random()}));
