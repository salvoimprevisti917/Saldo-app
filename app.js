const KEY='saldo_v01_transactions';
const SETTINGS='saldo_v01_settings';
const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const monthName=m=>new Date(m+'-01T12:00:00').toLocaleDateString('it-IT',{month:'long',year:'numeric'});
let tx=JSON.parse(localStorage.getItem(KEY)||'[]');
let settings=JSON.parse(localStorage.getItem(SETTINGS)||'{}');
let view='home';

function migrateSettings(){
  settings={
    monthlyBudget:0,
    goals:[],
    currentBalance:null,
    balanceUpdatedAt:null,
    creditCardOutstanding:null,
    recurring:[
      {id:'home_shared',name:'Conto casa condiviso',amount:500,day:1,type:'expense',enabled:true,kind:'home'},
      {id:'loan',name:'Finanziamento',amount:330.36,day:20,type:'expense',enabled:true,kind:'debt'}
    ],
    budgetLimits:{},
    ...settings
  };
  if(!Array.isArray(settings.recurring)) settings.recurring=[];
  if(!settings.recurring.some(x=>x.id==='home_shared')) settings.recurring.unshift({id:'home_shared',name:'Conto casa condiviso',amount:500,day:1,type:'expense',enabled:true,kind:'home'});
  if(!settings.recurring.some(x=>x.id==='loan')) settings.recurring.push({id:'loan',name:'Finanziamento',amount:330.36,day:20,type:'expense',enabled:true,kind:'debt'});
  settings.budgetLimits=settings.budgetLimits||{};
}
migrateSettings();
function save(){localStorage.setItem(KEY,JSON.stringify(tx));localStorage.setItem(SETTINGS,JSON.stringify(settings))}
save();

