declare global {interface Window {GAP_CONFIG?:{apiUrl?:string}}}
let memoryToken='';
export function deviceToken():string {
  if(memoryToken)return memoryToken;
  try{memoryToken=localStorage.getItem('gap_device_v1')||'';}catch{}
  if(!/^[a-f0-9]{64}$/.test(memoryToken)){const bytes=crypto.getRandomValues(new Uint8Array(32));memoryToken=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('gap_device_v1',memoryToken);}catch{}}
  return memoryToken;
}
export function configured():boolean{return !!window.GAP_CONFIG?.apiUrl;}
export async function api<T=Record<string,unknown>>(action:string,body:unknown={},signal?:AbortSignal):Promise<T>{
  const endpoint=window.GAP_CONFIG?.apiUrl;
  if(!endpoint)throw new Error('The Google Sheets service is not connected yet.');
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw new Error('The Google Sheets service address needs to be checked.');
  let response:Response;
  try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action,body,deviceToken:deviceToken()}),signal:signal||AbortSignal.timeout(45000),redirect:'follow'});}catch(error){if(error instanceof Error&&error.name==='AbortError')throw error;throw new Error('Google Sheets could not be reached. Check your connection and try again.');}
  let result:{ok?:boolean;error?:string};try{result=await response.json() as typeof result;}catch{throw new Error('Google returned an access page instead of permit data. Check the web app deployment settings.');}
  if(!response.ok||!result.ok)throw new Error(result.error||'The request could not be completed. Please try again.');
  return result as T;
}
export function forgetDevice(){try{localStorage.removeItem('gap_device_v1');}catch{}memoryToken='';window.location.reload();}
