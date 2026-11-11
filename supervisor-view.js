(function(){
 "use strict";
 // A bookmarked supervisor link needs only the existing house password.
 // All cloud edits remain admin-only in Firestore; this hides editing controls.
 if(new URLSearchParams(location.search).get("view")!=="supervisor")return;
 document.body.classList.add("supervisor-view");
 const style=document.createElement("style");
 style.textContent=[
  "body.supervisor-view #syncSettings",
  "body.supervisor-view #syncLoginForm",
  "body.supervisor-view #syncLogoutBtn",
  "body.supervisor-view #roomEditPanel",
  "body.supervisor-view .edit-btn",
  "body.supervisor-view #historyCloudLogin",
  "body.supervisor-view #paymentEditPanel",
  "body.supervisor-view .history-edit-btn",
  "body.supervisor-view [data-save-finance]",
  "body.supervisor-view [data-finance-account]",
  "body.supervisor-view [data-save-refund]",
  "body.supervisor-view [data-refund-account]"
 ].join(",")+"{display:none!important}";
 document.head.appendChild(style);
 const syncTitle=document.querySelector("#syncPanel h2");
 if(syncTitle)syncTitle.textContent="主管唯讀｜最新同步狀態";
 const description=document.querySelector("#syncPanel .live-help");
 if(description)description.textContent="請輸入家總管管理密碼解鎖房務；不需 Firebase 帳號。此頁只讀取已加密的雲端更新，不提供編輯功能。";
 const historyTitle=document.querySelector("#paymentSyncPanel h2");
 if(historyTitle)historyTitle.textContent="主管唯讀｜最新帳務同步";
 const historyNote=document.querySelector("#paymentSyncPanel .history-note");
 if(historyNote)historyNote.textContent="主管只需輸入家總管管理密碼。雲端修改紀錄會自動載入，這台裝置不能編輯付款狀態。";
 for(const link of document.querySelectorAll("a[href]")){
  const href=link.getAttribute("href")||"";
  if(!/^(?:index|vacancy|checkout|weekly-accounting|accounting-history)\.html(?:[?#].*)?$/i.test(href))continue;
  const url=new URL(href,location.href);
  url.searchParams.set("view","supervisor");
  link.setAttribute("href",url.pathname.split("/").pop()+url.search+url.hash);
 }
})();