/* GitHub/Aruba uses a memory-only bearer; only the short-lived PKCE verifier survives navigation. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.CookAuth=factory(root);
})(globalThis,function(env){
  'use strict';
  const remote=!!env.CookStatic;
  const frontend='https://cooklove.github.io';
  const base='https://www.caccavosalvatorebenefitbody.it/cookamore';
  const storageKey='cookamore.apple.pkce';
  const supported=!remote||env.location.origin===frontend;
  const canLogin=supported&&env.location.protocol==='https:';
  let token=null,csrf=null,epoch=0;
  const expired=new Set();
  const encode=bytes=>env.btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function clearSession(){token=null;csrf=null;epoch++}
  function endpoint(path){
    // Paths supplied by UI/data cannot change the host or escape the API prefix.
    if(typeof path!=='string'||!/^\/api\/[a-zA-Z0-9_/-]+$/.test(path))throw new Error('Indirizzo API non valido.');
    return remote?base+path:path;
  }
  async function request(path,method='GET',body){
    const url=endpoint(path);
    if(!supported)throw new Error('L’accesso del sito è disponibile dall’indirizzo ufficiale HTTPS di CookAmore.');
    const headers={Accept:'application/json'},usedToken=token,started=epoch;
    if(remote&&usedToken&&path!=='/api/auth/status')headers.Authorization='Bearer '+usedToken;
    if(method!=='GET'&&method!=='HEAD'){
      headers['Content-Type']='application/json';
      if(!remote)headers['X-CSRF-Token']=csrf||'';
    }
    const response=await env.fetch(url,{method,headers,credentials:remote?'omit':'same-origin',
      cache:'no-store',redirect:'error',signal:env.AbortSignal.timeout(10000),
      body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){
      if(response.status===401&&started===epoch){clearSession();for(const callback of expired)callback()}
      let result={};try{result=await response.json()}catch{}
      const error=new Error(typeof result.error==='string'?result.error:'Richiesta non riuscita.');
      error.status=response.status;throw error;
    }
    return response.json();
  }
  async function beginApple(){
    if(!canLogin)throw new Error('Per accedere, apri il sito ufficiale con HTTPS.');
    const status=await request('/api/auth/status');
    if(status.providers?.apple!==true)throw new Error(status.reason||'Accesso Apple in preparazione.');
    if(!remote){env.location.assign('/api/auth/start/apple?client=web');return}
    const bytes=new Uint8Array(32);env.crypto.getRandomValues(bytes);
    const verifier=encode(bytes);
    const challenge=encode(new Uint8Array(await env.crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    // No session/Apple token enters browser storage. Failure to store the verifier aborts the flow.
    try{env.sessionStorage.setItem(storageKey,JSON.stringify({verifier,created:Date.now()}))}
    catch{throw new Error('Il browser non permette di preparare l’accesso. Abilita i dati del sito e riprova.')}
    env.location.assign(base+'/api/auth/start/apple?client=web&code_challenge='+encodeURIComponent(challenge));
  }
  async function completeApple(){
    const fragment=env.location.hash;
    if(!fragment.startsWith('#cookamore-login='))return false;
    // Erase the one-use code before any fetch, error rendering or other navigation.
    env.history.replaceState(null,'',env.location.pathname+env.location.search);
    clearSession();
    let stored=null;
    try{const raw=env.sessionStorage.getItem(storageKey);env.sessionStorage.removeItem(storageKey);
      if(raw&&raw.length<=512)stored=JSON.parse(raw)}catch{}
    const match=/^#cookamore-login=([A-Za-z0-9_-]{43})$/.exec(fragment);
    if(!remote||!canLogin||!match||typeof stored?.verifier!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(stored.verifier)
      ||!Number.isSafeInteger(stored.created)||stored.created>Date.now()||Date.now()-stored.created>=600000)
      throw new Error('Accesso scaduto o aperto in un’altra scheda. Ripeti Accedi con Apple.');
    const started=epoch;
    const result=await request('/api/auth/handoff','POST',{code:match[1],verifier:stored.verifier});
    if(started!==epoch)throw new Error('L’accesso è stato annullato. Ripeti Accedi con Apple.');
    if(typeof result.token!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(result.token))throw new Error('Risposta di accesso non valida.');
    token=result.token;return true;
  }
  return {remote,canLogin,supported,request,beginApple,completeApple,clearSession,
    setCSRF(value){csrf=value},onExpired(callback){expired.add(callback);return()=>expired.delete(callback)}};
});
