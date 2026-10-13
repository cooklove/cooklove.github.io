/* Cookie session only: credentials never enter localStorage or recipe URLs. */
(()=>{
'use strict';
if(window.CookStatic){
 const body=document.getElementById('account-body');
 body.innerHTML='<p>Il ricettario pubblico è disponibile senza account, con 200 ricette e tutte le copertine.</p><p class="notice">L’accesso Apple, i salvataggi e la sincronizzazione fra iPhone, iPad, Mac e web sono in preparazione. Non sono ancora attivi su questo sito.</p>';
 const show=()=>document.getElementById('login').showModal();
 window.CookAccount={show,bindRecipe(){const button=document.getElementById('save-recipe');if(button)button.onclick=show;}};
 document.getElementById('account').onclick=show;
 document.getElementById('close-login').onclick=()=>document.getElementById('login').close();
 return;
}

const el=id=>document.getElementById(id), safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null, csrf=null, providers={apple:false}, bookmarks=[], drafts=[], editing=null, saving=false, loading=false, generation=0;
let authReason='Verifica dell’accesso in corso…';
async function request(path,method='GET',body){
 const headers={Accept:'application/json'};
 if(method!=='GET'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=csrf||''}
 const response=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000),body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();
 if(!response.ok){const error=new Error(result.error||'Richiesta non riuscita');error.status=response.status;throw error}
 return result;
}
function message(text){const target=el('account-message');if(target)target.textContent=text}
function show(){el('login').showModal();load()}
function ready(){return !!(user?.nickname&&user?.adult_declared)}
function render(){
 el('account').textContent=user?(user.nickname||'Completa profilo'):'Accedi';
 if(!user){
  editing=null;
  el('account-body').innerHTML=`<p>Accedi con Apple per ritrovare salvataggi e bozze su iPhone, iPad, Mac e web.</p><a id="apple-login" class="primary apple-login ${providers.apple&&location.protocol==='https:'?'':'unavailable'}" ${providers.apple&&location.protocol==='https:'?'href="/api/auth/start/apple?client=web"':'aria-disabled="true"'}>Accedi con Apple</a><p class="notice">${safe(authReason)}</p><p class="tiny">Il ricettario pubblico si consulta senza account. Le tue bozze resteranno private; la pubblicazione richiederà la revisione dei contenuti.</p><p id="account-message" role="status"></p>`;
  bindRecipe(); return;
 }
 if(!ready()){
  el('account-body').innerHTML=`<p>L’accesso Apple è confermato. Completa il profilo per usare il ricettario personale.</p><form id="onboard"><label>Nickname<input id="nickname" autocomplete="nickname" required pattern="[a-z][a-z0-9_]{2,23}" minlength="3" maxlength="24" value="${safe(user.nickname)}"></label><p class="tiny">3–24 caratteri: lettere minuscole, numeri e _. Inizia con una lettera.</p><label class="consent"><input id="adult" type="checkbox" required> Dichiaro di avere almeno 18 anni</label><p class="tiny">Questa dichiarazione non costituisce una verifica dell’età. Progetto di sviluppo, documenti privacy e termini ancora da finalizzare prima del lancio.</p><button class="primary">Completa il profilo</button></form><p id="account-message" role="status"></p><button id="logout" class="secondary">Esci</button>`;
  el('onboard').onsubmit=async e=>{e.preventDefault();try{user=await request('/api/me','PATCH',{nickname:el('nickname').value,adult_declared:el('adult').checked});await load(true)}catch(error){message(error.message)}};
  bindLogout();bindRecipe();return;
 }
 if(editing && el('draft-editor')){renderLists();bindRecipe();return}
 el('account-body').innerHTML=`<p>Ciao <strong>${safe(user.nickname)}</strong>. Qui ritrovi il tuo ricettario su tutti i dispositivi collegati allo stesso account Apple.</p><p id="personal-sync" class="tiny" role="status"></p><div class="account-actions"><button id="new-draft" class="primary">Scrivi una bozza</button><button id="refresh-account" class="secondary">Aggiorna</button><button id="logout" class="secondary">Esci</button></div><p id="account-message" role="status"></p><section><h3>Ricette salvate</h3><div id="saved-list"></div></section><section><h3>Le tue bozze private</h3><p class="tiny">Solo tu puoi leggerle. Pubblicazione, caricamento foto e moderazione saranno aggiunti in una fase successiva.</p><div id="draft-list"></div></section><section id="draft-editor" hidden></section>`;
 el('new-draft').onclick=()=>edit(null);el('refresh-account').onclick=()=>load();bindLogout();renderLists();bindRecipe();
}
function renderLists(){
 if(!el('saved-list'))return;
 el('saved-list').innerHTML=bookmarks.length?bookmarks.map(r=>`<div class="personal-row"><a href="/ricette/${safe(r.slug)}">${safe(r.title)}<small>${safe(r.region)}</small></a><button class="remove-bookmark" data-id="${safe(r.id)}" aria-label="Rimuovi ${safe(r.title)} dai salvati">Rimuovi</button></div>`).join(''):'<p class="tiny">Apri una ricetta e scegli “Salva nel mio ricettario”.</p>';
 el('draft-list').innerHTML=drafts.length?drafts.map(d=>`<div class="personal-row"><button class="edit-draft" data-id="${safe(d.id)}">${safe(d.title)}<small>Bozza privata · versione ${d.version}</small></button><button class="delete-draft" data-id="${safe(d.id)}">Elimina</button></div>`).join(''):'<p class="tiny">La tua prima ricetta di casa può cominciare da una bozza.</p>';
 document.querySelectorAll('.remove-bookmark').forEach(button=>button.onclick=()=>saveRecipe(button.dataset.id,false));
 document.querySelectorAll('.edit-draft').forEach(button=>button.onclick=()=>{if(editing&&!confirm('Chiudere la bozza aperta? Le modifiche non salvate andranno perse.'))return;edit(drafts.find(d=>d.id===button.dataset.id))});
 document.querySelectorAll('.delete-draft').forEach(button=>button.onclick=async()=>{const draft=drafts.find(d=>d.id===button.dataset.id);if(!confirm(`Eliminare la bozza privata “${draft.title}” da tutti i dispositivi?`))return;try{await request('/api/me/recipes/'+draft.id,'DELETE',{version:draft.version});if(editing?.id===draft.id){editing=null;el('draft-editor').hidden=true}await load(true)}catch(error){message(error.message)}});
 el('personal-sync').textContent='Ultimo aggiornamento '+new Date().toLocaleTimeString('it-IT')+' · controllato ogni 30 secondi';
 if(editing?.id){const latest=drafts.find(d=>d.id===editing.id);if(!latest||latest.version!==editing.version)message('Questa bozza è cambiata su un altro dispositivo. Il tuo testo resta qui: copialo prima di riaprire la versione aggiornata.')}
}
function edit(draft){
 editing=draft?structuredClone(draft):{id:null,version:null};
 const d=draft||{title:'',description:'',base_servings:4,prep_minutes:0,cook_minutes:0,region:'',category:'',difficulty:'Facile',ingredients:[],steps:[]};
 const ingredients=d.ingredients.map(i=>`${i.name} | ${i.quantity??''} | ${i.unit} | ${i.note||''}`).join('\n');
 el('draft-editor').hidden=false;
 el('draft-editor').innerHTML=`<h3>${draft?'Modifica':'Nuova'} bozza privata</h3><form id="draft-form"><label>Titolo<input name="title" required maxlength="160" value="${safe(d.title)}"></label><label>La storia di questa ricetta<textarea name="description" maxlength="4000" rows="3">${safe(d.description)}</textarea></label><div class="draft-fields"><label>Persone<input name="base_servings" type="number" min="1" max="24" required value="${d.base_servings}"></label><label>Preparazione (min)<input name="prep_minutes" type="number" min="0" max="1440" required value="${d.prep_minutes}"></label><label>Cottura (min)<input name="cook_minutes" type="number" min="0" max="1440" required value="${d.cook_minutes}"></label><label>Regione<input name="region" maxlength="80" value="${safe(d.region)}"></label><label>Categoria<input name="category" maxlength="80" value="${safe(d.category)}"></label><label>Difficoltà<select name="difficulty">${['Facile','Media','Impegnativa'].map(v=>`<option ${v===d.difficulty?'selected':''}>${v}</option>`).join('')}</select></label></div><label>Ingredienti<textarea name="ingredients" rows="5" placeholder="Farina | 200 | g&#10;Sale | | qb">${safe(ingredients)}</textarea></label><p class="tiny">Un ingrediente per riga: nome | quantità | unità | nota facoltativa. Unità: g, kg, ml, l, pz, cucchiai, cucchiaini, qb. Per q.b. lascia la quantità vuota.</p><label>Procedimento<textarea name="steps" rows="5" placeholder="Un passaggio per riga">${safe(d.steps.join('\n'))}</textarea></label><p class="tiny">Il salvataggio richiede una connessione. Il testo non salvato resta in questa schermata e non viene inviato automaticamente.</p><div class="account-actions"><button class="primary" id="save-draft">Salva bozza</button><button type="button" id="close-editor">Chiudi editor</button></div><p id="draft-message" role="status"></p></form>`;
 el('close-editor').onclick=()=>{if(confirm('Chiudere l’editor? Le modifiche non salvate andranno perse.')){editing=null;el('draft-editor').hidden=true;message('')}};
 el('draft-form').onsubmit=async e=>{
  e.preventDefault();if(saving)return;
  const form=new FormData(e.target),payload={};
  try{
   for(const key of ['title','description','region','category','difficulty'])payload[key]=form.get(key);
   for(const key of ['base_servings','prep_minutes','cook_minutes'])payload[key]=Number(form.get(key));
   payload.ingredients=String(form.get('ingredients')).split('\n').filter(x=>x.trim()).map(line=>{const parts=line.split('|').map(v=>v.trim());if(parts.length<3||parts.length>4)throw new Error('Ingredienti: usa nome | quantità | unità | nota facoltativa.');const [name,quantity,unit,note='']=parts;const amount=quantity?Number(quantity.replace(',','.')):null;if(amount!==null&&!Number.isFinite(amount))throw new Error('Quantità non valida: '+quantity);return {name,quantity:amount,unit,note}});
   payload.steps=String(form.get('steps')).split('\n').filter(x=>x.trim());
   if(editing.id)payload.version=editing.version;
   const actorID=user.id; saving=true;el('save-draft').disabled=true;
   const saved=await request('/api/me/recipes'+(editing.id?'/'+editing.id:''),editing.id?'PUT':'POST',payload);
   if(user?.id!==actorID)return;editing=null;await load(true);if(user?.id!==actorID)return;edit(saved);el('draft-message').textContent='Bozza salvata sul server. Comparirà sugli altri dispositivi al prossimo aggiornamento.';
  }catch(error){if(el('draft-message'))el('draft-message').textContent=error.message}
  finally{saving=false;if(el('save-draft'))el('save-draft').disabled=false}
 };
 el('draft-editor').scrollIntoView({behavior:'smooth',block:'start'});
}
function bindLogout(){el('logout').onclick=async()=>{if(editing&&!confirm('Uscire? Le modifiche non salvate andranno perse.'))return;try{await request('/api/auth/logout','POST');generation++;user=null;csrf=null;bookmarks=[];drafts=[];editing=null;render()}catch(error){message(error.message)}}}
async function load(force=false){
 if(loading&&!force)return;loading=true;const id=++generation;
 try{
  const [config,session]=await Promise.all([request('/api/auth/status'),request('/api/me')]);
  if(id!==generation)return;
  providers=config.providers;authReason=config.reason;
  if(location.protocol!=='https:'&&providers.apple)authReason='Per accedere, apri l’indirizzo HTTPS configurato per CookAmore.';
  const changed=user?.id!==session.user?.id;user=session.user;csrf=session.csrf;if(changed)editing=null;
  if(user){const [saved,privateDrafts]=await Promise.all([request('/api/me/bookmarks'),request('/api/me/recipes')]);if(id!==generation)return;bookmarks=saved;drafts=privateDrafts}else{bookmarks=[];drafts=[]}
  render();
 }catch(error){if(id!==generation)return;message('Aggiornamento non riuscito. '+error.message);if(el('personal-sync'))el('personal-sync').textContent='Server non raggiungibile · ultimo elenco caricato';if(!el('account-body').innerHTML){authReason='Server non disponibile. Riprova quando sarà raggiungibile.';render()}}
 finally{if(id===generation)loading=false}
}
async function saveRecipe(id,saved){
 if(!ready()){show();return}
 try{await request('/api/me/bookmarks/'+encodeURIComponent(id),saved?'PUT':'DELETE');await load(true);message(saved?'Ricetta salvata sul server.':'Ricetta rimossa dai salvati.')}
 catch(error){message(error.message);const button=el('save-recipe');if(button)button.textContent=error.message}
}
function bindRecipe(recipe){
 const button=el('save-recipe');if(!button)return;
 if(recipe)button.dataset.recipeId=recipe.id;
 const id=button.dataset.recipeId;if(!id)return;
 const saved=bookmarks.some(r=>r.id===id);button.textContent=saved?'✓ Salvata · rimuovi':'Salva nel mio ricettario';button.onclick=()=>saveRecipe(id,!saved);
}
window.CookAccount={bindRecipe,show};el('account').onclick=show;el('close-login').onclick=()=>{if(editing&&!confirm('Chiudere? Le modifiche non salvate andranno perse.'))return;editing=null;el('login').close();render()};
el('login').addEventListener('cancel',event=>{if(editing){event.preventDefault();el('close-login').click()}});
load();if(new URLSearchParams(location.search).get('account')==='1')show();
setInterval(()=>{if(!document.hidden)load()},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
})();
