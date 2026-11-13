(function(){
"use strict";
const form=document.getElementById("opsEditorForm"),checkoutForm=document.getElementById("checkoutEditorForm"),pettyForm=document.getElementById("pettyEditorForm");
if(!form&&!checkoutForm&&!pettyForm)return;
const $=id=>document.getElementById(id);
const E=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const N=n=>"NT$ "+Math.round(Number(n)||0).toLocaleString("zh-TW");
const key=s=>String(s||"").trim().replace(/[\s_－-]/g,"").replace(/[陜陕]/g,"陝").toUpperCase();
let session=null;
const masterSearch=window.HousePropertyLookup;
const choiceLists={room:[],address:[]};
const field=name=>checkoutForm?.elements.namedItem(name);
const listNode=name=>$(name==="room"?"checkoutRoomMatches":"checkoutAddressMatches");
function hideMasterChoices(){
 for(const name of ["room","address"]){
  const node=listNode(name);if(node){node.hidden=true;node.innerHTML=""}
  choiceLists[name]=[];
 }
}
function masterHint(){
 if(!checkoutForm||!masterSearch)return;
 const room=field("room").value.trim(),address=field("address").value.trim();
 const hint=$("checkoutMasterHint");if(!hint)return;
 const matches=room&&session?masterSearch.byRoom(session,room).filter(r=>r.source==="master"||r.id):[];
 const matched=matches.find(x=>String(x.id)===field("master_id").value)||matches[0];
 hint.classList.remove("error");
 if(!room){
  hint.textContent="輸入套房名稱或地址，即時搜尋物件主檔並選擇正確房間。";
 }else if(matched){
  if(address&&matched.address&&masterSearch.norm(address)!==masterSearch.norm(matched.address)){
   hint.textContent="這個套房名稱已存在於主檔，但地址不同。儲存退租前將要求確認更新原主檔地址，不會建立重複房號。";
  }else hint.textContent="已對應主檔："+matched.code+"｜"+(matched.address||"地址尚未建立");
 }else if(address){
  hint.textContent="主檔尚無此套房。確認退租時可同時新增「"+room+"｜"+address+"」到物件主檔。";
 }else{
  hint.textContent="主檔查無此套房，請填寫地址；儲存退租時會建立新的主檔物件。";
 }
}
function showMasterChoices(name){
 if(!checkoutForm||!masterSearch||!session||!isEditor())return hideMasterChoices();
 const input=field(name),node=listNode(name);
 if(!input||!node)return;
 const word=input.value.trim(),matches=word?masterSearch.search(session,word,12):[];
 choiceLists[name]=matches;
 node.innerHTML=matches.map((item,i)=>
  '<button type="button" role="option" data-property-index="'+i+'"><b>'+E(item.code)+
  '</b><small>'+E(item.address||"主檔尚未填地址")+(item.id?"｜主檔 #"+E(item.id):"｜既有房務紀錄")+'</small></button>'
 ).join("");
 node.hidden=!matches.length;
 listNode(name==="room"?"address":"room").hidden=true;
}
function updateCheckoutPowerBilling(){
 if(!checkoutForm)return;
 const taipower=field("power_billing").value==="taipower";
 $("checkoutPowerRateLabel").hidden=taipower;
 $("checkoutTaipowerFeeLabel").hidden=!taipower;
 field("power_rate").disabled=taipower;
 field("actual_electricity_fee").disabled=!taipower;
}
function setPropertyPower(item){
 if(!item)return;
 if(item.power_billing==="taipower"){
  field("power_billing").value="taipower";
  field("power_rate").value="";
 }else if(item.power_billing==="fixed"||item.power_rate!=null){
  field("power_billing").value="fixed";
  if(item.power_rate!=null)field("power_rate").value=item.power_rate;
 }
 updateCheckoutPowerBilling();
}
function chooseMaster(item){
 if(!checkoutForm||!item)return;
 fill(checkoutForm,{room:item.code,address:item.address,master_id:item.id||""});
 if(item.deposit!=null&&!field("deposit").value)field("deposit").value=item.deposit;
 setPropertyPower(item);
 hideMasterChoices();masterHint();previewCheckout();
 field("room").focus();
}
function linkExistingMaster(){
 if(!checkoutForm||!session||!masterSearch)return;
 const room=field("room").value.trim(),options=room?masterSearch.byRoom(session,room).filter(x=>x.source==="master"||x.id):[];
 const selected=options.find(x=>masterSearch.norm(x.address)===masterSearch.norm(field("address").value))||options[0];
 if(selected){
  field("master_id").value=String(selected.id);
  if(!field("address").value&&selected.address)field("address").value=selected.address;
  if(!field("deposit").value&&selected.deposit!=null)field("deposit").value=selected.deposit;
  setPropertyPower(selected);
 }else field("master_id").value="";
 masterHint();
}

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
 if($("pettyEditorState"))$("pettyEditorState").textContent=can?"已取得管理員編輯權限，可新增及修改代管備用金。":"主管為唯讀；請在管理員手機登入 Firebase 並完成同步。";
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
function checkoutDeductions(){
 const root=$("checkoutDeductionRows");
 if(!root)return[];
 return [...root.querySelectorAll(".checkout-deduction-row")].map(row=>({
  label:row.querySelector("[data-deduction-label]")?.value||"",
  amount:row.querySelector("[data-deduction-amount]")?.value||""
 }));
}
function addCheckoutDeduction(item={}){
 const root=$("checkoutDeductionRows");
 if(!root)return;
 if(root.children.length>=30){note("checkoutEditorFeedback","其他扣款最多新增 30 筆",true);return}
 const row=document.createElement("div");
 row.className="checkout-deduction-row";
 row.innerHTML='<label>扣款名目<input type="text" data-deduction-label maxlength="80" placeholder="例：水費、瓦斯費" aria-label="其他扣款名目"></label>'+
  '<label>扣款金額<input type="number" data-deduction-amount min="1" step="1" placeholder="金額" inputmode="numeric" aria-label="其他扣款金額"></label>'+
  '<button type="button" class="checkout-deduction-remove" data-remove-deduction aria-label="移除這筆扣款">移除</button>';
 row.querySelector("[data-deduction-label]").value=String(item.label??"");
 row.querySelector("[data-deduction-amount]").value=String(item.amount??"");
 root.appendChild(row);
 $("checkoutDeductionAdd").disabled=root.children.length>=30;
}
function loadCheckoutDeductions(items){
 const root=$("checkoutDeductionRows");if(!root)return;
 root.replaceChildren();
 for(const item of Array.isArray(items)?items:[])addCheckoutDeduction(item);
 $("checkoutDeductionAdd").disabled=root.children.length>=30;
}
function values(form){
 const data=Object.fromEntries(new FormData(form).entries());
 if(form===checkoutForm)data.deduction_items=checkoutDeductions();
 return data;
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
 linkExistingMaster();
 const room=key(checkoutForm.elements.namedItem("room").value);
 const existing=[...(session.ops.rented||[]),...(session.ops.vacancies||[])].find(x=>key(x.room)===room);
 const historic=(session.ops.checkouts||[]).filter(x=>key(x.room)===room).sort((a,b)=>String(b.checkout_date).localeCompare(String(a.checkout_date)))[0];
 const record=existing||historic||{};
 const chosenDeposit=record.deposit??(Number(record.rent)>0?Number(record.rent)*2:null);
 for(const [name,val] of Object.entries({address:record.address,deposit:chosenDeposit})){
  const el=checkoutForm.elements.namedItem(name);
  if(el&&val!=null&&!el.value)el.value=val;
 }
 if(record.power_billing||record.power_rate!=null)setPropertyPower(record);
 masterHint();previewCheckout();
}
function previewCheckout(){
 if(!checkoutForm)return;
 try{
  const c=window.HouseOpsLive.calculateCheckout(values(checkoutForm));
  $("checkoutEditorPreview").textContent="退款算法："+window.HouseOpsLive.refundFormula(c)+
   "｜"+(c.powerBilling==="taipower"?"台電帳單實際電費 "+N(c.electricityFee):
   "電費 "+c.units+" 度 × "+c.rate+" 元＝"+N(c.electricityFee));
  $("checkoutEditorPreview").classList.remove("error");
 }catch(e){
  $("checkoutEditorPreview").textContent=e.message||"請輸入押金與費用";
  $("checkoutEditorPreview").classList.add("error");
 }
}
function resetCheckout(){
 if(!checkoutForm)return;
 checkoutForm.reset();
 loadCheckoutDeductions([]);
 fill(checkoutForm,{id:"",checkout_date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}),
  electricity_mode:"deduct",power_billing:"fixed",power_rate:"5.5",actual_electricity_fee:""});
 updateCheckoutPowerBilling();
 field("master_id").value="";hideMasterChoices();masterHint();previewCheckout();
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
  electricity_usage:r.electricity_usage,power_rate:r.power_rate??5.5,
  power_billing:r.power_billing||"fixed",
  actual_electricity_fee:r.power_billing==="taipower"?(r.actual_electricity_fee??r.electricity_fee):"",
  electricity_mode:r.electricity_credit_direction==="add_to_deposit"?"credit":"deduct",
  penalty:r.early_termination_penalty,cleaning:r.cleaning_fee,unpaid_rent:r.unpaid_rent,
  other_charge:r.other_charge,overpaid:r.overpaid,other_credit:r.other_credit,
  bank_code:bank.bank_code,bank_name:bank.bank_name,bank_account:bank.bank_account,note:r.note});
 loadCheckoutDeductions(r.deduction_items||[]);
 field("master_id").value=r.master_id||"";linkExistingMaster();hideMasterChoices();
 field("power_billing").value=r.power_billing||"fixed";
 if(r.power_billing==="taipower")field("actual_electricity_fee").value=r.actual_electricity_fee??r.electricity_fee??"";
 updateCheckoutPowerBilling();
 note("checkoutEditorFeedback","正在修改歷史退租："+r.room+"（"+r.checkout_date+"）。若退款金額變動，原已付款狀態將改為待重新核對。");
 previewCheckout();
 checkoutForm.scrollIntoView({behavior:"smooth",block:"start"});
}
function paintPetty(){
 if(!pettyForm||!session)return;
 const term=$("pettyEditorFilter").value.trim().toLowerCase();
 const rows=(window.HOUSE_PETTY_CASH_DATA?.entries||[]).filter(r=>
  [r.manager,r.item,r.date,r.id].join(" ").toLowerCase().includes(term))
  .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,200);
 const names={fund:"零用金入帳",petty_expense:"零用金支出",advance:"代墊",advance_repaid:"代墊歸還"};
 $("pettyEditorRows").innerHTML=rows.map(r=>'<tr><td>'+E(r.date)+'</td><td>'+E(r.manager)+'</td><td>'+E(names[r.kind]||r.kind)+'</td><td>'+E(r.item)+'</td><td>'+N(r.amount)+'</td><td>'+E(r.status==="void"?"作廢":"有效")+'</td><td><button type="button" data-edit-petty="'+E(r.id)+'">修改</button></td></tr>').join("")||'<tr><td colspan="7">沒有符合的紀錄</td></tr>';
}
function resetPetty(){
 if(!pettyForm)return;pettyForm.reset();fill(pettyForm,{
  id:"",date:new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}),
  kind:"fund",status:"active"
 });
 note("pettyEditorFeedback","新增代管備用金：儲存後會更新本期與歷史統計。");
}
function editPetty(id){
 if(!isEditor())return;
 const r=(window.HOUSE_PETTY_CASH_DATA?.entries||[]).find(x=>x.id===id);
 if(!r)return;
 pettyForm.reset();fill(pettyForm,r);
 note("pettyEditorFeedback","正在修改 "+r.manager+"｜"+r.item);
 pettyForm.scrollIntoView({behavior:"smooth",block:"start"});
}
function setSession(next){
 session=next;
 paintAccess();paintAccounts();paintCheckouts();paintPetty();masterHint();
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
 $("checkoutDeductionAdd").addEventListener("click",()=>{
  addCheckoutDeduction();
  $("checkoutDeductionRows").lastElementChild?.querySelector("[data-deduction-label]")?.focus();
  previewCheckout();
 });
 $("checkoutDeductionRows").addEventListener("click",event=>{
  const button=event.target.closest("[data-remove-deduction]");
  if(!button)return;
  button.closest(".checkout-deduction-row")?.remove();
  $("checkoutDeductionAdd").disabled=false;
  previewCheckout();
 });
 field("power_billing").addEventListener("change",()=>{
  updateCheckoutPowerBilling();previewCheckout();
 });
 for(const name of ["room","address"]){
  const input=field(name),node=listNode(name);
  input.addEventListener("input",()=>{
   field("master_id").value="";
   showMasterChoices(name);masterHint();
  });
  input.addEventListener("focus",()=>showMasterChoices(name));
  input.addEventListener("keydown",event=>{
   if(event.key==="ArrowDown"&&!node.hidden){
    event.preventDefault();node.querySelector("button")?.focus();
   }else if(event.key==="Escape")hideMasterChoices();
  });
  node.addEventListener("keydown",event=>{
   if(event.key==="Escape"){event.preventDefault();hideMasterChoices();input.focus()}
  });
  node.addEventListener("click",event=>{
   const btn=event.target.closest("button[data-property-index]");
   if(btn)chooseMaster(choiceLists[name][Number(btn.dataset.propertyIndex)]);
  });
 }
 document.addEventListener("click",event=>{
  if(!event.target.closest("#checkoutEditorForm .property-picker-field"))hideMasterChoices();
 });
 checkoutForm.addEventListener("input",previewCheckout);
 checkoutForm.addEventListener("change",previewCheckout);
 checkoutForm.elements.namedItem("room").addEventListener("change",()=>{
  if(!field("master_id").value)autofillRoom();
 });
 field("address").addEventListener("change",masterHint);
 checkoutForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!isEditor())return note("checkoutEditorFeedback","尚未取得管理員雲端編輯權限",true);
  const input=values(checkoutForm);
  const match=masterSearch?.byRoom(session,input.room).find(x=>x.source==="master"||x.id);
  if(!match&&!window.confirm("這個套房不在主檔中，確認新增「"+input.room+"｜"+input.address+"」到物件主檔並辦理退租？"))return;
  if(match&&input.address&&match.address&&masterSearch.norm(input.address)!==masterSearch.norm(match.address)&&
   !window.confirm("確認將「"+match.code+"」的主檔地址由「"+match.address+"」更新為「"+input.address+"」？這不會建立重複房號。"))return;
  const button=checkoutForm.querySelector('button[type="submit"]');button.disabled=true;
  note("checkoutEditorFeedback","正在加密儲存退租、退款帳務、空房狀態及主檔資料…");
  try{
   const saved=await HouseOpsLive.saveCheckout(input);
   note("checkoutEditorFeedback",saved.changes?.master?.action==="create"?
    "退租、退款帳務及空房已同步，並已新增物件主檔："+saved.changes.master.code+"｜"+saved.changes.master.address:
    saved.changes?.master?.action==="update_address"?
    "退租、空房與退款帳務已同步，物件主檔地址也已更新。":
    "退租已儲存：主檔已配對、退款帳務與空房均已同步更新。");
   paintCheckouts();
  }catch(err){note("checkoutEditorFeedback",err.message||"儲存失敗",true)}
  finally{paintAccess()}
 });
 $("checkoutEditorRows").addEventListener("click",e=>{const b=e.target.closest("[data-edit-checkout]");if(b)editCheckout(b.dataset.editCheckout)});
 $("checkoutEditorReset").addEventListener("click",resetCheckout);
 $("checkoutEditorFilter").addEventListener("input",paintCheckouts);
 resetCheckout();
}
if(pettyForm){
 pettyForm.addEventListener("submit",async e=>{
  e.preventDefault();if(!isEditor())return note("pettyEditorFeedback","尚未取得管理員權限",true);
  pettyForm.querySelector('button[type="submit"]').disabled=true;
  note("pettyEditorFeedback","正在加密同步零用金／代墊紀錄…");
  try{
   await HouseOpsLive.savePetty(values(pettyForm));
   note("pettyEditorFeedback","代管備用金已同步儲存。");
   paintPetty();
  }catch(err){note("pettyEditorFeedback",err.message||"儲存失敗",true)}
  finally{paintAccess()}
 });
 $("pettyEditorRows").addEventListener("click",e=>{const btn=e.target.closest("[data-edit-petty]");if(btn)editPetty(btn.dataset.editPetty)});
 $("pettyEditorFilter").addEventListener("input",paintPetty);
 $("pettyEditorReset").addEventListener("click",resetPetty);
 resetPetty();
}
paintAccess();
})();