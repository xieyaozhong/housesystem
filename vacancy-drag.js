(function(){
"use strict";
// Mobile-first, pointer-based sorting: touch drag on iPhone, mouse drag on
// desktop and arrow keys for keyboard accessibility. Only a verified editor
// may persist ordering; all other devices receive the encrypted cloud result.
const cards=document.getElementById("cards");
const search=document.getElementById("q");
const feedback=document.getElementById("cardOrderFeedback");
if(!cards||!search||!feedback)return;
let gesture=null,saving=false;
const entries=()=>Array.from(cards.querySelectorAll("article[data-vacancy-room]"));
const names=()=>entries().map(card=>card.dataset.vacancyRoom);
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
function editor(){
 const s=window.HouseOpsLive?.getStatus()||{};
 return s.mode==="online"&&s.role==="editor"&&
  document.body.classList.contains("can-edit")&&
  !document.body.classList.contains("supervisor-view")&&
  new URLSearchParams(location.search).get("view")!=="supervisor";
}
function report(message,error=false){
 feedback.textContent=message;
 feedback.classList.toggle("error",error);
}
function restore(original){
 const byRoom=new Map(entries().map(node=>[node.dataset.vacancyRoom,node]));
 for(const name of original){
  const node=byRoom.get(name);
  if(node)cards.appendChild(node);
 }
}
async function commit(original){
 const order=names();
 if(same(order,original))return;
 if(!editor()||search.value.trim()){
  restore(original);
  report("排序未儲存：僅管理員可在清除搜尋條件後調整。",true);
  return;
 }
 saving=true;
 report("正在將卡片順序加密同步到所有裝置…");
 try{
  await window.HouseOpsLive.saveVacancyOrder(order);
  report("已同步卡片順序；主管與其他裝置會顯示相同順序。");
 }catch(error){
  restore(original);
  report(error?.message||"儲存排序失敗，已恢復先前順序。",true);
 }finally{
  saving=false;
 }
}
cards.addEventListener("pointerdown",event=>{
 const handle=event.target.closest(".card-drag-handle");
 if(!handle||event.button!==0||gesture||saving)return;
 if(!editor()){report("請以管理員身分登入並完成同步後再排序。",true);return}
 if(search.value.trim()){report("請先清除搜尋字詞，再拖曳全部空房卡片排序。",true);return}
 const card=handle.closest("article[data-vacancy-room]");
 if(!card||entries().length<2)return;
 event.preventDefault();
 gesture={pointerId:event.pointerId,handle,card,startX:event.clientX,
  startY:event.clientY,original:names(),moved:false};
 if(handle.setPointerCapture)handle.setPointerCapture(event.pointerId);
});
cards.addEventListener("pointermove",event=>{
 const g=gesture;
 if(!g||event.pointerId!==g.pointerId)return;
 if(!g.moved&&Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<7)return;
 g.moved=true;
 g.card.classList.add("card-dragging");
 cards.classList.add("cards-reordering");
 const hovered=document.elementFromPoint(event.clientX,event.clientY);
 const target=hovered?.closest?.("article[data-vacancy-room]");
 if(!target||target===g.card||target.parentElement!==cards)return;
 const r=target.getBoundingClientRect();
 const before=Math.abs(event.clientY-(r.top+r.height/2))<r.height/3?
  event.clientX<r.left+r.width/2:event.clientY<r.top+r.height/2;
 cards.insertBefore(g.card,before?target:target.nextSibling);
});
function finish(event,cancelled=false){
 const g=gesture;
 if(!g||event.pointerId!==g.pointerId)return;
 gesture=null;
 g.card.classList.remove("card-dragging");
 cards.classList.remove("cards-reordering");
 try{if(g.handle.hasPointerCapture?.(g.pointerId))g.handle.releasePointerCapture(g.pointerId)}catch(_){}
 if(cancelled){restore(g.original);report("已取消調整卡片順序。");return}
 if(g.moved)commit(g.original);
}
cards.addEventListener("pointerup",event=>finish(event));
cards.addEventListener("pointercancel",event=>finish(event,true));
cards.addEventListener("lostpointercapture",event=>{
 if(gesture&&event.pointerId===gesture.pointerId)finish(event,true);
});
cards.addEventListener("keydown",event=>{
 const handle=event.target.closest(".card-drag-handle");
 if(!handle||!["ArrowUp","ArrowDown"].includes(event.key))return;
 if(!editor()||saving||search.value.trim())return;
 const original=names(),list=entries(),index=list.indexOf(handle.closest("article[data-vacancy-room]"));
 const shift=event.key==="ArrowUp"?-1:1;
 if(index<0||index+shift<0||index+shift>=list.length)return;
 event.preventDefault();
 const card=list[index],target=list[index+shift];
 cards.insertBefore(card,shift<0?target:target.nextSibling);
 handle.focus();
 commit(original);
});
window.HouseVacancyDrag={isSorting:()=>Boolean(gesture)||saving};
})();