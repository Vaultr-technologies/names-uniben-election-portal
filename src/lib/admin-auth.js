// The public Cognito client ID and hosted-login domain are configuration, NOT secrets.
// Never store access/refresh tokens in localStorage or in the URL.
const domain=(import.meta.env.VITE_ADMIN_COGNITO_DOMAIN||'').replace(/\/$/,'');
const clientId=import.meta.env.VITE_ADMIN_CLIENT_ID||'';
const redirectUri=import.meta.env.VITE_ADMIN_REDIRECT_URI||'';
const apiBase=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
export const adminConfigured=Boolean(/^https:\/\/[^/]+$/.test(domain)&&clientId&&redirectUri&&apiBase);
const random=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function toBase64Url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function startAdminLogin(){
  if(!adminConfigured)throw new Error('Admin sign-in has not been configured for this deployment.');
  const verifier=toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const state=random(crypto.getRandomValues(new Uint8Array(20)));
  sessionStorage.setItem('eleco_admin_pkce',JSON.stringify({verifier,state,createdAt:Date.now()}));
  const q=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'openid email',code_challenge_method:'S256',code_challenge:toBase64Url(new Uint8Array(digest)),state,prompt:'login'});
  window.location.assign(`${domain}/oauth2/authorize?${q}`);
}
export async function finishAdminLogin(){
  const url=new URL(window.location.href);
  const error=url.searchParams.get('error');
  const code=url.searchParams.get('code');
  if(!code&&!error)return null;
  const returnedState=url.searchParams.get('state');
  const saved=JSON.parse(sessionStorage.getItem('eleco_admin_pkce')||'null');
  sessionStorage.removeItem('eleco_admin_pkce');
  url.searchParams.delete('code');url.searchParams.delete('state');url.searchParams.delete('error');url.searchParams.delete('error_description');
  url.hash='admin';
  window.history.replaceState(null,'',url.toString());
  if(!saved||returnedState!==saved.state||Date.now()-saved.createdAt>600_000)throw new Error('Sign-in session expired or failed the security check. Please try again.');
  if(error)throw new Error('Administrator sign-in was cancelled or denied.');
  if(!code||!adminConfigured)throw new Error('Administrator sign-in configuration is missing.');
  const body=new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,code_verifier:saved.verifier,redirect_uri:redirectUri});
  const response=await fetch(`${domain}/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token||data.token_type?.toLowerCase()!=='bearer')throw new Error('Could not complete administrator sign-in.');
  return data.access_token;
}
export async function adminRequest(path, token, options={}){
  if(!adminConfigured)throw new Error('Admin service not configured.');
  const response=await fetch(`${apiBase}${path}`,{method:options.method||'GET',headers:{'Authorization':`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data.message||`Request failed (${response.status}).`);e.status=response.status;throw e;}
  return data;
}
export function adminLogout(){
  if(adminConfigured){
    const q=new URLSearchParams({client_id:clientId,logout_uri:redirectUri});
    window.location.assign(`${domain}/logout?${q}`);
  } else window.location.assign(redirectUri||window.location.pathname);
}
