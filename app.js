const CATEGORIES = {
  Vivienda:{icon:'⌂',color:'#7c71d8'}, Alimentación:{icon:'◉',color:'#ef735d'}, Transporte:{icon:'◆',color:'#5d9bd4'}, Ocio:{icon:'✦',color:'#e6ac3b'}, Salud:{icon:'＋',color:'#4fa58a'}, Compras:{icon:'◇',color:'#d17b9f'}, Suscripciones:{icon:'↻',color:'#74877e'}, Viajes:{icon:'✈',color:'#52aab0'}, Otros:{icon:'•••',color:'#9aa59f'}, Nómina:{icon:'€',color:'#1c6b4e'}, Inversión:{icon:'↗',color:'#466b5f'}
};
const EXPENSE_CATEGORIES = ['Vivienda','Alimentación','Transporte','Ocio','Salud','Compras','Suscripciones','Viajes','Otros'];
const INCOME_CATEGORIES = ['Nómina','Inversión','Otros'];
const DEFAULT_BUDGETS = {Vivienda:650,Alimentación:280,Transporte:100,Ocio:220,Salud:80,Compras:180,Suscripciones:50,Viajes:250,Otros:100};
const euro = new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'});
const shortEuro = n => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const today = new Date();
let transactions = [];
let budgets = {...DEFAULT_BUDGETS};
let vaultKey = null;
const SUPABASE_URL = 'https://jwwaepweihddrtxnksuj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5Dt8VoAePD4Y-xMQwDmU3A_S7r6It8Z';
const SESSION_STORAGE_KEY = 'miDineroAuthSession';
let authSession = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
let saveQueue = Promise.resolve();
let selectedMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const setLockStatus = message => { $('#lockStatus').textContent = message || ''; };
const setSyncStatus = (title,detail) => { $('#syncTitle').textContent=title; $('#syncDetail').textContent=detail; };
function storeSession(data){
  authSession={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600)};
  localStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify(authSession));
}
async function authRequest(path,body){
  const response=await fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.msg||data.message||data.error_description||'No se pudo verificar el acceso');
  return data;
}
async function ensureSession(){
  if(!authSession?.access_token)return false;
  if((authSession.expires_at||0)>Math.floor(Date.now()/1000)+60)return true;
  if(!authSession.refresh_token){authSession=null;localStorage.removeItem(SESSION_STORAGE_KEY);return false}
  try{storeSession(await authRequest('token?grant_type=refresh_token',{refresh_token:authSession.refresh_token}));return true}catch{authSession=null;localStorage.removeItem(SESSION_STORAGE_KEY);return false}
}
async function apiFetch(path,options={}){
  if(!await ensureSession())throw new Error('La sesión ha caducado. Solicita un nuevo código.');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${authSession.access_token}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'No se pudo sincronizar')}
  return response;
}
async function keyFromSecret(secret){
  const material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptedState(){
  if(!vaultKey)return;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify({transactions,budgets}));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},vaultKey,plain);
  return {v:1,alg:'A256GCM',iv:toBase64(iv),data:toBase64(new Uint8Array(encrypted))};
}
async function decryptState(box,key){
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(box.iv)},key,fromBase64(box.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function save(){
  if(!vaultKey)return;
  const box=await encryptedState();
  localStorage.setItem('miDineroVault',JSON.stringify(box));
  localStorage.removeItem('miDineroTransactions');localStorage.removeItem('miDineroBudgets');
  if(authSession){
    setSyncStatus('Sincronizando…','Cifrado de extremo a extremo');
    await apiFetch('private_vaults?on_conflict=user_id,app_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{user_id:authSession.user.id,app_id:'mi-dinero',payload:box,revision:Date.now(),updated_at:new Date().toISOString()}])});
    setSyncStatus('Sincronización activa','Ordenador y móvil');
  }
}
function persist(){
  saveQueue=saveQueue.then(()=>save()).catch(err=>{setSyncStatus('Pendiente de sincronizar',err.message);toast('Guardado en este dispositivo; se sincronizará al recuperar conexión')});
}
async function unlock(secret){
  if(!await ensureSession())throw new Error('Primero verifica tu correo');
  if(!secret||secret.length<12)throw new Error('La clave debe tener al menos 12 caracteres');
  const key=await keyFromSecret(secret),vault=localStorage.getItem('miDineroVault');
  let localState=null;
  if(vault){
    localState=await decryptState(JSON.parse(vault),key);
  }else{
    const legacyTx=JSON.parse(localStorage.getItem('miDineroTransactions')||'null'),legacyBudgets=JSON.parse(localStorage.getItem('miDineroBudgets')||'null');
    if(legacyTx||legacyBudgets)localState={transactions:legacyTx||[],budgets:legacyBudgets||{}};
  }
  let remoteState=null,remoteFound=false;
  try{
    const response=await apiFetch('private_vaults?app_id=eq.mi-dinero&select=payload,updated_at&limit=1');
    const rows=await response.json();
    if(rows[0]){remoteFound=true;remoteState=await decryptState(rows[0].payload,key)}
  }catch(err){if(!localState)throw err}
  const state=remoteState||localState||{transactions:[],budgets:{}};
  transactions=state.transactions||[];budgets={...DEFAULT_BUDGETS,...(state.budgets||{})};vaultKey=key;
  history.replaceState(null,'',location.pathname+location.search);
  $('#lockScreen').hidden=true;document.body.classList.remove('locked');setSyncStatus('Sincronización activa','Ordenador y móvil');render();
  if(!remoteFound)await save();
}
const monthName = key => {const [y,m]=key.split('-');return new Date(+y,+m-1,1).toLocaleDateString('es-ES',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const monthTx = (key=selectedMonth) => transactions.filter(t=>t.date.startsWith(key));
const sum = (arr,type) => arr.filter(t=>!type||t.type===type).reduce((a,t)=>a+Number(t.amount),0);

function populateMonths(){
  const select=$('#monthFilter'), keys=new Set(transactions.map(t=>t.date.slice(0,7)));
  for(let i=0;i<12;i++){const d=new Date(today.getFullYear(),today.getMonth()-i,1);keys.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
  select.innerHTML=[...keys].sort().reverse().map(k=>`<option value="${k}" ${k===selectedMonth?'selected':''}>${monthName(k)}</option>`).join('');
}
function categoryOptions(type){const list=type==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES;$('#category').innerHTML=list.map(c=>`<option>${c}</option>`).join('')}
function previousMonth(key){const [y,m]=key.split('-').map(Number),d=new Date(y,m-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function renderDashboard(){
  const tx=monthTx(),income=sum(tx,'income'),expense=sum(tx,'expense'),balance=income-expense,rate=income?balance/income*100:0;
  $('#monthBalance').textContent=euro.format(balance);$('#totalIncome').textContent=euro.format(income);$('#totalExpense').textContent=euro.format(expense);$('#savingsRate').textContent=`${Math.round(rate)}%`;
  const prev=sum(monthTx(previousMonth(selectedMonth)),'expense'),delta=prev?((expense-prev)/prev*100):0;
  $('#balanceTrend').textContent=prev?`${delta<=0?'↓':'↑'} ${Math.abs(delta).toFixed(0)}% gasto vs. mes anterior`:'Primer mes';
  renderMonthlyChart();renderCategories(tx);renderTransactions($('#recentTransactions'),tx.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5));
}
function renderMonthlyChart(){
  const keys=[];let [y,m]=selectedMonth.split('-').map(Number);for(let i=5;i>=0;i--){const d=new Date(y,m-1-i,1);keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}
  const vals=keys.map(k=>({income:sum(monthTx(k),'income'),expense:sum(monthTx(k),'expense')})),max=Math.max(1,...vals.flatMap(v=>[v.income,v.expense]));
  $('#monthlyChart').innerHTML=vals.map((v,i)=>`<div class="bar-group" title="Ingresos: ${euro.format(v.income)} · Gastos: ${euro.format(v.expense)}"><div class="bar income" style="height:${v.income/max*100}%"></div><div class="bar expense" style="height:${v.expense/max*100}%"></div><label>${monthName(keys[i]).slice(0,3)}</label></div>`).join('');
}
function breakdown(tx,field='category'){const map={};tx.filter(t=>t.type==='expense').forEach(t=>map[t[field]]=(map[t[field]]||0)+Number(t.amount));return Object.entries(map).sort((a,b)=>b[1]-a[1])}
function renderCategories(tx){
  const data=breakdown(tx).slice(0,5),total=sum(tx,'expense');let start=0;const stops=[];
  data.forEach(([c,v])=>{const end=start+(total?v/total*100:0);stops.push(`${CATEGORIES[c]?.color||'#999'} ${start}% ${end}%`);start=end});
  $('#categoryDonut').style.background=stops.length?`conic-gradient(${stops.join(',')})`:`conic-gradient(var(--line) 0 100%)`;$('#donutTotal').textContent=shortEuro(total);
  $('#categoryList').innerHTML=data.length?data.map(([c,v])=>`<div class="category-item"><i style="background:${CATEGORIES[c]?.color}"></i><span>${c}</span><strong>${shortEuro(v)}</strong></div>`).join(''):'<div class="empty-state">Sin gastos este mes</div>';
}
function rowHtml(t){const c=CATEGORIES[t.category]||CATEGORIES.Otros;return `<div class="transaction-row"><span class="category-icon" style="background:${c.color}1f;color:${c.color}">${c.icon}</span><div class="transaction-main"><strong>${escapeHtml(t.concept)}</strong><span>${t.category}</span></div><div class="transaction-meta"><strong>${t.account}</strong><span>Cuenta</span></div><div class="transaction-meta"><strong>${new Date(t.date+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'})}</strong><span>${t.nature==='fixed'?'Fijo':'Variable'}</span></div><strong class="transaction-amount ${t.type}">${t.type==='expense'?'−':'+'}${euro.format(t.amount)}</strong><button class="delete-btn" data-delete="${t.id}" aria-label="Eliminar">×</button></div>`}
function renderTransactions(container,list){container.innerHTML=list.length?list.map(rowHtml).join(''):'<div class="empty-state">Todavía no hay movimientos en este periodo.</div>'}
function renderAllTransactions(){const q=$('#searchInput').value.toLowerCase(),type=$('#typeFilter').value;let tx=monthTx().filter(t=>(type==='all'||t.type===type)&&[t.concept,t.category,t.account].some(v=>v.toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date));renderTransactions($('#allTransactions'),tx)}
function renderBudgets(){const spent=Object.fromEntries(breakdown(monthTx()));$('#budgetGrid').innerHTML=EXPENSE_CATEGORIES.map(c=>{const used=spent[c]||0,limit=budgets[c]||0,pct=limit?used/limit*100:0,color=pct>100?'#ef735d':pct>80?'#e6ac3b':CATEGORIES[c].color;return `<article class="budget-card"><div class="budget-card-top"><div><span class="category-icon" style="background:${CATEGORIES[c].color}1f;color:${CATEGORIES[c].color}">${CATEGORIES[c].icon}</span><h3>${c}</h3></div><strong>${Math.round(pct)}%</strong></div><p>${shortEuro(used)} de ${shortEuro(limit)}</p><div class="budget-progress"><div style="width:${Math.min(pct,100)}%;background:${color}"></div></div><footer><span>Disponible</span><strong>${shortEuro(Math.max(limit-used,0))}</strong></footer></article>`}).join('')}
function renderReports(){
  const tx=monthTx(),expenses=tx.filter(t=>t.type==='expense'),total=sum(tx,'expense'),income=sum(tx,'income'),fixed=sum(expenses.filter(t=>t.nature==='fixed')),variable=total-fixed,avg=expenses.length?total/expenses.length:0,largest=[...expenses].sort((a,b)=>b.amount-a.amount)[0];
  $('#reportKpis').innerHTML=[['Gasto total',euro.format(total)],['Gasto medio',euro.format(avg)],['Nº de gastos',expenses.length],['Mayor gasto',largest?euro.format(largest.amount):'—']].map(([a,b])=>`<div class="report-kpi"><span>${a}</span><strong>${b}</strong></div>`).join('');
  $('#natureAnalysis').innerHTML=`<div class="nature-chart"><div class="nature-block fixed"><span>Gasto fijo · ${total?Math.round(fixed/total*100):0}%</span><strong>${shortEuro(fixed)}</strong></div><div class="nature-block variable"><span>Gasto variable · ${total?Math.round(variable/total*100):0}%</span><strong>${shortEuro(variable)}</strong></div></div>`;
  const accounts=breakdown(tx,'account'),max=Math.max(1,...accounts.map(x=>x[1]));$('#accountAnalysis').innerHTML=accounts.length?accounts.map(([a,v])=>`<div class="analysis-row"><span>${a}</span><div class="analysis-track"><i style="width:${v/max*100}%"></i></div><strong>${shortEuro(v)}</strong></div>`).join(''):'<div class="empty-state">Sin datos</div>';
  const top=breakdown(tx)[0];if(top){$('#insightTitle').textContent=`${top[0]} concentra tu mayor gasto`;
    const pct=Math.round(top[1]/total*100),saving=income-total;$('#insightText').textContent=`Representa el ${pct}% de tus gastos de ${monthName(selectedMonth).toLowerCase()}. ${saving>=0?`Has ahorrado ${euro.format(saving)}, un ${income?Math.round(saving/income*100):0}% de tus ingresos.`:`Tus gastos superan tus ingresos en ${euro.format(Math.abs(saving))}.`}`}
}
function render(){populateMonths();renderDashboard();renderAllTransactions();renderBudgets();renderReports()}
function switchView(name){$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.remove('active'));$(`#${name}View`).classList.add('active');const titles={dashboard:'Mi resumen',transactions:'Tus movimientos',budgets:'Presupuestos',reports:'Análisis mensual'};$('#pageTitle').textContent=titles[name];$('#eyebrow').textContent=name==='dashboard'?'MI ECONOMÍA':monthName(selectedMonth).toUpperCase();window.scrollTo({top:0,behavior:'smooth'})}
function openTransaction(type='expense'){$('#transactionType').value=type;$('#modalTitle').textContent=type==='expense'?'Añadir gasto':'Añadir ingreso';$$('.type-switch button').forEach(b=>b.classList.toggle('active',b.dataset.type===type));categoryOptions(type);$('#date').value=new Date().toISOString().slice(0,10);$('#transactionDialog').showModal();setTimeout(()=>$('#amount').focus(),100)}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

let smartImageFile=null;
let receiptPreviewUrl='';
function setRecognitionProgress(progress,status){
  $('#recognitionProgress').hidden=false;
  $('#recognitionBar').style.width=`${Math.max(4,Math.round(progress*100))}%`;
  $('#recognitionStatus').textContent=status;
}
function clearReceiptPreview(){
  if(receiptPreviewUrl)URL.revokeObjectURL(receiptPreviewUrl);
  receiptPreviewUrl='';smartImageFile=null;$('#receiptImage').value='';$('#receiptPreview').hidden=true;$('#receiptPreview').removeAttribute('src');$('#receiptFileName').textContent='Elegir captura o hacer foto';
}
function setSmartImage(file){
  if(!file?.type?.startsWith('image/')){toast('Selecciona una imagen válida');return}
  clearReceiptPreview();smartImageFile=file;receiptPreviewUrl=URL.createObjectURL(file);$('#receiptPreview').src=receiptPreviewUrl;$('#receiptPreview').hidden=false;$('#receiptFileName').textContent=file.name||'Captura pegada';$('#smartError').textContent='';
}
function resetSmartImport(){
  $('#smartImportForm').reset();$('#smartError').textContent='';$('#recognitionProgress').hidden=true;$('#recognitionBar').style.width='4%';clearReceiptPreview();
}
function openSmartImport(){resetSmartImport();$('#smartImportDialog').showModal();setTimeout(()=>$('#smartText').focus(),100)}
function prefillRecognizedMovement(result){
  $('#smartImportDialog').close();openTransaction(result.type);
  $('#amount').value=result.amount?String(result.amount).replace('.',','):'';$('#concept').value=result.concept||'';$('#date').value=result.date;categoryOptions(result.type);
  if([...$('#category').options].some(option=>option.value===result.category))$('#category').value=result.category;
  $('#account').value=result.account;$('#nature').value=result.nature;$('#note').value=`${result.note} · confianza ${result.confidence}%`;
  toast('Campos reconocidos: revísalos antes de guardar');
}
async function imageForOcr(file){
  const bitmap=await createImageBitmap(file),maxSide=1800,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas;
}
async function recognizeSmartInput(){
  let text=$('#smartText').value.trim();
  if(smartImageFile){
    if(!window.Tesseract)throw new Error('El lector de capturas no ha terminado de cargar. Comprueba la conexión y vuelve a intentarlo.');
    setRecognitionProgress(.03,'Preparando la imagen en tu dispositivo…');
    const image=await imageForOcr(smartImageFile),result=await window.Tesseract.recognize(image,'spa+eng',{logger:message=>{
      if(message.status==='recognizing text')setRecognitionProgress(message.progress,`Leyendo la captura… ${Math.round(message.progress*100)}%`);
      else if(message.status)setRecognitionProgress(Math.min(message.progress||.08,.2),'Preparando el reconocimiento privado…');
    }});
    text=[text,result.data.text].filter(Boolean).join('\n');
  }
  if(!text)throw new Error('Escribe el movimiento o selecciona una captura.');
  setRecognitionProgress(1,'Movimiento reconocido. Preparando la revisión…');
  const parsed=window.MiDineroParser.parseMovementText(text);
  if(!parsed.amount)throw new Error('No he encontrado un importe claro. Escríbelo junto al texto y vuelve a intentarlo.');
  return parsed;
}

$$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-view-link]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.viewLink)));$$('[data-add]').forEach(b=>b.addEventListener('click',()=>openTransaction(b.dataset.add)));$$('[data-smart-import]').forEach(b=>b.addEventListener('click',openSmartImport));
$$('.type-switch button').forEach(b=>b.addEventListener('click',()=>{const type=b.dataset.type;$('#transactionType').value=type;$('#modalTitle').textContent=type==='expense'?'Añadir gasto':'Añadir ingreso';$$('.type-switch button').forEach(x=>x.classList.toggle('active',x===b));categoryOptions(type)}));
$('#monthFilter').addEventListener('change',e=>{selectedMonth=e.target.value;render();const current=$('.view.active').id.replace('View','');switchView(current)});$('#searchInput').addEventListener('input',renderAllTransactions);$('#typeFilter').addEventListener('change',renderAllTransactions);
$('#transactionForm').addEventListener('submit',e=>{e.preventDefault();const amount=parseFloat($('#amount').value.replace(',','.')),movementDate=$('#date').value;if(!amount||amount<=0){toast('Introduce un importe válido');return}transactions.push({id:crypto.randomUUID(),type:$('#transactionType').value,amount,concept:$('#concept').value.trim(),date:movementDate,category:$('#category').value,account:$('#account').value,nature:$('#nature').value,note:$('#note').value.trim()});e.target.reset();$('#transactionDialog').close();selectedMonth=movementDate.slice(0,7)||selectedMonth;render();persist();toast('Movimiento guardado y sincronizado')});
document.addEventListener('click',e=>{const id=e.target.dataset.delete;if(id&&confirm('¿Eliminar este movimiento?')){transactions=transactions.filter(t=>t.id!==id);render();persist();toast('Movimiento eliminado')}});
$('#editBudgets').addEventListener('click',()=>{$('#budgetFields').innerHTML=EXPENSE_CATEGORIES.map(c=>`<label><span>${CATEGORIES[c].icon} ${c}</span><input name="${c}" type="number" min="0" step="10" value="${budgets[c]||0}"></label>`).join('');$('#budgetDialog').showModal()});
$('#budgetForm').addEventListener('submit',e=>{e.preventDefault();EXPENSE_CATEGORIES.forEach(c=>budgets[c]=Number(e.target.elements[c].value)||0);$('#budgetDialog').close();render();persist();toast('Presupuestos actualizados')});
$('#receiptImage').addEventListener('change',e=>setSmartImage(e.target.files[0]));
$('#receiptDropZone').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('dragging')});$('#receiptDropZone').addEventListener('dragleave',e=>e.currentTarget.classList.remove('dragging'));$('#receiptDropZone').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');setSmartImage([...e.dataTransfer.files].find(file=>file.type.startsWith('image/')))});
$('#smartImportDialog').addEventListener('paste',e=>{const file=[...e.clipboardData.items].find(item=>item.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();setSmartImage(file)}});
$('#smartImportDialog').addEventListener('close',()=>{if(!$('#transactionDialog').open)resetSmartImport()});
$('#smartImportForm').addEventListener('submit',async e=>{const button=e.submitter;if(!button||button.value==='cancel')return;e.preventDefault();button.disabled=true;$('#smartError').textContent='';try{prefillRecognizedMovement(await recognizeSmartInput())}catch(err){$('#smartError').textContent=err.message;$('#recognitionProgress').hidden=true}finally{button.disabled=false}});
$('#exportBtn').addEventListener('click',()=>{const header=['fecha','tipo','concepto','categoria','naturaleza','cuenta','importe','nota'],rows=transactions.map(t=>[t.date,t.type,t.concept,t.category,t.nature,t.account,t.amount,t.note].map(v=>`"${String(v).replaceAll('"','""')}"`).join(';'));const blob=new Blob(['\ufeff'+[header.join(';'),...rows].join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mi-dinero-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)});
$('#authForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter,email=$('#authEmail').value.trim().toLowerCase();button.disabled=true;setLockStatus('Enviando enlace privado…');try{await authRequest('otp',{email,create_user:true,email_redirect_to:location.origin+location.pathname});setLockStatus('Si el correo está autorizado, recibirás un enlace de acceso.')}catch(err){setLockStatus(err.message)}finally{button.disabled=false}});
$('#unlockForm').addEventListener('submit',async e=>{e.preventDefault();const secret=$('#unlockKey').value.trim();setLockStatus('Descargando y descifrando…');try{await unlock(secret)}catch(err){setLockStatus(err.name==='OperationError'?'Clave privada incorrecta.':err.message)}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
categoryOptions('expense');
const rawFragment=location.hash.slice(1);
const pendingSecret=rawFragment&&!rawFragment.includes('access_token=')&&!rawFragment.includes('error=')?decodeURIComponent(rawFragment):'';
function captureAuthCallback(){
  const params=new URLSearchParams(rawFragment);
  if(!params.get('access_token'))return false;
  const jwtPart=params.get('access_token').split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const claims=JSON.parse(decodeURIComponent(escape(atob(jwtPart.padEnd(Math.ceil(jwtPart.length/4)*4,'=')))));
  storeSession({access_token:params.get('access_token'),refresh_token:params.get('refresh_token'),expires_at:Number(params.get('expires_at'))||undefined,expires_in:Number(params.get('expires_in'))||3600,user:{id:claims.sub,email:claims.email}});
  history.replaceState(null,'',location.pathname+location.search);return true;
}
async function boot(){
  $('#lockScreen').hidden=false;document.body.classList.add('locked');
  captureAuthCallback();
  if(await ensureSession()){
    $('#authStep').hidden=true;$('#unlockForm').hidden=false;
    if(pendingSecret){setLockStatus('Acceso verificado. Descifrando y sincronizando…');try{await unlock(pendingSecret)}catch(err){setLockStatus(err.name==='OperationError'?'La clave privada no coincide con los datos cifrados.':err.message)}}
    else setLockStatus('Introduce tu clave privada para descifrar los datos.');
  }else{
    $('#authStep').hidden=false;$('#unlockForm').hidden=true;setLockStatus('Solicita un código para verificar tu identidad.');
  }
}
boot();
