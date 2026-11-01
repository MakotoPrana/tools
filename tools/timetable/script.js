const STEP=5, DAY=1440;
const DURS=[5,10,15,20,30,45,60,90,120];
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const fmt=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;
const ceil5=m=>Math.ceil(m/STEP)*STEP;
const keyOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};

let store={days:{},sample:false};
try{const s=JSON.parse(localStorage.getItem('tt5')||'null');if(s&&s.days)store=s}catch(e){}
store.inbox=store.inbox||{};
const save=()=>{try{localStorage.setItem('tt5',JSON.stringify(store))}catch(e){}};

let cur=new Date(); cur.setHours(0,0,0,0);
const isToday=()=>keyOf(cur)===keyOf(new Date());
const tasks=()=>store.days[keyOf(cur)]||(store.days[keyOf(cur)]=[]);
const inbox=()=>store.inbox[keyOf(cur)]||(store.inbox[keyOf(cur)]=[]);
const uid=()=>Math.random().toString(36).slice(2,9);

// サンプル（初回のみ）
if(!Object.keys(store.days).length){
  const base=Math.max(0,Math.min(DAY-240,ceil5(nowMin())-30));
  const s=[["朝のメール確認",15],["企画書の構成を考える",45],["休憩",10],["資料の図を作る",30],["打ち合わせ準備",20]];
  let t=base; const arr=[];
  s.forEach(([title,dur],i)=>{arr.push({id:uid(),title,start:t,dur,plan:dur,done:i===0,doneAt:i===0?t+15:null});t+=dur});
  store.days[keyOf(cur)]=arr; store.sample=true; save();
}

// ---- 並び替えロジック ----
// anchorの終了に重なる後続タスクを順に押し出す（完了済みは動かさない）
function pushAfter(list,anchor){
  const after=list.filter(t=>t!==anchor&&!t.done&&t.start>=anchor.start).sort((a,b)=>a.start-b.start);
  let end=anchor.start+anchor.dur, moved=0, shift=0;
  for(const t of after){
    if(t.start<end){shift=Math.max(shift,end-t.start);t.start=end;moved++}
    end=Math.max(end,t.start+t.dur);
  }
  return {moved,shift};
}
// endの時刻からすき間なく続く未完了タスクの連なりをdeltaだけ前倒し
function pullChain(list,from,end,delta){
  const chain=[];let e=end,guard=0;
  while(guard++<500){const n=list.find(t=>t!==from&&!t.done&&t.start===e&&!chain.includes(t));if(!n)break;chain.push(n);e=n.start+n.dur}
  chain.forEach(t=>t.start-=delta);
  return chain.length;
}

