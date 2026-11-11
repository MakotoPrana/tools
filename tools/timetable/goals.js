// ---- プロジェクト別・日別の目標 ----
// store.projects: [{id,name,color}]
// store.goals:    [{id,pid,date,title,done,tasks:[{id,title,done,items:[{id,name,due,dueTime,ready}]}]}]
//   due は「いつまでに用意しておくか」の日付（YYYY-MM-DD）、dueTime は任意の時刻（HH:MM）
store.projects=store.projects||[];
store.goals=store.goals||[];
const PCOLORS=['#2457c5','#0f8a6a','#c2410c','#8b3fc2','#b8860b','#d6336c'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DN=['日','月','火','水','木','金','土'];
const parseKey=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(k,n)=>{const d=parseKey(k);d.setDate(d.getDate()+n);return keyOf(d)};
const diffDays=(a,b)=>Math.round((parseKey(a)-parseKey(b))/864e5);
const dlabel=k=>{const d=parseKey(k);return `${d.getMonth()+1}/${d.getDate()}(${DN[d.getDay()]})`};
const todayKey=()=>keyOf(new Date());
const proj=id=>store.projects.find(p=>p.id===id);
const goalsOn=k=>store.goals.filter(g=>g.date===k&&proj(g.pid));

// 期限の状態：over=期限切れ / today=今日まで / soon=2日以内 / later
function dueState(it){
  const t=todayKey(),d=diffDays(it.due,t);
  if(d<0)return{cls:'over',txt:`${-d}日過ぎ`};
  if(d===0){
    if(it.dueTime){const[h,m]=it.dueTime.split(':').map(Number);if(nowMin()>h*60+m)return{cls:'over',txt:'時刻を過ぎています'}}
    return{cls:'today',txt:'今日まで'};
  }
  if(d===1)return{cls:'soon',txt:'明日まで'};
  return{cls:d<=2?'soon':'later',txt:`あと${d}日`};
}
const dueText=it=>`${dlabel(it.due)}${it.dueTime?' '+it.dueTime:''}まで`;
// 用意できていないもの（期限順）
function pendingItems(){
  const out=[];
  store.goals.forEach(g=>{const p=proj(g.pid);if(!p)return;
    g.tasks.forEach(t=>t.items.forEach(it=>{if(!it.ready)out.push({it,t,g,p})}))});
  return out.sort((a,b)=>(a.it.due+(a.it.dueTime||'99')).localeCompare(b.it.due+(b.it.dueTime||'99')));
}

// ---- undo（目標データと未定リストをまとめて戻す） ----
function gsnap(){return JSON.stringify({p:store.projects,g:store.goals,i:store.inbox})}
function gtoast(msg,before){
  toast(msg);
  if(before){undoSnap={restore:()=>{const d=JSON.parse(before);store.projects=d.p;store.goals=d.g;store.inbox=d.i;save();render()}};$('undoBtn').hidden=false}
}

// ---- 表示切り替え ----
window.ttView=store.view==='goal'?'goal':'time';
function setView(v){
  window.ttView=v;store.view=v;save();
  if(v==='goal'){assignId=null}
  render();scrollToFocus();
}
$('tabTime').onclick=()=>setView('time');
$('tabGoal').onclick=()=>setView('goal');
$('goalBar').onclick=()=>setView('goal');

// ---- 描画 ----
let lastSig='',refocus=null,openItemForm=new Set();
function renderGoals(){
  const goal=window.ttView==='goal',k=keyOf(cur),tk=todayKey();
  $('tabTime').setAttribute('aria-selected',String(!goal));$('tabGoal').setAttribute('aria-selected',String(goal));
  $('grid').hidden=goal;$('goalView').hidden=!goal;$('inbox').hidden=goal;
  if(goal){$('sampleBar').hidden=true;document.body.classList.remove('assigning')}
  syncPanel();

  const pend=pendingItems(),urgent=pend.filter(x=>diffDays(x.it.due,tk)<=0).length;
  $('goalBadge').hidden=!urgent;$('goalBadge').textContent=urgent;

  const gs=goalsOn(k),gdone=gs.filter(g=>g.done).length;
  const dueHere=pend.filter(x=>x.it.due<=k).length;
  // タイムテーブル側の案内バー
  if(!goal&&(gs.length||dueHere)){
    const parts=[];
    if(gs.length)parts.push(`この日の目標 <b>${gs.length}件</b>（達成${gdone}）`);
    if(dueHere)parts.push(`この日までに用意 <b class="warn">${dueHere}件</b>`);
    $('goalBar').innerHTML=parts.join('・')+'<span class="go">目標を見る ›</span>';$('goalBar').hidden=false;
  }else $('goalBar').hidden=true;
  if(!goal)return;

  const gt=gs.flatMap(g=>g.tasks),tdone=gt.filter(t=>t.done).length;
  $('summary').innerHTML=gs.length
    ?`<span>目標 <b>${gdone}/${gs.length}</b></span><span>タスク <b>${tdone}/${gt.length}</b></span><span>要準備 <b>${pend.length}</b></span>`
    :`<span>この日の目標はまだありません</span><span>要準備 <b>${pend.length}</b></span>`;

  // 入力中に30秒ごとの再描画で消えないよう、内容が変わったときだけ作り直す
  const sig=JSON.stringify([k,tk,store.projects,store.goals,store.projFilter,[...openItemForm]]);
  if(sig===lastSig)return;lastSig=sig;
  renderPrep(pend,tk);renderProjects(k);
  if(refocus){const el=$('goalView').querySelector(refocus);refocus=null;if(el){el.focus({preventScroll:false})}}
}

function renderPrep(pend,tk){
  $('prepCount').textContent=pend.length?pend.length+'件':'';
  const ul=$('prepList');
  if(!pend.length){ul.innerHTML='<li class="empty">用意するものはありません。タスクに「必要なもの」と期限を登録するとここに並びます。</li>';return}
  ul.innerHTML=pend.map(({it,t,g,p})=>{const st=dueState(it);
    return `<li class="pi ${st.cls}" style="--pc:${p.color}">
      <input type="checkbox" class="chk" data-act="ready" data-iid="${it.id}" aria-label="「${esc(it.name)}」を用意できた">
      <div class="pbody"><span class="pname">${esc(it.name)}</span>
      <button class="ctx" data-act="jump" data-gid="${g.id}"><span class="dot"></span>${esc(p.name)} › ${esc(g.title)} › ${esc(t.title)}</button></div>
      <span class="due ${st.cls}"><b>${st.txt}</b><small>${dueText(it)}</small></span></li>`}).join('');
}

function renderProjects(k){
  const f=store.projFilter&&proj(store.projFilter)?store.projFilter:'all';
  $('projBar').innerHTML=store.projects.length
    ?`<button class="pchip" data-act="filter" data-pid="all" aria-pressed="${f==='all'}">すべて</button>`+
      store.projects.map(p=>`<button class="pchip" data-act="filter" data-pid="${p.id}" aria-pressed="${f===p.id}" style="--pc:${p.color}"><span class="dot"></span>${esc(p.name)}</button>`).join('')+
      `<button class="pchip add" data-act="newproj">＋ プロジェクト</button>`
    :'';
  const box=$('projList');
  if(!store.projects.length){
    box.innerHTML=`<div class="gempty"><p>プロジェクトを作ると、日ごとの目標・そのためのタスク・必要なものを登録できます。</p>
      <form class="addrow" data-add="proj"><input type="text" placeholder="プロジェクト名（例：新製品の発表会）" autocomplete="off" aria-label="プロジェクト名"><button class="btn primary">作成</button></form></div>`;
    return;
  }
  const ps=f==='all'?store.projects:[proj(f)];
  box.innerHTML=ps.map(p=>{
    const gs=store.goals.filter(g=>g.pid===p.id&&g.date===k);
    const next=store.goals.filter(g=>g.pid===p.id&&g.date>k).sort((a,b)=>a.date.localeCompare(b.date))[0];
    return `<section class="proj" style="--pc:${p.color}">
      <header class="phead"><span class="dot"></span><button class="ptitle" data-act="editproj" data-pid="${p.id}" title="プロジェクトを編集">${esc(p.name)}</button>
        <span class="pmeta">${gs.length?`達成 ${gs.filter(g=>g.done).length}/${gs.length}`:''}</span></header>
      ${gs.map(goalHTML).join('')||`<p class="none">この日の目標はまだありません${next?`。次の目標は <button class="link" data-act="goto" data-date="${next.date}">${dlabel(next.date)}「${esc(next.title)}」</button>`:''}</p>`}
      <form class="addrow" data-add="goal" data-pid="${p.id}"><input type="text" placeholder="${dlabel(k)}の目標を追加" autocomplete="off" aria-label="${esc(p.name)}の目標"><button class="btn">追加</button></form>
    </section>`}).join('');
}

function goalHTML(g){
  const td=g.tasks.filter(t=>t.done).length;
  return `<article class="goal${g.done?' done':''}" data-gid="${g.id}">
    <div class="ghead"><input type="checkbox" class="chk" data-act="goaldone" data-gid="${g.id}"${g.done?' checked':''} aria-label="目標を達成">
      <button class="gtitle" data-act="editgoal" data-gid="${g.id}">${esc(g.title)}</button>
      ${g.tasks.length?`<span class="gprog">${td}/${g.tasks.length}</span>`:''}</div>
    <ul class="gtasks">${g.tasks.map(t=>taskHTML(g,t)).join('')}</ul>
    <form class="addrow sub" data-add="task" data-gid="${g.id}"><input type="text" placeholder="達成に必要なタスクを追加" autocomplete="off" aria-label="タスク"><button class="btn">追加</button></form>
  </article>`;
}

function taskHTML(g,t){
  const open=openItemForm.has(t.id);
  return `<li class="gtask${t.done?' done':''}">
    <div class="trow"><input type="checkbox" class="chk" data-act="taskdone" data-gid="${g.id}" data-tid="${t.id}"${t.done?' checked':''} aria-label="タスクを完了">
      <button class="ttl" data-act="edittask" data-gid="${g.id}" data-tid="${t.id}">${esc(t.title)}</button>
      <button class="mini" data-act="toinbox" data-gid="${g.id}" data-tid="${t.id}" title="タイムテーブルの「時間未定」に追加">未定へ</button>
      <button class="mini" data-act="toggleitem" data-tid="${t.id}" aria-expanded="${open}">＋ 必要なもの</button></div>
    ${t.items.length?`<ul class="items">${t.items.map(it=>{const st=dueState(it);
      return `<li class="item${it.ready?' ready':''}"><input type="checkbox" class="chk" data-act="ready" data-iid="${it.id}"${it.ready?' checked':''} aria-label="用意できた">
        <button class="iname" data-act="edititem" data-gid="${g.id}" data-tid="${t.id}" data-iid="${it.id}">${esc(it.name)}</button>
        <span class="due ${it.ready?'':st.cls}">${dueText(it)}${it.ready?'':`・<b>${st.txt}</b>`}</span></li>`}).join('')}</ul>`:''}
    ${open?`<form class="additem" data-add="item" data-gid="${g.id}" data-tid="${t.id}">
      <input type="text" placeholder="必要なもの（例：資料を印刷）" autocomplete="off" aria-label="必要なもの">
      <label class="dl">いつまでに<input type="date" value="${g.date}" aria-label="いつまでに用意するか"></label>
      <button class="btn primary">登録</button></form>`:''}
  </li>`;
}

// ---- 操作 ----
const findGoal=id=>store.goals.find(g=>g.id===id);
function findItem(iid){for(const g of store.goals)for(const t of g.tasks){const it=t.items.find(x=>x.id===iid);if(it)return{g,t,it}}return null}
const commit=()=>{save();render()};

$('goalView').addEventListener('change',e=>{
  const el=e.target,a=el.dataset.act;if(!a)return;
  if(a==='goaldone'){findGoal(el.dataset.gid).done=el.checked;commit()}
  else if(a==='taskdone'){const g=findGoal(el.dataset.gid),t=g.tasks.find(x=>x.id===el.dataset.tid);t.done=el.checked;
    const all=g.tasks.length&&g.tasks.every(x=>x.done);commit();if(el.checked&&all&&!g.done)toast('タスクがすべて完了しました。目標にチェックを入れましょう')}
  else if(a==='ready'){const f=findItem(el.dataset.iid);if(!f)return;f.it.ready=el.checked;commit();if(el.checked)toast(`「${f.it.name}」を用意しました`)}
});
$('goalView').addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||el.matches('input'))return;
  const a=el.dataset.act,d=el.dataset;
  if(a==='filter'){store.projFilter=d.pid;commit()}
  else if(a==='newproj')openG({kind:'project'});
  else if(a==='editproj')openG({kind:'project',pid:d.pid});
  else if(a==='editgoal')openG({kind:'goal',gid:d.gid});
  else if(a==='edittask')openG({kind:'task',gid:d.gid,tid:d.tid});
  else if(a==='edititem')openG({kind:'item',iid:d.iid});
  else if(a==='toggleitem'){openItemForm.has(d.tid)?openItemForm.delete(d.tid):(openItemForm.add(d.tid),refocus=`[data-add="item"][data-tid="${d.tid}"] input[type=text]`);render()}
  else if(a==='goto'){cur=parseKey(d.date);render();scrollToFocus()}
  else if(a==='jump'){const g=findGoal(d.gid);cur=parseKey(g.date);render();
    const art=$('goalView').querySelector(`.goal[data-gid="${g.id}"]`);
    if(art){art.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});art.classList.add('flash');setTimeout(()=>art.classList.remove('flash'),1300)}}
  else if(a==='toinbox'){const g=findGoal(d.gid),t=g.tasks.find(x=>x.id===d.tid),before=gsnap();
    (store.inbox[g.date]||(store.inbox[g.date]=[])).push({id:uid(),title:t.title,dur:5});save();render();
    gtoast(`「${t.title}」を${dlabel(g.date)}の時間未定に追加しました`,before)}
});
$('goalView').addEventListener('submit',e=>{
  e.preventDefault();const f=e.target,d=f.dataset,inp=f.querySelector('input[type=text]'),v=inp.value.trim();
  if(!v){inp.focus();return}
  if(store.sample)store.sample=false;
  if(d.add==='proj'){
    const p={id:uid(),name:v,color:PCOLORS[store.projects.length%PCOLORS.length]};store.projects.push(p);
    refocus=`[data-add="goal"][data-pid="${p.id}"] input`;
  }else if(d.add==='goal'){
    const g={id:uid(),pid:d.pid,date:keyOf(cur),title:v,done:false,tasks:[]};store.goals.push(g);
    refocus=`[data-add="task"][data-gid="${g.id}"] input`;
  }else if(d.add==='task'){
    findGoal(d.gid).tasks.push({id:uid(),title:v,done:false,items:[]});
    refocus=`[data-add="task"][data-gid="${d.gid}"] input`;
  }else if(d.add==='item'){
    const due=f.querySelector('input[type=date]').value||findGoal(d.gid).date;
    const t=findGoal(d.gid).tasks.find(x=>x.id===d.tid);t.items.push({id:uid(),name:v,due,dueTime:'',ready:false});
    refocus=`[data-add="item"][data-tid="${d.tid}"] input[type=text]`;
  }
  commit();
});

