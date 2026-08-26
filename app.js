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
let selectedMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function keyFromSecret(secret){
  const material=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function save(){
  if(!vaultKey)return;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify({transactions,budgets}));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},vaultKey,plain);
  localStorage.setItem('miDineroVault',JSON.stringify({v:1,alg:'A256GCM',iv:toBase64(iv),data:toBase64(new Uint8Array(encrypted))}));
  localStorage.removeItem('miDineroTransactions');localStorage.removeItem('miDineroBudgets');
}
async function unlock(secret){
  if(!secret||secret.length<12)throw new Error('La clave debe tener al menos 12 caracteres');
  const key=await keyFromSecret(secret),vault=localStorage.getItem('miDineroVault');
  if(vault){
    const box=JSON.parse(vault),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(box.iv)},key,fromBase64(box.data));
    const state=JSON.parse(new TextDecoder().decode(plain));transactions=state.transactions||[];budgets={...DEFAULT_BUDGETS,...(state.budgets||{})};
  }else{
    const legacyTx=JSON.parse(localStorage.getItem('miDineroTransactions')||'null'),legacyBudgets=JSON.parse(localStorage.getItem('miDineroBudgets')||'null');
    transactions=legacyTx||[];budgets={...DEFAULT_BUDGETS,...(legacyBudgets||{})};
  }
  vaultKey=key;$('#lockScreen').hidden=true;document.body.classList.remove('locked');render();
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
function render(){populateMonths();renderDashboard();renderAllTransactions();renderBudgets();renderReports();save()}
function switchView(name){$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.remove('active'));$(`#${name}View`).classList.add('active');const titles={dashboard:'Hola, Javier',transactions:'Tus movimientos',budgets:'Presupuestos',reports:'Análisis mensual'};$('#pageTitle').textContent=titles[name];$('#eyebrow').textContent=name==='dashboard'?'MI ECONOMÍA':monthName(selectedMonth).toUpperCase();window.scrollTo({top:0,behavior:'smooth'})}
function openTransaction(type='expense'){$('#transactionType').value=type;$('#modalTitle').textContent=type==='expense'?'Añadir gasto':'Añadir ingreso';$$('.type-switch button').forEach(b=>b.classList.toggle('active',b.dataset.type===type));categoryOptions(type);$('#date').value=new Date().toISOString().slice(0,10);$('#transactionDialog').showModal();setTimeout(()=>$('#amount').focus(),100)}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

$$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-view-link]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.viewLink)));$$('[data-add]').forEach(b=>b.addEventListener('click',()=>openTransaction(b.dataset.add)));
$$('.type-switch button').forEach(b=>b.addEventListener('click',()=>{const type=b.dataset.type;$('#transactionType').value=type;$('#modalTitle').textContent=type==='expense'?'Añadir gasto':'Añadir ingreso';$$('.type-switch button').forEach(x=>x.classList.toggle('active',x===b));categoryOptions(type)}));
$('#monthFilter').addEventListener('change',e=>{selectedMonth=e.target.value;render();const current=$('.view.active').id.replace('View','');switchView(current)});$('#searchInput').addEventListener('input',renderAllTransactions);$('#typeFilter').addEventListener('change',renderAllTransactions);
$('#transactionForm').addEventListener('submit',e=>{e.preventDefault();const amount=parseFloat($('#amount').value.replace(',','.')),movementDate=$('#date').value;if(!amount||amount<=0){toast('Introduce un importe válido');return}transactions.push({id:crypto.randomUUID(),type:$('#transactionType').value,amount,concept:$('#concept').value.trim(),date:movementDate,category:$('#category').value,account:$('#account').value,nature:$('#nature').value,note:$('#note').value.trim()});e.target.reset();$('#transactionDialog').close();selectedMonth=movementDate.slice(0,7)||selectedMonth;render();toast('Movimiento guardado')});
document.addEventListener('click',e=>{const id=e.target.dataset.delete;if(id&&confirm('¿Eliminar este movimiento?')){transactions=transactions.filter(t=>t.id!==id);render();toast('Movimiento eliminado')}});
$('#editBudgets').addEventListener('click',()=>{$('#budgetFields').innerHTML=EXPENSE_CATEGORIES.map(c=>`<label><span>${CATEGORIES[c].icon} ${c}</span><input name="${c}" type="number" min="0" step="10" value="${budgets[c]||0}"></label>`).join('');$('#budgetDialog').showModal()});
$('#budgetForm').addEventListener('submit',e=>{e.preventDefault();EXPENSE_CATEGORIES.forEach(c=>budgets[c]=Number(e.target.elements[c].value)||0);$('#budgetDialog').close();render();toast('Presupuestos actualizados')});
$('#exportBtn').addEventListener('click',()=>{const header=['fecha','tipo','concepto','categoria','naturaleza','cuenta','importe','nota'],rows=transactions.map(t=>[t.date,t.type,t.concept,t.category,t.nature,t.account,t.amount,t.note].map(v=>`"${String(v).replaceAll('"','""')}"`).join(';'));const blob=new Blob(['\ufeff'+[header.join(';'),...rows].join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mi-dinero-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)});
$('#unlockForm').addEventListener('submit',async e=>{e.preventDefault();const secret=$('#unlockKey').value.trim();try{location.hash=encodeURIComponent(secret);await unlock(secret)}catch(err){alert(err.name==='OperationError'?'Clave incorrecta para los datos guardados.':err.message)}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
categoryOptions('expense');
const initialSecret=decodeURIComponent(location.hash.slice(1));
if(initialSecret){unlock(initialSecret).catch(()=>{$('#lockScreen').hidden=false;document.body.classList.add('locked')})}else{$('#lockScreen').hidden=false;document.body.classList.add('locked')}
