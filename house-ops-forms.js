(function(){
"use strict";
const form=document.getElementById("opsEditorForm"),checkoutForm=document.getElementById("checkoutEditorForm");
if(!form&&!checkoutForm)return;
const $=id=>document.getElementById(id);
const E=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const N=n=>"NT$ "+Math.round(Number(n)||0).toLocaleString("zh-TW");
const key=s=>String(s||"").trim().replace(/[\s_－-]/g,"").replace(/[陜陕]/g,"陝").toUpperCase();
let session=null;
function isEditor(){
 const status=window.HouseOpsLive?.getStatus()||{};
 return status.mode==="online"&&status.role==="editor"&&!document.body.classList.contains("supervisor-view")&&new URLSearchParams(location.search).get("view")!=="supervisor";
}
function paintAccess(){
 const can=isEditor();
 document.body.classList.toggle("can-edit",can);
 for(const el of document.querySelectorAll(".ops-editor-submit"))el.disabled=!can;
 if($("opsEditorState"))$("opsEditorState").textContent=can?"已取得管理員編輯權限，可新增或修改帳務。":"此頁只有已登入 Firebase 並同步成功的管理員可修改；主管仍維持唯讀。";
 if($("checkoutEditorState"))$("checkoutEditorState").textContent=can?"已取得管理員編輯權限；儲存退租時會同時更新空房與退款帳務。":"僅已登入 Firebase 並同步成功的管理員可登記退租；主管維持唯讀。";
}
function note(id,message,error=false){
 const node=$(id);if(!node)return;node.textContent=message;node.classList.toggle("error",error);
}
function fill(form,values){
 for(const [name,value] of Object.entries(values)){
  const el=form.elements.namedItem(name);
  if(el)el.value=value==null?"":String(value);
 }
}
function values(form){
 return Object.fromEntries(new FormData(form).entries());
}
function paintAccounts(){
 if(!form||!session)return;
 const term=String($("opsEditorFilter").value||"").trim().toLowerCase();
 const rows=(session.ops.weekly_accounts||[]).filter(x=>x.kind==="vendor"&&!x.__deleted)
 .filter(x=>[x.party,x.property_label,x.description,x.id,x.settlement_date].join(" ").toLowerCase().includes(term))
 .sort((a,b)=>String(b.settlement_date).localeCompare(String(a.settlement_date))).slice(0,200);
 $("opsEditorRows").innerHTML=rows.map(r=>'<tr><td>'+E(r.settlement_date||"—")+'</td><td>'+E(r.party||"—")+'</td><td>'+E(r.property_label||"—")+'</td><td>'+E(r.description||"—")+'</td><td>'+N(r.amount)+'</td><td>'+E(r.status==="paid"?"已付款":"待付款")+'</td><td><button type="button" data-edit-ledger="'+E(r.id)+'">修改</button></td></tr>').join("")||'<tr><td colspan="7">沒有符合的帳務</td></tr>';
}
function editAccount(id){
 if(!session||!isEditor())return;
 form.reset();
 const r=(session.ops.weekly_accounts||[]).find(x=>x.id===id&&x.kind==="vendor");
 if(!r)return;
 const bank=(session.finance.accounts||[]).find(x=>x.id===r.id)||{};
 fill(form,{id:r.id,party:r.party,description:r.description,property_label:r.property_label,
 amount:r.amount,settlement_date:r.settlement_date,due_date:r.due_date,paid_date:r.paid_date,
 status:r.status,receipt_url:r.receipt_url,bank_code:bank.bank_code,bank_name:bank.bank_name,bank_account:bank.bank_account});
 note("opsEditorFeedback","正在修改 "+r.party+"｜"+r.description);
 form.scrollIntoView({behavior:"smooth",block:"center"});
}
function resetAccount(){
 if(!form)return;form.reset();fill(form,{id:"",status:"pending",settlement_date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"})});
 note("opsEditorFeedback","新增帳務：儲存後會同時出現在每週帳務與歷史帳務。");
}
function paintCheckouts(){
 if(!checkoutForm||!session)return;
 const term=String($("checkoutEditorFilter").value||"").trim().toLowerCase();
 const rows=(session.ops.checkouts||[])
 .filter(x=>[x.room,x.address,x.checkout_date,x.note].join(" ").toLowerCase().includes(term))
 .sort((a,b)=>String(b.checkout_date).localeCompare(String(a.checkout_date)))
 .slice(0,160);
 $("checkoutEditorRows").innerHTML=rows.map(r=>'<tr><td>'+E(r.checkout_date||"—")+'</td><td>'+E(r.room||"—")+'</td><td>'+N(r.refund_amount)+'</td><td>'+E(r.refund_status==="paid"?"已退款":r.refund_status==="no_refund"?"無應退款":"待退款")+'</td><td><button type="button" data-edit-checkout="'+E(r.id)+'">修改</button></td></tr>').join("")||'<tr><td colspan="5">沒有符合的退租紀錄</td></tr>';
}
function autofillRoom(){
 if(!checkoutForm||!session)return;
 const room=key(checkoutForm.elements.namedItem("room").value);
 const existing=[...(session.ops.rented||[]),...(session.ops.vacancies||[])].find(x=>key(x.room)===room);
 const historic=(session.ops.checkouts||[]).filter(x=>key(x.room)===room).sort((a,b)=>String(b.checkout_date).localeCompare(String(a.checkout_date)))[0];
 const record=existing||historic||{};
 const chosenDeposit=record.deposit??(Number(record.rent)>0?Number(record.rent)*2:null);
 for(const [name,val] of Object.entries({address:record.address,deposit:chosenDeposit,power_rate:record.power_rate})){
  const el=checkoutForm.elements.namedItem(name);
  if(el&&val!=null&&!el.value)el.value=val;
 }
 previewCheckout();
}
function previewCheckout(){
 if(!checkoutForm)return;
 try{
  const c=window.HouseOpsLive.calculateCheckout(values(checkoutForm));
  $("checkoutEditorPreview").textContent="電費 "+c.units+" 度 × "+c.rate+" 元 = "+N(c.electricityFee)+
   (c.creditMode==="credit"?"（加回）":"（扣除）")+"｜應退 "+N(c.refundAmount)+
   (c.owedAmount?"｜另需補繳 "+N(c.owedAmount):"");
  $("checkoutEditorPreview").classList.remove("error");
 }catch(e){
  $("checkoutEditorPreview").textContent=e.message||"請輸入押金與費用";
  $("checkoutEditorPreview").classList.add("error");
 }
}
function resetCheckout(){
 if(!checkoutForm)return;
 checkoutForm.reset();
 fill(checkoutForm,{id:"",checkout_date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}),
  electricity_mode:"deduct",power_rate:"5.5"});
 previewCheckout();
 note("checkoutEditorFeedback","新增退租：填入電表、押金及扣款項目，系統會計算退款；儲存後自動轉空房。");
}
function editCheckout(id){
 if(!session||!isEditor())return;
 const r=(session.ops.checkouts||[]).find(x=>x.id===id);if(!r)return;
 checkoutForm.reset();
 const weekly=(session.ops.weekly_accounts||[]).find(x=>x.kind==="refund"&&
 (x.id===r.id.replace(/^checkout-/,"refund-")||(x.property_label===r.room&&x.settlement_date===r.checkout_date)))||{};
 const bank=(session.finance.accounts||[]).find(x=>x.id===weekly.id)||{};
 fill(checkoutForm,{id:r.id,room:r.room,address:r.address,party:weekly.party,checkout_date:r.checkout_date,
  refund_due_date:r.refund_due_date,deposit:r.deposit,
  meter_previous:r.meter_previous,meter_current:r.meter_current,
  electricity_usage:r.electricity_usage,power_rate:r.power_rate||5.5,
  electricity_mode:r.electricity_credit_direction==="add_to_deposit"?"credit":"deduct",
  penalty:r.early_termination_penalty,cleaning:r.cleaning_fee,unpaid_rent:r.unpaid_rent,
  other_charge:r.other_charge,overpaid:r.overpaid,other_credit:r.other_credit,
  bank_code:bank.bank_code,bank_name:bank.bank_name,bank_account:bank.bank_account,note:r.note});
 note("checkoutEditorFeedback","正在修改歷史退租："+r.room+"（"+r.checkout_date+"）。若退款金額變動，原已付款狀態將改為待重新核對。");
 previewCheckout();
 checkoutForm.scrollIntoView({behavior:"smooth",block:"start"});
}
function setSession(next){
 session=next;
 paintAccess();paintAccounts();paintCheckouts();
}
window.HouseOpsForms={setSession,paintAccess};
window.addEventListener("house-ops-live-state",paintAccess);
if(form){
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(!isEditor())return note("opsEditorFeedback","尚未取得管理員雲端編輯權限",true);
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  note("opsEditorFeedback","正在儲存加密帳務至 Firebase…");
  try{
   await HouseOpsLive.saveAccount(values(form));
   note("opsEditorFeedback","帳務已同步儲存，主管與其他裝置可以查看最新結果。");
   paintAccounts();
  }catch(err){note("opsEditorFeedback",err.message||"儲存失敗",true)}
  finally{paintAccess()}
 });
 $("opsEditorRows").addEventListener("click",e=>{const b=e.target.closest("[data-edit-ledger]");if(b)editAccount(b.dataset.editLedger)});
 $("opsEditorReset").addEventListener("click",resetAccount);
 $("opsEditorFilter").addEventListener("input",paintAccounts);
 resetAccount();
}
if(checkoutForm){
 checkoutForm.addEventListener("input",previewCheckout);
 checkoutForm.addEventListener("change",previewCheckout);
 checkoutForm.elements.namedItem("room").addEventListener("change",autofillRoom);
 checkoutForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!isEditor())return note("checkoutEditorFeedback","尚未取得管理員雲端編輯權限",true);
  const button=checkoutForm.querySelector('button[type="submit"]');button.disabled=true;
  note("checkoutEditorFeedback","正在加密儲存退租、退款帳務與空房狀態…");
  try{
   await HouseOpsLive.saveCheckout(values(checkoutForm));
   note("checkoutEditorFeedback","退租已儲存：退款金額、週帳與空房已同步更新。");
   paintCheckouts();
  }catch(err){note("checkoutEditorFeedback",err.message||"儲存失敗",true)}
  finally{paintAccess()}
 });
 $("checkoutEditorRows").addEventListener("click",e=>{const b=e.target.closest("[data-edit-checkout]");if(b)editCheckout(b.dataset.editCheckout)});
 $("checkoutEditorReset").addEventListener("click",resetCheckout);
 $("checkoutEditorFilter").addEventListener("input",paintCheckouts);
 resetCheckout();
}
paintAccess();
})();