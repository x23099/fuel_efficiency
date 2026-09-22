const DB='mile-note',STORE='state';let state={fuel:[],records:[],settings:{}},filter='all',months=3;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],today=()=>new Date().toISOString().slice(0,10);
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v||0);
const date=v=>new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(v+'T00:00:00'));
const eco=x=>x.full&&x.liters?x.distance/x.liters:null;
function db(){return new Promise((ok,no)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(STORE);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}
async function load(){
  const d=await db();
  let existingState=false;
  try{
    state=await new Promise((ok,no)=>{
      const q=d.transaction(STORE).objectStore(STORE).get('app');
      q.onsuccess=()=>{existingState=!!q.result;ok(q.result||state)};
      q.onerror=()=>no(q.error);
    });
  }finally{d.close()}
  // Existing installations used a 37 L tank; retain that setting on upgrade.
  if(existingState&&state.settings?.tankCapacity===undefined){
    const nextState={...state,settings:{...state.settings,tankCapacity:37}};
    await save(nextState);
    state=nextState;
  }
}
async function save(nextState=state){
  const d=await db();
  try{
    await new Promise((ok,no)=>{
      const transaction=d.transaction(STORE,'readwrite');
      transaction.oncomplete=ok;
      transaction.onabort=()=>no(transaction.error||Error('保存できませんでした'));
      transaction.onerror=()=>no(transaction.error);
      transaction.objectStore(STORE).put(nextState,'app');
    });
  }finally{d.close()}
}
const validTankCapacity=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0.1;
const tankCapacity=()=>validTankCapacity(state.settings?.tankCapacity)?state.settings.tankCapacity:null;
function renderTankCapacity(){
  const capacity=tankCapacity();
  $('#tankCapacityLabel').textContent=capacity?`${capacity} L`:'未設定';
  $('#estimatedRangeUnit').textContent=capacity?`km / ${capacity}L`:'km';
  const liters=$('#fuelForm [name=liters]');
  if(capacity)liters.max=String(capacity);else liters.removeAttribute('max');
}
function openTankSettings(){
  const capacity=tankCapacity(),form=$('#tankSettingsForm');
  form.elements.tankCapacity.value=capacity??'';
  $('#closeTankSettings').hidden=!capacity;
  $('#tankSettingsDescription').textContent=capacity
    ?'お車の燃料タンク容量を変更できます。この端末に保存されます。'
    :'はじめに、お車の燃料タンク容量を入力してください。この端末に保存し、次回からは入力不要です。';
  form.querySelector('[type=submit]').textContent=capacity?'保存する':'保存してはじめる';
  $('#tankSettingsError').hidden=true;
  $('#tankSettingsModal').showModal();
  form.elements.tankCapacity.focus();
}
function tankSettingsUI(){
  const modal=$('#tankSettingsModal'),form=$('#tankSettingsForm'),error=$('#tankSettingsError');
  let saving=false;
  $('#openTankSettings').onclick=openTankSettings;
  $('#closeTankSettings').onclick=()=>{if(!saving&&tankCapacity())modal.close()};
  modal.oncancel=e=>{if(saving||!tankCapacity())e.preventDefault()};
  form.onsubmit=async e=>{
    e.preventDefault();
    if(saving)return;
    const capacity=form.elements.tankCapacity.valueAsNumber;
    error.hidden=true;
    if(!validTankCapacity(capacity)||!form.reportValidity()){
      error.textContent='タンク容量は0.1L以上の数値で入力してください。';
      error.hidden=false;
      return;
    }
    const nextState={...state,settings:{...state.settings,tankCapacity:capacity}};
    saving=true;
    form.querySelector('[type=submit]').disabled=true;
    $('#closeTankSettings').disabled=true;
    try{
      await save(nextState);
      state=nextState;
      render();
      modal.close();
      toast('燃料タンク容量を保存しました');
    }catch(err){
      error.textContent='容量を保存できませんでした。端末の空き容量やブラウザの保存設定を確認し、もう一度お試しください。';
      error.hidden=false;
    }finally{
      saving=false;
      form.querySelector('[type=submit]').disabled=false;
      $('#closeTankSettings').disabled=false;
    }
  };
}
function items(){return [...state.fuel.map(x=>({...x,kind:'fuel',type:'fuel',title:'給油'})),...state.records.map(x=>({...x,kind:'record'}))].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt)}
const meta={fuel:['給','給油'],maintenance:['整','整備'],repair:['修','故障・修理'],custom:['装','カスタム'],inspection:['検','車検'],insurance:['保','保険'],tax:['税','税金'],wash:['洗','洗車'],expense:['費','その他支出']};
function esc(v=''){const n=document.createElement('span');n.textContent=v;return n.innerHTML}
function row(x,del=false){const [icon,label]=meta[x.type]||['記','記録'],e=x.kind==='fuel'?eco(x):null,detail=x.kind==='fuel'?`${x.distance.toFixed(1)} km ・ ${x.liters.toFixed(2)} L${x.full?'':' ・ 部分給油'}`:`${label}${x.odometer?` ・ ${Number(x.odometer).toLocaleString()} km`:''}${x.attachment?' ・ 添付あり':''}`,value=x.kind==='fuel'&&e?`${e.toFixed(1)} km/L`:x.cost?yen(x.cost):'';return `<article class="record-item"><div class="record-icon">${icon}</div><div><h3>${esc(x.title)}</h3><p>${date(x.date)} ・ ${esc(detail)}</p></div><div class="record-value">${value}<small>${del?`<button class="delete-link" data-delete="${x.kind}:${x.id}">削除</button>`:''}</small></div></article>`}
function dashboard(){const fuel=state.fuel.filter(eco).sort((a,b)=>a.date.localeCompare(b.date)),last=fuel.at(-1),avg=fuel.length?fuel.reduce((s,x)=>s+eco(x),0)/fuel.length:null,year=String(new Date().getFullYear());$('#latestEconomy').textContent=last?eco(last).toFixed(1):'--';$('#latestDate').textContent=last?date(last.date)+'の給油':'最初の給油を記録しましょう';$('#averageEconomy').textContent=avg?avg.toFixed(1):'--';$('#estimatedRange').textContent=last&&tankCapacity()?Math.round(eco(last)*tankCapacity()).toLocaleString():'--';$('#yearDistance').textContent=state.fuel.filter(x=>x.date.startsWith(year)).reduce((s,x)=>s+x.distance,0).toLocaleString(undefined,{maximumFractionDigits:1});$('#yearExpense').textContent=yen(items().filter(x=>x.date.startsWith(year)).reduce((s,x)=>s+Number(x.cost||0),0));const recent=items().slice(0,4);$('#recentList').innerHTML=recent.length?recent.map(x=>row(x)).join(''):'<div class="empty">まだ記録がありません</div>'}
function records(){let list=items();if(filter!=='all')list=list.filter(x=>filter==='expense'?['inspection','insurance','tax','wash','expense'].includes(x.type):x.type===filter);$('#recordList').innerHTML=list.length?list.map(x=>row(x,true)).join(''):'<div class="empty">該当する記録がありません</div>'}
function cutoff(){if(!months)return null;const d=new Date();d.setMonth(d.getMonth()-months);return d.toISOString().slice(0,10)}
function context(c){const r=Math.min(devicePixelRatio||1,3),w=Math.round(c.getBoundingClientRect().width),h=+(c.dataset.logicalHeight||(c.dataset.logicalHeight=c.getAttribute('height')));if(!w)return null;c.style.height=`${h}px`;c.width=Math.round(w*r);c.height=Math.round(h*r);const x=c.getContext('2d');x.setTransform(r,0,0,r,0,0);x.clearRect(0,0,w,h);return{x,w,h}}
function line(list){const c=$('#economyChart'),empty=$('#emptyChart');if(list.length<2){c.style.display='none';empty.style.display='block';return}c.style.display='block';empty.style.display='none';const setup=context(c);if(!setup)return;const{x,w,h}=setup,vals=list.map(eco),min=Math.max(0,Math.floor(Math.min(...vals)-2)),max=Math.ceil(Math.max(...vals)+2),p={l:34,r:10,t:15,b:30};x.font='10px -apple-system';for(let i=0;i<4;i++){const y=p.t+(h-p.t-p.b)*i/3;x.strokeStyle='#e1e4df';x.beginPath();x.moveTo(p.l,y);x.lineTo(w-p.r,y);x.stroke();x.fillStyle='#707772';x.fillText((max-(max-min)*i/3).toFixed(0),4,y+3)}const pt=(v,i)=>({a:p.l+(w-p.l-p.r)*i/(list.length-1),b:p.t+(h-p.t-p.b)*(max-v)/(max-min||1)});x.strokeStyle='#166a48';x.lineWidth=2.5;x.beginPath();vals.forEach((v,i)=>{const q=pt(v,i);i?x.lineTo(q.a,q.b):x.moveTo(q.a,q.b)});x.stroke();vals.forEach((v,i)=>{const q=pt(v,i);x.fillStyle='white';x.strokeStyle='#166a48';x.beginPath();x.arc(q.a,q.b,4,0,7);x.fill();x.stroke();if(i===0||i===vals.length-1){x.fillStyle='#707772';x.textAlign=i?'right':'left';x.fillText(new Intl.DateTimeFormat('ja-JP',{month:'short',day:'numeric'}).format(new Date(list[i].date+'T00:00:00')),q.a,h-8)}})}
function bars(list){const c=$('#expenseChart'),g={};list.forEach(x=>g[x.date.slice(0,7)]=(g[x.date.slice(0,7)]||0)+Number(x.cost||0));const es=Object.entries(g).sort(),setup=context(c);if(!setup)return;const{x,w,h}=setup;if(!es.length){x.fillStyle='#707772';x.font='12px -apple-system';x.textAlign='center';x.fillText('支出を登録するとグラフを表示します',w/2,h/2);return}const max=Math.max(...es.map(v=>v[1])),gap=7,bw=Math.max(7,(w-20-gap*(es.length-1))/es.length);es.forEach(([m,v],i)=>{const bh=(h-58)*v/max,a=12+i*(bw+gap);x.fillStyle='#db8c2f';x.fillRect(a,h-35-bh,bw,bh);if(es.length<=8||i%2===0){x.fillStyle='#707772';x.font='9px -apple-system';x.textAlign='center';x.fillText(+m.slice(5)+'月',a+bw/2,h-13)}})}
function charts(){const start=cutoff(),fuel=state.fuel.filter(x=>eco(x)&&(!start||x.date>=start)).sort((a,b)=>a.date.localeCompare(b.date)),list=items().filter(x=>(!start||x.date>=start)&&x.cost),avg=fuel.length?fuel.reduce((s,x)=>s+eco(x),0)/fuel.length:null;$('#chartAverage').textContent=avg?`平均 ${avg.toFixed(1)} km/L`:'-- km/L';$('#expenseTotal').textContent=yen(list.reduce((s,x)=>s+Number(x.cost),0));line(fuel);bars(list)}
function render(){renderTankCapacity();dashboard();records();if($('.view[data-view=analytics]').classList.contains('active'))requestAnimationFrame(()=>requestAnimationFrame(charts))}
function toast(v){const t=$('#toast');t.textContent=v;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2200)}
function go(v){$$('.view').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$$('.bottom-nav button').forEach(x=>x.classList.toggle('active',x.dataset.target===v));scrollTo({top:0,behavior:'auto'});if(v==='analytics')requestAnimationFrame(()=>requestAnimationFrame(charts))}
async function attachment(f){if(!f)return null;if(f.size>5242880)throw Error('添付ファイルは5MB以下にしてください');return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok({name:f.name,type:f.type,data:r.result});r.onerror=no;r.readAsDataURL(f)})}
function showSaveResult(message){
  $('#saveResultMessage').textContent=message;
  $('#saveResultModal').showModal();
  $('#closeSaveResult').focus();
}
function bindSaveForm(form,key,createRecord,onSaved){
  form.onsubmit=async e=>{
    e.preventDefault();
    if(form.dataset.saving||!form.reportValidity())return;
    const data=new FormData(form),error=form.querySelector('.save-error'),button=form.querySelector('[type=submit]');
    const controls=[...form.querySelectorAll('input,select,textarea,button')].map(control=>[control,control.disabled]);
    const buttonText=button.textContent;
    let prepared=false;
    error.hidden=true;
    form.dataset.saving='true';
    form.setAttribute('aria-busy','true');
    controls.forEach(([control])=>control.disabled=true);
    button.textContent='保存中…';
    try{
      const record={...await createRecord(data,form),id:crypto.randomUUID(),createdAt:Date.now()};
      const nextState={...state,[key]:[...state[key],record]};
      prepared=true;
      await save(nextState);
      state=nextState;
    }catch(err){
      error.textContent=prepared?'記録を保存できませんでした。入力内容は残っています。端末の空き容量などを確認して、もう一度お試しください。':err.message||'入力内容を確認してください。';
      error.hidden=false;
      error.scrollIntoView({block:'nearest'});
      return;
    }finally{
      delete form.dataset.saving;
      form.removeAttribute('aria-busy');
      controls.forEach(([control,disabled])=>control.disabled=disabled);
      button.textContent=buttonText;
    }
    form.reset();
    form.elements.date.value=today();
    onSaved();
    render();
    showSaveResult(key==='fuel'?'給油記録を保存しました。':`${meta[data.get('type')]?.[1]||'車'}の記録を保存しました。`);
  };
}
function bind(){$$('.bottom-nav button').forEach(b=>b.onclick=()=>go(b.dataset.target));$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#fuelForm').oninput=e=>{const f=new FormData(e.currentTarget),d=+f.get('distance'),l=+f.get('liters');$('#fuelPreview').textContent=d&&l?(d/l).toFixed(1)+' km/L':'-- km/L'};bindSaveForm($('#fuelForm'),'fuel',async f=>{
    const capacity=tankCapacity(),liters=+f.get('liters');
    if(!capacity)throw Error('概要画面で燃料タンク容量を設定してください');
    if(liters>capacity)throw Error(`給油量は${capacity}L以下で入力してください`);
    return {date:f.get('date'),distance:+f.get('distance'),liters,cost:+f.get('cost')||0,full:f.get('full')==='on',notes:f.get('notes')};
  },()=>{
    $('#fuelForm').elements.full.checked=true;
    $('#fuelPreview').textContent='-- km/L';
    go('home');
  });
  $('#openRecordModal').onclick=()=>$('#recordModal').showModal();
  $('#closeRecordModal').onclick=()=>$('#recordModal').close();
  $('#recordModal').oncancel=e=>{if($('#recordForm').dataset.saving)e.preventDefault()};
  $('#recordForm [name=attachment]').onchange=e=>$('#fileName').textContent=e.target.files[0]?.name||'写真またはPDFを選択';
  bindSaveForm($('#recordForm'),'records',async (f,form)=>({
    type:f.get('type'),date:f.get('date'),title:f.get('title'),odometer:+f.get('odometer')||0,cost:+f.get('cost')||0,notes:f.get('notes'),attachment:await attachment(form.elements.attachment.files[0])
  }),()=>{
    $('#fileName').textContent='写真またはPDFを選択';
    $('#recordModal').close();
  });
  $('#closeSaveResult').onclick=()=>$('#saveResultModal').close();
  $('#recordFilter').onclick=e=>{const b=e.target.closest('button');if(!b)return;filter=b.dataset.filter;$$('#recordFilter button').forEach(x=>x.classList.toggle('active',x===b));records()};$('#periodControl').onclick=e=>{const b=e.target.closest('button');if(!b)return;months=+b.dataset.months;$$('#periodControl button').forEach(x=>x.classList.toggle('active',x===b));charts()};$('#recordList').onclick=async e=>{const b=e.target.closest('[data-delete]');if(!b||!confirm('この記録を削除しますか？'))return;const[k,id]=b.dataset.delete.split(':'),key=k==='fuel'?'fuel':'records';state[key]=state[key].filter(x=>x.id!==id);await save();render();toast('削除しました')};$('#exportButton').onclick=()=>{const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`mile-note-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('バックアップを書き出しました')};window.onresize=()=>$('.view[data-view=analytics]').classList.contains('active')&&charts()}
function backupUI(){const modal=$('#backupModal');$('#exportButton').onclick=()=>modal.showModal();$('#closeBackupModal').onclick=()=>modal.close();$('#downloadBackup').onclick=()=>{const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`fuel-app-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('バックアップを書き出しました')};$('#importBackup').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.fuel)||!Array.isArray(data.records))throw Error('このファイルは取り込めません');if((state.fuel.length||state.records.length)&&!confirm('現在の記録を置き換え、タンク容量が含まれている場合は容量も復元しますか？'))return;if(data.settings?.tankCapacity!==undefined&&!validTankCapacity(data.settings.tankCapacity))throw Error('バックアップのタンク容量が正しくありません');const nextState={...state,fuel:data.fuel,records:data.records,settings:{...state.settings,...(data.settings?.tankCapacity!==undefined?{tankCapacity:data.settings.tankCapacity}:{})}};await save(nextState);state=nextState;render();modal.close();toast('記録を復元しました')}catch(err){toast(err.message||'バックアップを読み込めませんでした')}finally{e.target.value=''}}}
async function init(){
  $('#todayLabel').textContent=new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(new Date());
  $('#fuelForm [name=date]').value=$('#recordForm [name=date]').value=today();
  await load();
  bind();
  backupUI();
  tankSettingsUI();
  render();
  if(!tankCapacity())openTankSettings();
  if('serviceWorker'in navigator){
    try{
      const registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration=>registration.unregister()));
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith('fuel-app-')).map(key=>caches.delete(key)));
    }catch(err){console.warn('古いオフラインキャッシュを削除できませんでした',err)}
  }
}
init().catch(()=>{$$('button,input,textarea,select').forEach(element=>element.disabled=true);$('#latestDate').textContent='端末のデータを読み込めませんでした。ブラウザの保存設定を確認して、再読み込みしてください。'});