// ---- undo ----
let undoSnap=null,toastTimer=null;
const snap=()=>JSON.stringify({t:tasks(),i:inbox()});
function toast(msg,snapshot){
  undoSnap=snapshot?{key:keyOf(cur),data:snapshot}:null;
  $('toastMsg').textContent=msg;$('undoBtn').hidden=!snapshot;$('toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);
}
$('undoBtn').onclick=()=>{if(!undoSnap)return;{const d=JSON.parse(undoSnap.data);store.days[undoSnap.key]=d.t;store.inbox[undoSnap.key]=d.i;}save();render();$('toast').hidden=true};

// ---- 描画 ----
const ROW=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row'));
function render(){
  const list=tasks();
  const dn=['日','月','火','水','木','金','土'];
  $('dateLabel').textContent=`${cur.getMonth()+1}月${cur.getDate()}日(${dn[cur.getDay()]})${isToday()?'・今日':''}`;
  $('sampleBar').hidden=!(store.sample&&list.length);
  const maxEnd=list.reduce((m,t)=>Math.max(m,t.start+t.dur),DAY);
  const n=Math.ceil(maxEnd/STEP);
  const slots=$('slots');
  if(slots.childElementCount!==n){
    let h='';
    for(let i=0;i<n;i++){const m=i*STEP,mm=m%60;
      h+=`<div class="slot${mm===0?' h':mm===30?' m30':''}" data-m="${m}"><span class="lab">${mm===0?fmt(m%DAY)+(m>=DAY?'⁺':''):':'+pad(mm)}</span><span class="plus">＋ 追加</span></div>`}
    slots.innerHTML=h;
  }
  const r=ROW(),layer=$('layer');
  layer.style.height=n*r+'px';
  layer.innerHTML='';
  [...list].sort((a,b)=>a.start-b.start).forEach(t=>{
    const el=document.createElement('div');
    const late=t.done&&t.dur>t.plan;
    el.className='task'+(t.done?' done':'')+(late?' late':'')+(t.dur<=5?' short':'');
    el.style.top=(t.start/STEP*r+1)+'px';el.style.height=(t.dur/STEP*r-2)+'px';
    el.tabIndex=0;el.setAttribute('role','button');el.dataset.id=t.id;
    el.innerHTML=`<input type="checkbox" class="chk" aria-label="完了"${t.done?' checked':''}><div class="body"><span class="ttl"></span><span class="tm">${fmt(t.start)}–${fmt(t.start+t.dur)}${t.done&&t.doneAt!=null?' ✓'+fmt(t.doneAt):''}</span>${late?`<span class="tag">+${t.dur-t.plan}分</span>`:''}</div>`;
    el.querySelector('.ttl').textContent=t.title;
    const chk=el.querySelector('.chk');
    chk.addEventListener('click',e=>e.stopPropagation());
    chk.addEventListener('change',()=>toggleDone(t.id,chk.checked));
    el.addEventListener('click',()=>{if(!assignItem()&&!el._swiped)openEdit(t.id)});
    attachSwipe(el,t);
    taskAssignButtons(el,t);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===el)openEdit(t.id)});
    layer.appendChild(el);
  });
  renderAssignButtons(layer,list,r);
  if(isToday()){
    const nm=nowMin(),line=document.createElement('div');
    line.className='nowline';line.style.top=(nm/STEP*r)+'px';line.dataset.t=fmt(nm);layer.appendChild(line);
  }
  const done=list.filter(t=>t.done).length,rest=list.filter(t=>!t.done).reduce((s,t)=>s+t.dur,0);
  const lastEnd=list.length?Math.max(...list.map(t=>t.start+t.dur)):null;
  $('summary').innerHTML=list.length?`<span>完了 <b>${done}/${list.length}</b></span><span>残り <b>${Math.floor(rest/60)}h${pad(rest%60)}m</b></span><span>終了予定 <b>${fmt(lastEnd%DAY)}${lastEnd>DAY?'(翌)':''}</b></span>`:'<span>空いている枠をタップしてタスクを追加</span>';
  renderInbox();
}

// ---- 完了 ----
function toggleDone(id,on){
  const list=tasks(),t=list.find(x=>x.id===id),before=snap();
  if(on){
    const nm=isToday()?nowMin():t.start+t.dur;
    t.done=true;t.doneAt=nm;
    const actualEnd=ceil5(nm), planEnd=t.start+t.plan;
    if(actualEnd>planEnd){
      t.dur=actualEnd-t.start;
      const {moved}=pushAfter(list,t);
      save();render();
      toast(moved?`${actualEnd-planEnd}分遅れ。後続${moved}件を後ろ倒ししました`:`${actualEnd-planEnd}分遅れで完了`,before);return;
    }
    save();render();toast('完了しました',before);
  }else{
    t.done=false;t.doneAt=null;
    if(t.dur>t.plan)t.dur=t.plan;
    save();render();toast('未完了に戻しました',before);
  }
}

