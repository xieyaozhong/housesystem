const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"../supervisor-view.js"),"utf8");
function view(search){
 const items=["vacancy.html","weekly-accounting.html","accounting-history.html","checkout.html","https://example.org"];
 const anchors=items.map(v=>({value:v,getAttribute(){return this.value},setAttribute(_k,x){this.value=x}}));
 const nodes={"#syncPanel h2":{textContent:"original"},"#syncPanel .live-help":{textContent:"original"},
  "#paymentSyncPanel h2":{textContent:"original"},"#paymentSyncPanel .history-note":{textContent:"original"}};
 const classes=[],styles=[],doc={
   body:{classList:{add:k=>classes.push(k)}},head:{appendChild:x=>styles.push(x.textContent)},
   createElement:()=>({textContent:""}),
   querySelector:k=>nodes[k]||null,querySelectorAll:k=>k==="a[href]"?anchors:[]
 };
 vm.runInNewContext(script,{document:doc,location:{search,href:"https://example.com/housesystem/vacancy.html"+search},URL,URLSearchParams});
 return {anchors,classes,styles,nodes};
}
test("Supervisor entry keeps other management pages in password-only read-only mode",()=>{
 const v=view("?view=supervisor");
 assert.deepEqual(v.classes,["supervisor-view"]);
 assert.ok(v.styles[0].includes("#syncLoginForm"));
 assert.ok(v.styles[0].includes("#roomEditPanel"));
 assert.ok(v.styles[0].includes("[data-save-finance]"));
 assert.match(v.anchors[1].value,/weekly-accounting\.html\?view=supervisor/);
 assert.match(v.anchors[2].value,/accounting-history\.html\?view=supervisor/);
 assert.equal(v.anchors[4].value,"https://example.org");
 assert.match(v.nodes["#syncPanel h2"].textContent,/主管唯讀/);
});
test("Normal editor page retains login and editing controls",()=>{
 const v=view("");
 assert.equal(v.classes.length,0);
 assert.equal(v.styles.length,0);
 assert.equal(v.anchors[0].value,"vacancy.html");
});