function latestMonth(){if(!tx.length)return new Date().toISOString().slice(0,7);return tx.map(x=>x.date.slice(0,7)).sort().at(-1)}
function monthData(m=latestMonth()){return tx.filter(x=>x.date.startsWith(m))}
function isCardStatement(x){return /saldo e\/c carta di credito/i.test((x.description||'')+' '+(x.details||''))}
function isRevolutTopup(x){return /revolut/i.test(x.description||'')}
function isHomeTransfer(x){let s=((x.description||'')+' '+(x.details||'')).toLowerCase();return x.amount<0 && (s.includes('bonifico')||s.includes('giroconto')) && Math.abs(x.amount)>=400}
function classification(x){
  if(isCardStatement(x)) return 'card_statement';
  if(isRevolutTopup(x)) return 'wallet_transfer';
  if(isHomeTransfer(x)) return 'home';
  return x.amount>=0?'income':'expense';
}
function totals(arr){
  let income=0,expense=0,transfers=0,cardStatements=0;
  arr.forEach(x=>{
    const c=classification(x);
    if(c==='income') income+=x.amount;
    else if(c==='expense'||c==='home') expense+=-x.amount;
    else if(c==='wallet_transfer') transfers+=-x.amount;
    else if(c==='card_statement') cardStatements+=-x.amount;
  });
  return{income,expense,transfers,cardStatements,net:income-expense};
}
function icon(cat){return ({'Alimentari':'🛒','Ristoranti e bar':'☕','Trasporti':'🚆','Abbonamenti':'▣','Entrate':'↗','Salute':'✚','Commissioni':'€','Casa':'⌂','Rate e debiti':'▤','Svago':'◈'}[cat]||'•')}
function daysInMonth(m){let [y,mo]=m.split('-').map(Number);return new Date(y,mo,0).getDate()}
function monthContext(){
  const m=latestMonth(), today=new Date(), current=today.toISOString().slice(0,7)===m;
  const day=current?today.getDate():daysInMonth(m);
  return {m,day,current};
}
function futureRecurring(m,day){
  return settings.recurring.filter(r=>r.enabled!==false && r.type==='expense' && Number(r.day)>day).reduce((s,r)=>s+Number(r.amount||0),0);
}
function obligationsBreakdown(m,day){
  return settings.recurring.filter(r=>r.enabled!==false && r.type==='expense' && Number(r.day)>day);
}
function rowHTML(x){
  const cls=classification(x);
  const tag=cls==='wallet_transfer'?' · trasferimento':cls==='card_statement'?' · carta credito':'';
  return `<div class=row><div class=badge>${icon(x.category)}</div><div class=grow><strong>${esc(x.description)}</strong><small>${x.date.split('-').reverse().join('/')} · ${esc(x.category)}${tag}</small></div><div class="amt ${x.amount>=0?'positive':''}">${money(x.amount)}</div></div>`
}
function home(){
  const {m,day}=monthContext(), a=monthData(m), t=totals(a), upcoming=futureRecurring(m,day);
  const card=Number(settings.creditCardOutstanding||0);
  const balance=settings.currentBalance===null||settings.currentBalance===''?null:Number(settings.currentBalance);
  const available=balance===null?null:balance-upcoming-card;
  const recent=a.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const ob=obligationsBreakdown(m,day);
  return `<div class=hero>
    <div class=heroTop><div><div class=eyebrow>DISPONIBILITÀ REALE</div><div class="big ${available!==null&&available<0?'negative':''}">${available===null?'—':money(available)}</div></div><button class=miniBtn onclick="openFinanceSetup()">Configura</button></div>
    <div class=sub>${balance===null?'Inserisci il saldo attuale per attivare la previsione':`Saldo oggi ${money(balance)} · impegni futuri ${money(upcoming+card)}`}</div>
    ${balance!==null?`<div class=availabilityLine><span>Saldo attuale <b>${money(balance)}</b></span><span>Da pagare <b>${money(upcoming+card)}</b></span></div>`:''}
  </div>
  <div class=grid>
    <div class=card><span class=eyebrow>ENTRATE ${esc(monthName(m).split(' ')[0].toUpperCase())}</span><b class=positive>${money(t.income)}</b></div>
    <div class=card><span class=eyebrow>USCITE REALI</span><b>${money(t.expense)}</b></div>
    <div class=card><span class=eyebrow>RISULTATO MESE</span><b class="${t.net>=0?'positive':'negative'}">${money(t.net)}</b></div>
    <div class=card><span class=eyebrow>DA PAGARE</span><b>${money(upcoming+card)}</b></div>
  </div>
  ${ob.length||card?`<div class=section-title><h2>Fino a fine mese</h2><small>previsto</small></div>
  <div class=forecast>${ob.map(r=>`<div><span>${esc(r.name)} <small>giorno ${r.day}</small></span><b>− ${money(r.amount)}</b></div>`).join('')}${card?`<div><span>Carta di credito <small>prossimo addebito</small></span><b>− ${money(card)}</b></div>`:''}</div>`:''}
  <div class=section-title><h2>Ultimi movimenti</h2><small>${esc(monthName(m).split(' ')[0])}</small></div>
  ${recent.length?recent.map(rowHTML).join(''):'<div class=emptySmall>Nessun movimento nel mese.</div>'}
  <div class=notice>I trasferimenti Revolut sono trattati come spostamenti di denaro. Il versamento al conto casa resta invece un impegno del tuo budget personale.</div>`
}
function movements(){
  let arr=tx.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,150);
  return `<div class=section-title><h2>Movimenti</h2><small>${tx.length} totali</small></div><div class=filter><button class="chip on">Tutti</button><button class=chip>Entrate</button><button class=chip>Uscite</button></div>${arr.map(rowHTML).join('')}`
}
function categorySpend(m){
  let cats={};
  monthData(m).filter(x=>x.amount<0 && ['expense','home'].includes(classification(x))).forEach(x=>{
    let c=classification(x)==='home'?'Casa – conto comune':(x.category||'Altro');
    cats[c]=(cats[c]||0)-x.amount;
  });
  return cats;
}
function historicalAverage(cat,m){
  const months=[...new Set(tx.map(x=>x.date.slice(0,7)))].filter(x=>x<m).sort().slice(-6);
  if(!months.length)return 0;
  let vals=months.map(mm=>categorySpend(mm)[cat]||0);
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}
function budget(){
  const {m}=monthContext(), t=totals(monthData(m)), cats=categorySpend(m);
  const fixed=settings.recurring.filter(r=>r.enabled!==false&&r.type==='expense').reduce((s,r)=>s+Number(r.amount||0),0);
  const card=Number(settings.creditCardOutstanding||0);
  const income=t.income;
  const discretionary=Math.max(0,t.expense-(cats['Casa – conto comune']||0)-(cats['Rate e debiti']||0));
  const free=Math.max(0,income-fixed-card);
  const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8);
  return `<div class=section-title><h2>Budget</h2><small>${esc(monthName(m))}</small></div>
  <div class=budgetHero>
    <div class=eyebrow>PIANO DI RISANAMENTO</div>
    <div class=budgetHeadline>${money(free)}</div>
    <div class=sub>margine teorico dopo impegni fissi${card?' e carta':''}</div>
    <div class=budgetEquation><span>Entrate <b>${money(income)}</b></span><span>Impegni <b>−${money(fixed+card)}</b></span></div>
  </div>
  <div class=section-title><h2>Impegni strutturali</h2><button class=textBtn onclick="openFinanceSetup()">Modifica</button></div>
  <div class=commitGrid>
    <div class="commit home"><span>⌂</span><small>CONTO CASA</small><b>${money(settings.recurring.find(x=>x.id==='home_shared')?.amount||0)}</b><em>mensili</em></div>
    <div class="commit debt"><span>▤</span><small>FINANZIAMENTO</small><b>${money(settings.recurring.find(x=>x.id==='loan')?.amount||0)}</b><em>mensili</em></div>
    <div class="commit credit"><span>▱</span><small>CARTA DI CREDITO</small><b>${settings.creditCardOutstanding===null?'da indicare':money(card)}</b><em>${settings.creditCardOutstanding===null?'configura addebito':'prossimo addebito'}</em></div>
  </div>
  <div class=creditMission>
    <div><div class=eyebrow>OBIETTIVO PRIORITARIO</div><h3>Uscita dalla carta di credito</h3><p>L'addebito della carta viene separato dalle spese correnti: così SALDO mostra quanta parte del prossimo reddito è già impegnata.</p></div>
    <div class=missionBadge>${settings.creditCardOutstanding===null?'—':money(card)}</div>
  </div>
  <div class=section-title><h2>Spese del mese</h2><small>${money(discretionary)} variabili</small></div>
  ${entries.map(([k,v])=>{let avg=historicalAverage(k,m),limit=Number(settings.budgetLimits[k]||0),base=limit||Math.max(v,avg,1),pct=Math.min(100,v/base*100);return `<div class=budgetCat><div class=catTop><span>${esc(k)}</span><b>${money(v)}</b></div><div class=bar><i style="width:${pct}%"></i></div><div class=catMeta>${limit?`Budget ${money(limit)} · residuo ${money(Math.max(0,limit-v))}`:avg?`Media storica ${money(avg)}`:'In osservazione'}</div></div>`}).join('')||'<div class=emptySmall>Nessuna spesa nel mese.</div>'}
  <div class=notice>Prima di fissare limiti definitivi alle categorie, SALDO sta separando casa, finanziamento, carta e trasferimenti. I limiti verranno costruiti sui tuoi consumi reali, non su percentuali generiche.</div>`
}
function goals(){return `<div class=section-title><h2>Obiettivi</h2></div><div class=empty>◎<br><br>Qui costruiremo fondo di emergenza, risparmi e obiettivi personali.<br>Non imposto cifre senza averle definite con te.</div>`}
function analysis(){
  let months={};tx.forEach(x=>{let m=x.date.slice(0,7);(months[m]??=[]).push(x)});
  return `<div class=section-title><h2>Analisi 2026</h2><small>storico</small></div>${Object.keys(months).sort().map(m=>{let t=totals(months[m]);return `<div class=card style="margin-bottom:9px"><span>${monthName(m)}</span><b class=${t.net>=0?'positive':'negative'}>${money(t.net)}</b><small class=sub>Entrate ${money(t.income)} · Uscite reali ${money(t.expense)}</small></div>`}).join('')}`
}
function render(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.querySelector('#view').innerHTML=({home,movements,budget,goals,analysis}[view])()}
window.openFinanceSetup=()=>{
  let d=document.querySelector('#modal');
  const home=settings.recurring.find(x=>x.id==='home_shared')||{};
  const loan=settings.recurring.find(x=>x.id==='loan')||{};
  d.innerHTML=`<form method=dialog id=financeForm><h2>Impegni e disponibilità</h2>
  <label>Saldo disponibile oggi<input id=currentBalance type=number step=.01 inputmode=decimal value="${settings.currentBalance??''}" placeholder="Es. 850,00"></label>
  <label>Versamento mensile conto casa<input id=homeAmount type=number min=0 step=.01 inputmode=decimal value="${home.amount??500}"></label>
  <label>Giorno previsto conto casa<input id=homeDay type=number min=1 max=31 value="${home.day??1}"></label>
  <label>Rata finanziamento<input id=loanAmount type=number min=0 step=.01 inputmode=decimal value="${loan.amount??330.36}"></label>
  <label>Giorno rata<input id=loanDay type=number min=1 max=31 value="${loan.day??20}"></label>
  <label>Prossimo addebito carta di credito<input id=cardAmount type=number min=0 step=.01 inputmode=decimal value="${settings.creditCardOutstanding??''}" placeholder="Importo dell'estratto conto"></label>
  <div class=help>Questi importi restano soltanto sul tuo dispositivo.</div>
  <div class=actions><button class="btn secondary" value=cancel>Annulla</button><button class="btn primary" id=saveFinance value=default>Salva</button></div></form>`;
  d.showModal();
  d.querySelector('#financeForm').onsubmit=e=>{
    if(e.submitter?.value==='cancel')return;
    settings.currentBalance=d.querySelector('#currentBalance').value===''?null:Number(d.querySelector('#currentBalance').value);
    settings.balanceUpdatedAt=new Date().toISOString();
    home.amount=Number(d.querySelector('#homeAmount').value||0);home.day=Number(d.querySelector('#homeDay').value||1);
    loan.amount=Number(d.querySelector('#loanAmount').value||0);loan.day=Number(d.querySelector('#loanDay').value||20);
    settings.creditCardOutstanding=d.querySelector('#cardAmount').value===''?null:Number(d.querySelector('#cardAmount').value);
    save();setTimeout(render,0);
  }
};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
document.querySelector('#fab').onclick=()=>{
  let d=document.querySelector('#modal');d.innerHTML=`<form method=dialog id=moveForm><h2>Nuovo movimento</h2><label>Tipo<select id=type><option value="-1">Spesa</option><option value="1">Entrata</option></select></label><label>Importo<input id=amount type=number min=0 step=.01 required inputmode=decimal></label><label>Descrizione<input id=desc required placeholder="Es. Supermercato"></label><label>Categoria<select id=cat>${['Alimentari','Ristoranti e bar','Trasporti','Abbonamenti','Casa','Salute','Svago','Rate e debiti','Altro','Entrate'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Data<input id=date type=date required value="${new Date().toISOString().slice(0,10)}"></label><div class=actions><button class="btn secondary" value=cancel>Annulla</button><button class="btn primary" id=saveMove value=default>Salva</button></div></form>`;
  d.showModal();d.querySelector('#moveForm').onsubmit=e=>{if(e.submitter?.value==='cancel')return;let amount=Number(d.querySelector('#amount').value)*Number(d.querySelector('#type').value);tx.unshift({id:crypto.randomUUID(),date:d.querySelector('#date').value,description:d.querySelector('#desc').value,details:'Inserimento manuale',account:'Manuale',posted:'SI',bankCategory:'',category:d.querySelector('#cat').value,currency:'EUR',amount});tx.sort((a,b)=>b.date.localeCompare(a.date));save();setTimeout(render,0)}
};
document.querySelector('#importBtn').onclick=()=>{
  let input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async()=>{let f=input.files?.[0];if(!f)return;try{let data=JSON.parse(await f.text());let imported=Array.isArray(data)?data:data.transactions;if(!Array.isArray(imported))throw new Error('Formato non valido');if(!confirm(`Importare ${imported.length} movimenti? I dati locali attuali verranno sostituiti.`))return;tx=imported;settings={...settings,...(data.settings||{})};migrateSettings();tx.sort((a,b)=>b.date.localeCompare(a.date));save();render();alert('Importazione completata.');}catch(e){alert('Impossibile importare il backup: '+e.message)}};input.click()
};
document.querySelector('#backupBtn').onclick=()=>{
  let blob=new Blob([JSON.stringify({version:'0.3',exportedAt:new Date().toISOString(),transactions:tx,settings},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='SALDO_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href)
};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});
render();