// ---- 編集シート ----
let editing=null,dur=15;
function setDur(d){
  dur=Math.max(5,Math.min(720,d));
  $('durOut').textContent=dur<60?`${dur}分`:`${Math.floor(dur/60)}時間${dur%60?dur%60+'分':''}`;
  [...$('durChips').children].forEach(c=>c.setAttribute('aria-pressed',String(+c.dataset.d===dur)));
  const s=parseTime();$('preview').textContent=s!=null?`${fmt(s)}–${fmt((s+dur)%DAY)}`:'';
}
function parseTime(){const v=$('fStart').value;if(!v)return null;const[h,m]=v.split(':').map(Number);return Math.round((h*60+m)/STEP)*STEP}
$('durChips').innerHTML=DURS.map(d=>`<button type="button" class="chip" data-d="${d}">${d<60?d+'分':d/60+'h'}</button>`).join('');
$('durChips').onclick=e=>{const b=e.target.closest('.chip');if(!b)return;setDur(+b.dataset.d);
  if($('form').classList.contains('quick')){if($('fTitle').value.trim())$('form').requestSubmit();else $('fTitle').focus()}};
$('durMinus').onclick=()=>setDur(dur-5);$('durPlus').onclick=()=>setDur(dur+5);
$('fStart').oninput=()=>setDur(dur);

function openNew(m){
  editing=null;$('form').classList.add('quick');
  $('dlgTitle').textContent=`${fmt(m%DAY)} に追加`;$('delBtn').hidden=true;$('unschedBtn').hidden=true;
  $('durLab').textContent='かかる時間（タップで登録／Enterなら5分）';
  $('fTitle').value='';$('fStart').value=fmt(m%DAY);
  setDur(5);
  $('dlg').showModal();setTimeout(()=>$('fTitle').focus(),50);
}
function openEdit(id){
  $('form').classList.remove('quick');$('durLab').textContent='所要時間';
  const t=tasks().find(x=>x.id===id);editing=id;
  $('dlgTitle').textContent='タスクを編集';$('delBtn').hidden=false;$('unschedBtn').hidden=t.done;
  $('fTitle').value=t.title;$('fStart').value=fmt(t.start%DAY);setDur(t.dur);
  $('dlg').showModal();
}
$('fTitle').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();$('form').requestSubmit()}});
$('cancelBtn').onclick=()=>$('dlg').close();
$('dlg').addEventListener('click',e=>{if(e.target===$('dlg'))$('dlg').close()});

$('form').addEventListener('submit',e=>{
  e.preventDefault();
  const title=$('fTitle').value.trim(),start=parseTime();
  if(!title||start==null)return;
  const list=tasks(),before=snap();let msg;
  if(editing){
    const t=list.find(x=>x.id===editing);
    const oldStart=t.start,oldEnd=t.start+t.dur;
    if(start===oldStart&&dur<t.dur){
      const n=pullChain(list,t,oldEnd,t.dur-dur);t.dur=dur;if(!t.done)t.plan=dur;
      msg=n?`後続${n}件を前倒ししました`:'保存しました';
    }else{
      t.start=start;t.dur=dur;if(!t.done)t.plan=dur;
      const {moved}=pushAfter(list,t);msg=moved?`後続${moved}件を後ろ倒ししました`:'保存しました';
    }
    t.title=title;
  }else{
    if(store.sample){store.sample=false}
    const t={id:uid(),title,start,dur,plan:dur,done:false,doneAt:null};list.push(t);
    const {moved}=pushAfter(list,t);msg=moved?`追加し、後続${moved}件を後ろ倒ししました`:'追加しました';
  }
  save();$('dlg').close();render();toast(msg,before);
});

function deleteTask(id){
  const list=tasks(),i=list.findIndex(x=>x.id===id);if(i<0)return;
  const before=snap(),t=list[i];
  const n=pullChain(list,t,t.start+t.dur,t.dur);
  list.splice(i,1);save();render();
  toast(n?`「${t.title}」を削除し、後続${n}件を${t.dur}分前倒ししました`:`「${t.title}」を削除しました`,before);
}
$('delBtn').onclick=()=>{$('dlg').close();deleteTask(editing)};