// ---- 編集シート ----
let gEdit=null,gColor=null;
$('gColors').innerHTML=PCOLORS.map(c=>`<button type="button" class="swatch" data-c="${c}" style="--pc:${c}" aria-label="色 ${c}"></button>`).join('');
$('gColors').onclick=e=>{const b=e.target.closest('.swatch');if(!b)return;gColor=b.dataset.c;syncSw()};
const syncSw=()=>[...$('gColors').children].forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.c===gColor)));
$('gDueChips').onclick=e=>{const b=e.target.closest('.chip');if(b){$('gDue').value=b.dataset.k;syncDueChips()}};
$('gDue').oninput=()=>syncDueChips();
const syncDueChips=()=>[...$('gDueChips').children].forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===$('gDue').value)));

function openG(o){
  gEdit=o;const show=(id,on)=>$(id).hidden=!on;
  show('gDueField',o.kind==='item');show('gDateField',o.kind==='goal');show('gColorField',o.kind==='project');
  let name='',title='';$('gDel').hidden=false;
  if(o.kind==='project'){const p=o.pid&&proj(o.pid);title=p?'プロジェクトを編集':'プロジェクトを作成';name=p?p.name:'';
    gColor=p?p.color:PCOLORS[store.projects.length%PCOLORS.length];syncSw();$('gDel').hidden=!p;$('gNameLab').textContent='プロジェクト名'}
  else if(o.kind==='goal'){const g=findGoal(o.gid);title='目標を編集';name=g.title;$('gDate').value=g.date;$('gNameLab').textContent='目標'}
  else if(o.kind==='task'){const t=findGoal(o.gid).tasks.find(x=>x.id===o.tid);title='タスクを編集';name=t.title;$('gNameLab').textContent='タスク'}
  else{const f=findItem(o.iid);title='必要なものを編集';name=f.it.name;$('gNameLab').textContent='必要なもの';
    $('gDue').value=f.it.due;$('gDueTime').value=f.it.dueTime||'';
    const gd=f.g.date,tk=todayKey();
    const opts=[[addDays(gd,-1),'目標の前日'],[gd,'目標の当日'],[tk,'今日'],[addDays(tk,1),'明日']].filter((x,i,a)=>a.findIndex(y=>y[0]===x[0])===i);
    $('gDueChips').innerHTML=opts.map(([k,l])=>`<button type="button" class="chip" data-k="${k}">${l} ${dlabel(k)}</button>`).join('');syncDueChips()}
  $('gTitle').textContent=title;$('gName').value=name;
  $('gdlg').showModal();setTimeout(()=>$('gName').focus(),50);
}
$('gCancel').onclick=()=>$('gdlg').close();
$('gdlg').addEventListener('click',e=>{if(e.target===$('gdlg'))$('gdlg').close()});
$('gform').addEventListener('submit',e=>{
  e.preventDefault();const v=$('gName').value.trim();if(!v)return;const o=gEdit;let msg='保存しました';
  if(o.kind==='project'){const p=o.pid&&proj(o.pid);
    if(p){p.name=v;p.color=gColor}else{const np={id:uid(),name:v,color:gColor};store.projects.push(np);store.projFilter='all';msg='プロジェクトを作成しました'}}
  else if(o.kind==='goal'){const g=findGoal(o.gid);g.title=v;const nd=$('gDate').value;
    if(nd&&nd!==g.date){g.date=nd;msg=`${dlabel(nd)}に移動しました`}}
  else if(o.kind==='task'){findGoal(o.gid).tasks.find(x=>x.id===o.tid).title=v}
  else{const f=findItem(o.iid);f.it.name=v;f.it.due=$('gDue').value||f.it.due;f.it.dueTime=$('gDueTime').value}
  $('gdlg').close();commit();toast(msg);
});
$('gDel').onclick=()=>{
  const o=gEdit,before=gsnap();let msg;
  if(o.kind==='project'){const p=proj(o.pid);const n=store.goals.filter(g=>g.pid===p.id).length;
    store.projects=store.projects.filter(x=>x!==p);store.goals=store.goals.filter(g=>g.pid!==p.id);
    msg=`プロジェクト「${p.name}」を削除しました${n?`（目標${n}件も削除）`:''}`}
  else if(o.kind==='goal'){const g=findGoal(o.gid);store.goals=store.goals.filter(x=>x!==g);msg=`目標「${g.title}」を削除しました`}
  else if(o.kind==='task'){const g=findGoal(o.gid),t=g.tasks.find(x=>x.id===o.tid);g.tasks=g.tasks.filter(x=>x!==t);msg=`タスク「${t.title}」を削除しました`}
  else{const f=findItem(o.iid);f.t.items=f.t.items.filter(x=>x!==f.it);msg=`「${f.it.name}」を削除しました`}
  $('gdlg').close();save();render();gtoast(msg,before);
};

render();scrollToFocus();
