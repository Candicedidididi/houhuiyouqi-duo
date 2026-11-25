import { round1, round2, pairs, finalChoices, profile } from './content.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';

const root = document.querySelector('#app');
const cfg = window.APP_CONFIG || {};
let db, room = null, status = null, view = 'home', draft = [], question = 0, busy = false, pendingInvite = null, timer;
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (label, action, extra = '') => `<button type="button" class="button ${extra}" data-action="${action}">${label}</button>`;
const header = () => `<div class="header"><span class="brand">✳ &nbsp;后会友期 · 友情手账</span><button type="button" class="button secondary small" data-action="rooms">我的房间</button></div>`;
const foot = `<div class="footer">为相遇留一页 · 答案没有标准解</div>`;
const layout = body => { root.innerHTML = header() + body + foot; };
function toast(text){ const x=document.createElement('div'); x.className='toast'; x.textContent=text; document.body.append(x); setTimeout(()=>x.remove(),2500); }
function showError(e){ const message=e?.message || String(e); const el=document.querySelector('#error'); if(el){el.hidden=false;el.textContent=message;} else toast(message); }
function errorBox(){return '<div id="error" class="error" hidden></div>';}
function showErrorBox(e){const el=document.querySelector('#error');if(el){el.hidden=false;el.textContent=e?.message||String(e);}else showError(e);}
async function rpc(name, params={}){const {data,error}=await db.rpc(name,params);if(error) throw error;return data;}
async function init(){
 const fragment=new URLSearchParams(location.hash.slice(1));
 if(fragment.has('invite') && fragment.has('room')) {pendingInvite={room:fragment.get('room'),token:fragment.get('invite')}; history.replaceState(null,'',location.pathname+location.search);}
 if(!/^https:\/\//.test(cfg.SUPABASE_URL||'') || !cfg.SUPABASE_ANON_KEY || /service_role|secret/i.test(cfg.SUPABASE_ANON_KEY)) { view='setup';render();return; }
 try {
  db=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const {data,error}=await db.auth.getSession(); if(error) throw error;
  if(!data.session){const result=await db.auth.signInAnonymously(); if(result.error) throw result.error;}
  timer=setInterval(async()=>{if(room && ['room','waiting','result1','result2','finalResult'].includes(view) && !busy){try{const before=JSON.stringify(status);await refresh();if(JSON.stringify(status)!==before)render();}catch(e){showErrorBox(e);}}},6000);
  if(pendingInvite){view='joining';render();try{const result=await rpc('duo_join',{p_room:pendingInvite.room,p_token:pendingInvite.token}); room=result.room_id;pendingInvite=null;await refresh();view='room';}catch(e){pendingInvite=null;view='joinError';render();showErrorBox(e);return;}}
  else view='home';
  render();
 }catch(e){view='bootError';render();showErrorBox(e);}
}
async function refresh(){status=await rpc('duo_status',{p_room:room});}
function render(){
 if(view==='setup'){layout(`<div class="card"><span class="eyebrow">还差一步</span><h2 class="title">先连接友情手账</h2><p class="description">请按 README 配置 Supabase 的公开 URL 与 anon key，开启匿名登录并执行 SQL。当前没有连接后端。</p></div>`);return;}
 if(view==='joining'){layout('<div class="card center"><div class="wait-icon">✉️</div><h2 class="title">正在接住邀请</h2><p class="note">请稍候，不要关闭页面。</p></div>');return;}
 if(view==='bootError' || view==='joinError'){layout(`<div class="card"><h2 class="title">${view==='joinError'?'这封邀请没能打开':'暂时连不上手账'}</h2><p class="description">${view==='joinError'?'邀请可能已被使用、失效，或你正在用房主身份打开。请让朋友重新生成邀请；如果原来的参与者已绑定，可在同一浏览器的「我的房间」继续。':'检查网络、Supabase 配置和匿名登录设置，再刷新重试。'}</p>${errorBox()}${button('返回首页','home','secondary')}</div>`);return;}
 if(view==='home'){layout(`<section class="hero"><span class="tag">后 会 友 期 · 友 情 手 账</span><h1>测测咱是<br><span class="accent">后会友期</span>的<br>哪一对？</h1><p class="subtitle">给彼此一点时间，也给友情一个<br>重新认识的机会。</p><div class="dots"><span class="dot">🪁</span><span class="dot">⛵</span><span class="dot">🍊</span><span class="dot">🌙</span></div></section><div class="rule-list"><div class="rule"><span>第一章 · 我们的相处方式</span><b>12 道小题</b></div><div class="rule"><span>第二章 · 遇见不同情境</span><b>5 个瞬间</b></div><div class="rule"><span>最后 · 给友情一个选择</span><b>两人终选</b></div></div><div class="stack">${button('开启我们的手账','create')}${button('继续已有手账','rooms','secondary')}</div><p class="note center">每阶段双方提交后，该阶段逐题答案或终选对双方可见。<br>房间 7 天后停止内容访问，数据不会因此自动删除。<br>仅供趣味交流，不是心理测评或节目官方测试。</p>${errorBox()}`);return;}
 if(view==='rooms'){layout(`<div class="card"><span class="eyebrow">YOUR JOURNALS</span><h2 class="title">我的友情手账</h2><p class="description">仅显示当前浏览器匿名身份参与的房间。清除浏览器数据或更换设备后身份可能无法找回。</p><div id="room-list" class="stack"><span class="note">正在查找…</span></div>${errorBox()}</div>${button('返回首页','home','secondary')}`);loadRooms();return;}
 if(!status){layout('<div class="card">正在打开房间…</div>');return;}
 if(status.expired){layout(`<div class="card center"><div class="wait-icon">⌛</div><h2 class="title">这页手账已过期</h2><p class="description">房间自创建起 7 天后不能继续访问；过期不代表数据已自动删除。可以和朋友重新开始。</p></div>${button('返回首页','home')}`);return;}
 if(view==='room' || view==='waiting') {renderRoom();return;}
 if(view==='r1' || view==='r2' || view==='final'){renderQuestion();return;}
 if(view==='result1'){renderResult1();return;}
 if(view==='result2'){renderResult2();return;}
 if(view==='finalResult'){renderFinal();}
}
async function loadRooms(){try{const rooms=await rpc('duo_rooms');if(view!=='rooms')return;document.querySelector('#room-list').innerHTML=rooms.length?rooms.map(r=>`<button class="option" data-action="open-room" data-id="${h(r.id)}"><span class="letter">✳</span><span>${r.expired?'已过期':r.joined?'双方已加入':'等待朋友加入'}<br><small class="muted">创建于 ${h(new Date(r.created_at).toLocaleDateString('zh-CN'))}</small></span></button>`).join(''):'<p class="note">这里还没有手账，先创建一本吧。</p>'; }catch(e){showErrorBox(e);}}
function renderRoom(){
 let content='';
 if(!status.joined){content=`<div class="wait-icon">✉️</div><h2 class="title">把这页留给朋友</h2><p class="description">邀请链接只能绑定一位朋友，有效期到 ${h(new Date(status.expires_at).toLocaleString('zh-CN'))}。发送给信任的人，任何拿到链接的人都可能抢先加入。</p>${status.owner?button('生成并复制邀请链接','invite'):'<p class="note">等待房主邀请。</p>'}<div id="invite-link"></div>`;}
 else if(!status.my_r1){content=`<span class="eyebrow">CHAPTER 01</span><h2 class="title">先认识你自己</h2><p class="description">12 道关于节奏和表达的小题。双方提交后一起解锁结果。</p>${button('开始第一轮','start-r1')}`;}
 else if(!status.r1_ready){content=`<div class="wait-icon">🕰️</div><h2 class="title">你的答案已收好</h2><p class="description">${status.joined?'等朋友完成第一轮，页面每 6 秒查看一次状态。':'等待朋友加入并答题。'}你可以离开，之后用同一浏览器回来。</p>${button('刷新状态','refresh','secondary')}`;}
 else if(!status.my_r2){content=`<span class="eyebrow">FIRST REVEAL</span><h2 class="title">你们的第一章<br>已经揭晓</h2><p class="description">两份答案都收到了，来看看你们的友情画像吧。</p>${button('查看第一轮结果','result1')}`;}
 else if(!status.r2_ready){content=`<div class="wait-icon">🍊</div><h2 class="title">情境答案已收好</h2><p class="description">等朋友完成这一轮；不必守在页面，稍后用同一浏览器回来即可。</p>${button('刷新状态','refresh','secondary')}`;}
 else if(status.my_final===null){content=`<span class="eyebrow">SECOND REVEAL</span><h2 class="title">那些不同的瞬间</h2><p class="description">两人已完成情境题，一起看看你们的选择。</p>${button('查看情境结果','result2')}`;}
 else if(!status.final_ready){content=`<div class="wait-icon">🌙</div><h2 class="title">最后的选择已收好</h2><p class="description">等待朋友完成终选。页面会定时查看状态。</p>${button('刷新状态','refresh','secondary')}`;}
 else {content=`<span class="eyebrow">THE LAST PAGE</span><h2 class="title">最后一页，<br>已经写好</h2><p class="description">不必一样，也能一起走很远。</p>${button('查看双人终选','finalResult')}${button('回看第一轮','result1','secondary')}`;}
 layout(`<div class="card center">${content}${errorBox()}</div><p class="note center">每阶段双方提交后，该阶段逐题答案或终选对双方可见。<br>房间 7 天后停止内容访问，数据不会因此自动删除；请保留此浏览器数据。<br>树洞功能尚未开放，不收集留言。</p>`);
}
function renderQuestion(){
 const isFinal=view==='final', qs=view==='r1'?round1:view==='r2'?round2[status.pair_index]:[['未来的友情，你最想珍惜哪种模样？',...finalChoices]], q=qs[question], len=qs.length;
 layout(`<span class="eyebrow">${view==='r1'?'CHAPTER 01':view==='r2'?'CHAPTER 02':'THE LAST PAGE'} · ${String(question+1).padStart(2,'0')} / ${String(len).padStart(2,'0')}</span><div class="progress"><i style="width:${(question+1)/len*100}%"></i></div><div class="card"><div class="label">${view==='r2'?h(pairs[status.pair_index].topic):isFinal?'只选你此刻最想珍惜的':'选择更接近自己的一个'}</div><h2 class="title">${h(q[0])}</h2><div class="stack">${q.slice(1).map((opt,i)=>`<button class="option ${draft[question]===i?'selected':''}" data-action="choose" data-index="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${h(opt)}</span></button>`).join('')}</div></div><div class="steps">${question>0?button('上一题','previous','secondary'):button('返回房间','back','secondary')}${button(question===len-1?'提交答案':'下一题','next')}</div><p class="note center">双方提交本阶段后，逐题答案或终选对双方可见。提交后不可修改。<br>未提交的选择只在当前页面内存中；刷新会清空。</p>${errorBox()}`);
}
function renderResult1(){if(!status.r1_ready){view='room';render();return;} const p=pairs[status.pair_index];layout(`<div class="card center"><span class="eyebrow">OUR FRIENDSHIP</span><div class="wait-icon">✳️</div><h2 class="title">${h(p.name)}</h2><p class="description">${h(p.caption)}</p><div class="badge">${h(p.topic)}</div><p class="description">${h(p.detail)}</p></div><div class="card"><div class="result-block"><div class="label">你的画像</div><strong>${h(profile(status.my_r1))}</strong></div><div class="result-block"><div class="label">朋友的画像</div><strong>${h(profile(status.other_r1))}</strong></div><p class="note">每人前 6 题观察节奏、后 6 题观察表达；各维度 B 至少 3 次归为后一类，平局也归后一类。组合结果以两人各维度 B 总数至少 6 次为后一类，平局同理。不是亲密度评分。</p></div><div class="stack">${!status.my_r2?button('进入情境题','start-r2'):button('返回房间','back')}${button('返回房间','back','secondary')}</div>`);}
function renderResult2(){if(!status.r2_ready){view='room';render();return;} const qs=round2[status.pair_index];layout(`<span class="eyebrow">CHAPTER 02 · REVEAL</span><h2 class="title">我们的情境手账</h2><p class="description">选择不同，不代表谁更在乎。好奇地听听对方的理由吧。</p><div class="card">${qs.map((q,i)=>`<div class="result-block"><strong>${i+1}. ${h(q[0])}</strong><div class="note">我：${h(q[1+status.my_r2[i]])}<br>朋友：${h(q[1+status.other_r2[i]])}</div></div>`).join('')}</div><div class="stack">${status.my_final===null?button('前往两人终选','start-final'):button('返回房间','back')}${button('返回房间','back','secondary')}</div>`);}
function renderFinal(){if(!status.final_ready){view='room';render();return;}layout(`<div class="card center"><span class="eyebrow">TO BE CONTINUED</span><div class="wait-icon">💌</div><h2 class="title">友情没有标准答案</h2><p class="description">你们为未来留下的两个小小愿望：</p><div class="result-block"><div class="label">我的选择</div><strong>${h(finalChoices[status.my_final])}</strong></div><div class="result-block"><div class="label">朋友的选择</div><strong>${h(finalChoices[status.other_final])}</strong></div><p class="note">相同可以一起庆祝，不同也值得慢慢了解。</p></div>${button('回到房间','back','secondary')}`);}
root.addEventListener('click',async e=>{const t=e.target.closest('[data-action]');if(!t || busy)return;const action=t.dataset.action;
 try{
  if(action==='home'){room=null;status=null;view='home';render();return;}
  if(action==='rooms'){view='rooms';render();return;}
  if(action==='create'){busy=true;const data=await rpc('duo_create');room=data.room_id;await refresh();view='room';render();displayInvite(data.invite);return;}
  if(action==='open-room'){busy=true;room=t.dataset.id;await refresh();view='room';render();return;}
  if(action==='invite'){busy=true;const data=await rpc('duo_invite',{p_room:room});displayInvite(data.invite);return;}
  if(action==='refresh'){busy=true;await refresh();view='room';render();return;}
  if(action==='back'){view='room';render();return;}
  if(['result1','result2','finalResult'].includes(action)){view=action;render();return;}
  if(action.startsWith('start-')){view=action==='start-r1'?'r1':action==='start-r2'?'r2':'final';draft=[];question=0;render();return;}
  if(action==='choose'){draft[question]=Number(t.dataset.index);render();return;}
  if(action==='previous'){question--;render();return;}
  if(action==='next'){if(draft[question]===undefined){toast('请先选择一项');return;}const len=view==='r1'?12:view==='r2'?5:1;if(question<len-1){question++;render();return;} busy=true;await rpc('duo_submit',{p_room:room,p_stage:view==='final'?'final':view,p_answers:draft});draft=[];await refresh();view='room';render();return;}
 }catch(err){showErrorBox(err);}finally{busy=false;}
});
function displayInvite(token){const link=new URL(location.href);link.hash=new URLSearchParams({room,invite:token}).toString();const box=document.querySelector('#invite-link');if(!box)return;box.innerHTML=`<p class="note">仅发给一位信任的朋友；重新生成会使旧链接失效。</p><div class="linkbox">${h(link.href)}</div><p class="note">请长按复制链接发送。不要将邀请链接公开发布。</p>`; if(navigator.clipboard?.writeText) navigator.clipboard.writeText(link.href).then(()=>toast('邀请链接已复制')).catch(()=>{});}
init();