// ---- 左スワイプで削除 ----
function attachSwipe(el,t){
  let sx=0,sy=0,dx=0,active=false,locked=null,bg=null,pid=null;
  el.addEventListener('pointerdown',e=>{
    if(assignItem()||e.button>0||e.target.closest('.chk,.abtn'))return;
    sx=e.clientX;sy=e.clientY;dx=0;active=true;locked=null;pid=e.pointerId;
  });
  el.addEventListener('pointermove',e=>{
    if(!active||e.pointerId!==pid)return;
    const mx=e.clientX-sx,my=e.clientY-sy;
    if(locked==null){
      if(Math.abs(mx)<8&&Math.abs(my)<8)return;
      locked=Math.abs(mx)>Math.abs(my)*1.2&&mx<0?'x':'y';
      if(locked==='y'){active=false;return}
      el.setPointerCapture(pid);
      bg=document.createElement('div');bg.className='swipebg';
      bg.style.top=el.style.top;bg.style.height=el.style.height;bg.textContent='削除';
      el.parentNode.insertBefore(bg,el);el.style.transition='none';el.classList.add('swiping');
    }
    dx=Math.min(0,mx);el.style.transform=`translateX(${dx}px)`;
    bg.classList.toggle('arm',-dx>el.offsetWidth*0.35);
  });
  const finish=cancel=>{
    if(!active){return}active=false;
    if(locked!=='x')return;
    el._swiped=true;setTimeout(()=>el._swiped=false,50);
    const ok=!cancel&&-dx>el.offsetWidth*0.35;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition=reduce?'none':'transform .18s ease';
    if(ok){el.style.transform='translateX(-110%)';setTimeout(()=>deleteTask(t.id),reduce?0:170)}
    else{el.style.transform='';setTimeout(()=>{bg&&bg.remove();el.classList.remove('swiping');el.style.transition=''},reduce?0:180)}
  };
  el.addEventListener('pointerup',()=>finish(false));
  el.addEventListener('pointercancel',()=>finish(true));
}

$('unschedBtn').onclick=()=>{
  const list=tasks(),i=list.findIndex(x=>x.id===editing);if(i<0)return;
  const before=snap(),t=list[i];
  const n=pullChain(list,t,t.start+t.dur,t.dur);
  list.splice(i,1);inbox().push({id:uid(),title:t.title,dur:t.plan||t.dur});
  save();$('dlg').close();render();
  toast(n?`未定に戻し、後続${n}件を前倒ししました`:'未定に戻しました',before);
};

// ---- 時間未定リスト ----
function renderInbox(){
  const ib=inbox(),ul=$('ibList');
  $('ibCount').textContent=ib.length;
  ul.innerHTML=ib.length?'':'<li class="empty">まだありません。今日やることを入れておき、あとで時間枠にドラッグします。</li>';
  ib.forEach(it=>{
    const li=document.createElement('li');li.className='ib';li.dataset.id=it.id;
    li.innerHTML=`<button class="pick"><span class="nm"></span></button><button class="x" aria-label="削除">×</button>`;
    if(it.id===assignId)li.classList.add("sel");
    li.querySelector('.nm').textContent=it.title;
    li.querySelector('.x').onclick=()=>{if(assignId===it.id)assignId=null;const before=snap();store.inbox[keyOf(cur)]=ib.filter(x=>x!==it);save();render();toast('未定タスクを削除しました',before)};
    li.querySelector('.pick').onclick=()=>setAssign(it.id);
    ul.appendChild(li);
  });
  syncPanel();
}
function syncPanel(){
  const h=$('inbox').offsetHeight;
  document.documentElement.style.setProperty('--panelH',h+'px');
  document.querySelector('.wrap').style.paddingBottom=(h+40)+'px';
}
$('ibForm').addEventListener('submit',e=>{
  e.preventDefault();const v=$('ibInput').value.trim();if(!v)return;
  inbox().push({id:uid(),title:v,dur:5});$('ibInput').value='';save();renderInbox();
});
$('ibToggle').onclick=()=>{const c=$('inbox').classList.toggle('closed');$('ibToggle').setAttribute('aria-expanded',String(!c));syncPanel()};
window.addEventListener('resize',syncPanel);

