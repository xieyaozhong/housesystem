(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const H=window.HouseAccounting;
  const E=value=>String(value??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const M=value=>"$"+Math.round(Number(value)||0).toLocaleString("zh-TW");
  const kindName={vendor:"廠商款",refund:"退租退款",fund:"零用金入帳",advance:"代墊",advance_repaid:"代墊歸還",petty_expense:"零用金支出"};
  const pettyKinds=new Set(["fund","advance","advance_repaid","petty_expense"]);
  let session=null,entries=[],lastFiltered=[];
  function normalize(s){
    const finance=new Map((s.finance.accounts||[]).map(x=>[x.id,x]));
    const payable=(s.ops.weekly_accounts||[]).filter(x=>x&&!x.__deleted).map(r=>{
      const bank=finance.get(r.id)||{},cycle=H.period(r);
      const bankLast4=bank.bank_account_last4||String(bank.bank_account||"").slice(-4);
      return {
        id:r.id,kind:r.kind||"",party:r.party||"",property:r.property_label||"",
        description:r.description||r.note||"",amount:Number(r.amount)||0,
        originalDate:r.settlement_date||r.date||r.due_date||"",dueDate:r.due_date||"",
        cycle,status:r.status==="paid"?"paid":"pending",
        paidDate:r.paid_date||r.paid_at||"",bankCode:bank.bank_code||r.bank_code||"",
        bankName:bank.bank_name||"",bankLast4,receipt:r.receipt_url||"",isPetty:false
      };
    });
    const petty=(window.HOUSE_PETTY_CASH_DATA?.entries||[]).filter(x=>x&&x.status!=="void").map(r=>{
      const sign=r.kind==="fund"||r.kind==="advance_repaid"?1:-1;
      return{
        id:r.id,kind:r.kind,party:r.manager||"",property:"",
        description:r.item||"",amount:sign*(Number(r.amount)||0),
        originalDate:r.date||"",dueDate:"",cycle:H.pettyPeriod(r),
        status:"paid",paidDate:r.date||"",bankCode:"",bankName:"",bankLast4:"",
        receipt:r.receipt_url||"",isPetty:true
      };
    });
    return [...payable,...petty].sort((a,b)=>String(b.cycle).localeCompare(String(a.cycle))||
      String(b.originalDate).localeCompare(String(a.originalDate))||String(a.id).localeCompare(String(b.id)));
  }
  function buildCycleOptions(){
    const chosen=$("cycle").value,cycles=[...new Set(entries.map(r=>r.cycle).filter(Boolean))].sort().reverse();
    $("cycle").innerHTML='<option value="">全部歷史週期</option>'+
      cycles.map(c=>'<option value="'+E(c)+'">'+E(H.label(c))+'</option>').join("")+
      (entries.some(r=>!r.cycle)?'<option value="unscheduled">未排定日期</option>':"");
    if([...cycles,"unscheduled"].includes(chosen))$("cycle").value=chosen;
  }
  function filtered(){
    const current=H.current(),includeCurrent=$("includeCurrent").checked;
    const cycle=$("cycle").value,start=$("startDate").value,end=$("endDate").value;
    const kind=$("kind").value,status=$("status").value,word=$("keyword").value.trim().toLowerCase();
    return entries.filter(r=>{
      if(!includeCurrent&&r.cycle===current)return false;
      if(cycle&&r.cycle!==(cycle==="unscheduled"?"":cycle))return false;
      if(start&&(!r.cycle||r.cycle<start))return false;
      if(end&&(!r.cycle||r.cycle>end))return false;
      if(kind&&r.kind!==kind)return false;
      if(status&&r.status!==status)return false;
      if(word&&!([r.party,r.property,r.description,r.id,r.bankName,r.bankCode].join(" ").toLowerCase().includes(word)))return false;
      return true;
    });
  }
  function receiptLink(url){
    if(!/^https:\/\/drive\.google\.com\//.test(url||""))return "—";
    return '<a class="history-receipt" href="'+E(url)+'" target="_blank" rel="noopener noreferrer">查看收據</a>';
  }
  function paint(){
    if(!session)return;
    lastFiltered=filtered();
    const payables=lastFiltered.filter(r=>!r.isPetty);
    const petty=lastFiltered.filter(r=>r.isPetty);
    $("nRows").textContent=lastFiltered.length.toLocaleString("zh-TW");
    $("nAmount").textContent=M(payables.reduce((sum,r)=>sum+r.amount,0));
    $("nUnpaid").textContent=M(payables.filter(r=>r.status!=="paid").reduce((sum,r)=>sum+r.amount,0));
    $("nPetty").textContent=M(petty.reduce((sum,r)=>sum+r.amount,0));
    $("filterInfo").textContent="顯示 "+lastFiltered.length+" 筆｜本週二 "+H.current()+
      "｜帳務合計不含零用金；零用金淨額獨立計算";
    $("historyTb").innerHTML=lastFiltered.map(r=>{
      const status=r.isPetty?"已記帳":r.status==="paid"?"已付款":"未付款";
      const bank=r.bankCode?[r.bankCode,r.bankName].filter(Boolean).join(" ")+" "+
        (r.bankLast4?"末四碼 "+r.bankLast4:""):"—";
      const original=r.originalDate+(r.dueDate&&r.dueDate!==r.originalDate?"（應付 "+r.dueDate+"）":"");
      return '<tr><td>'+E(r.cycle||"未排定")+'</td><td>'+E(original||"—")+'</td>'+
        '<td>'+E(kindName[r.kind]||r.kind||"—")+'</td><td>'+E(r.party||"—")+'</td>'+
        '<td>'+E(r.property||"—")+'</td><td>'+E(r.description||"—")+'</td>'+
        '<td class="money">'+E((r.amount<0?"−":"")+M(Math.abs(r.amount)))+'</td>'+
        '<td><span class="record-status '+(r.status==="paid"?"paid":"pending")+'">'+status+'</span></td>'+
        '<td>'+E(r.paidDate||"—")+'</td><td>'+E(bank)+'</td><td>'+receiptLink(r.receipt)+'</td></tr>';
    }).join("")||'<tr><td colspan="11" class="history-empty">查無符合條件的帳務，請調整查詢條件</td></tr>';
  }
  function exportCsv(){
    if(!session)return;
    const header=["週二結算日","原始日期","退款期限","類型","收款人／代管人","物件","項目","金額","付款狀態","完成日期","銀行代號","銀行名稱","帳號末四碼","收據","紀錄ID"];
    const data=lastFiltered.map(r=>[r.cycle,r.originalDate,r.dueDate,kindName[r.kind]||r.kind,
      r.party,r.property,r.description,r.amount,r.status==="paid"?(r.isPetty?"已記帳":"已付款"):"未付款",
      r.paidDate,r.bankCode,r.bankName,r.bankLast4,r.receipt,r.id]);
    const safeCell=v=>{
      let s=String(v??"");
      if(/^[=+@\-\t\r]/.test(s)&&isNaN(Number(s)))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const csv="\uFEFF"+[header,...data].map(row=>row.map(safeCell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="家總管_歷史帳務_"+H.todayTaiwan()+".csv";
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function render(s){
    session=s;entries=normalize(s);
    $("lock").style.display="none";
    $("updated").textContent="● 更新 "+new Date(s.ops.updated_at).toLocaleString("zh-TW");
    buildCycleOptions();paint();
  }
  async function unlock(){
    try{await render(await HouseSecureApp.unlock($("pw").value));$("pw").value="";}
    catch(e){$("err").textContent=e?.message||"無法解鎖"}
  }
  for(const id of ["includeCurrent","cycle","startDate","endDate","kind","status","keyword"])
    $(id).addEventListener(id==="keyword"?"input":"change",paint);
  $("clearFilters").onclick=()=>{
    for(const id of ["cycle","startDate","endDate","kind","status","keyword"])$(id).value="";
    $("includeCurrent").checked=false;paint();
  };
  $("exportCsv").onclick=exportCsv;
  $("unlock").onclick=unlock;
  $("pw").onkeydown=e=>{if(e.key==="Enter")unlock()};
  $("forget").onclick=async()=>{await HouseSecureApp.forget();location.reload()};
  (async()=>{try{const s=await HouseSecureApp.auto();if(s)await render(s)}catch(e){console.warn("History auto unlock",e)}})();
  window.HouseHistoryDebug={normalize,filtered,paint};
})();