// ---- 割り当てモード（未定タスクをタップ→挿入/マージボタンで配置） ----
let assignId=null;
const assignItem=()=>assignId&&inbox().find(x=>x.id===assignId);
function setAssign(id){
  assignId=(assignId===id)?null:id;
  render();
  if(assignId)scrollToFocus();
}
function renderAssignButtons(layer,list,r){
  const it=assignItem();
  document.body.classList.toggle('assigning',!!it);
  $('assignBar').hidden=!it;
  if(!it)return;
  $('assignName').textContent=it.title;
  const n=$('slots').childElementCount,covered=new Set();
  list.forEach(t=>{for(let m=t.start;m<t.start+t.dur;m+=STEP)covered.add(m)});
  for(let k=0;k<n;k++){const m=k*STEP;if(covered.has(m))continue;
    const b=document.createElement('button');b.className='abtn ins';b.textContent='ここに挿入';
    b.style.top=(m/STEP*r+3)+'px';b.setAttribute('aria-label',`${fmt(m%DAY)}に挿入`);
    b.onclick=e=>{e.stopPropagation();assignTo({mode:'insert',m})};layer.appendChild(b)}
}
function taskAssignButtons(el,t){
  if(!assignItem()||t.done)return;
  const box=document.createElement('div');box.className='abox';
  const ins=document.createElement('button');ins.className='abtn';ins.textContent='前に挿入';
  ins.onclick=e=>{e.stopPropagation();assignTo({mode:'insert',m:t.start})};
  const mg=document.createElement('button');mg.className='abtn mg';mg.textContent='マージ';
  mg.onclick=e=>{e.stopPropagation();assignTo({mode:'merge',task:t})};
  box.append(ins,mg);el.appendChild(box);
}
function assignTo(tg){
  const it=assignItem();if(!it)return;
  const before=snap(),list=tasks(),d=it.dur||5;
  if(store.sample)store.sample=false;
  store.inbox[keyOf(cur)]=inbox().filter(x=>x!==it);assignId=null;
  if(tg.mode==='merge'){
    const t=tg.task;t.title=`${t.title} ＋ ${it.title}`;
    save();render();
    toast(`「${t.title}」にマージしました（${fmt(t.start%DAY)}–${fmt((t.start+t.dur)%DAY)}のまま）`,before);return;
  }
  const m=tg.m,t={id:uid(),title:it.title,start:m,dur:d,plan:d,done:false,doneAt:null};
  list.push(t);const {moved}=pushAfter(list,t);save();render();
  toast(moved?`${fmt(m%DAY)}に挿入し、後続${moved}件を後ろ倒ししました`:`${fmt(m%DAY)}に入れました`,before);
}
$('assignCancel').onclick=()=>{assignId=null;render()};

// ---- 枠クリック・日付 ----
$('slots').addEventListener('click',e=>{
  if(assignItem())return;const s=e.target.closest('.slot');if(!s)return;const m=+s.dataset.m;
  const hit=tasks().find(t=>m>=t.start&&m<t.start+t.dur);
  hit?openEdit(hit.id):openNew(m);
});
$('clearSample').onclick=()=>{const before=snap();store.days[keyOf(cur)]=[];store.sample=false;save();render();toast('サンプルを消しました',before)};
const go=d=>{assignId=null;cur.setDate(cur.getDate()+d);render();scrollToFocus()};
$('prevDay').onclick=()=>go(-1);$('nextDay').onclick=()=>go(1);
$('todayBtn').onclick=()=>{cur=new Date();cur.setHours(0,0,0,0);render();scrollToFocus()};
function scrollToFocus(){
  const list=tasks();let m=isToday()?nowMin():(list.length?Math.min(...list.map(t=>t.start)):480);
  const y=$('grid').getBoundingClientRect().top+window.scrollY+(m/STEP)*ROW()-160;
  window.scrollTo({top:Math.max(0,y)});
}
render();scrollToFocus();
setInterval(()=>{if(isToday())render()},30000);
