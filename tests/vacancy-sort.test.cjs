const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const src=fs.readFileSync(path.resolve(__dirname,"../vacancy-sort.js"),"utf8");
const ctx={window:{},Intl};
vm.runInNewContext(src,ctx);
const {sort,date}=ctx.window.HouseVacancySort;
test("Newest checkout is first, regardless of encrypted vacancy insertion order",()=>{
 const vacancies=[
  {room:"舊空房",since:"2026-09-10",source:"退租轉空房"},
  {room:"忠明南867-R1",source:"退租轉空房",since:"2026-11-09"},
  {room:"較新房",since:"2026-11-04",source:"退租轉空房"},
  {room:"明德3D",source:"退租轉空房",since:"2026-10-30"}
 ];
 const checkouts=[
  {room:"明德3D",checkout_date:"2026-10-30"},
  {room:"忠明南867-R1",checkout_date:"2026-11-09"},
  {room:"舊空房",checkout_date:"2026-09-10"}
 ];
 assert.deepEqual(Array.from(sort(vacancies,checkouts,[]),v=>v.room),
  ["忠明南867-R1","較新房","明德3D","舊空房"]);
 assert.equal(vacancies[0].room,"舊空房","sorting should not mutate stored vacancy order");
});
test("Most recent checkout per room wins, when prior historical handovers also exist",()=>{
 const v={room:"新退租A",source:"退租轉空房"};
 const history=[
  {room:"新退租A",checkout_date:"2026-09-01"},
  {room:"新退租A",checkout_date:"2026-11-05"},
  {room:"新退租A",checkout_date:"2026-10-11"}
 ];
 assert.equal(date(v,history),"2026-11-05");
 assert.equal(sort([{room:"B",since:"2026-11-02"},v],history,[])[0].room,"新退租A");
});
test("Already rented rooms are excluded from vacancy ordering and search result source",()=>{
 const vacancy=[{room:"南屯643-301",since:"2026-11-08"},
  {room:"平順403",since:"2026-11-06"},{room:"忠明南867-R1",since:"2026-11-09"}];
 const rented=[{room:"南屯643-301",status:"rented"},{room:"平順403",status:"rented"}];
 assert.deepEqual(Array.from(sort(vacancy,[],rented),v=>v.room),["忠明南867-R1"]);
});
test("Undated vacancies follow dated vacancies, even when originally listed first",()=>{
 const rooms=[{room:"無日期B"},{room:"退租房",since:"2026-10-29",source:"退租轉空房"},
 {room:"無日期A"},{room:"較新房",since:"2026-11-09"}];
 assert.deepEqual(Array.from(sort(rooms,[],[]),v=>v.room),
  ["較新房","退租房","無日期A","無日期B"]);
});
test("Vacancy page uses sort helper for cards and counts, and build includes it",()=>{
 const html=fs.readFileSync(path.resolve(__dirname,"../vacancy.html"),"utf8");
 const manifest=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.match(html,/<script src="vacancy-sort\.js(?:\?[^"]+)?"\s*><\/script>/);
 assert.ok(html.includes('HouseVacancySort.sort(o.vacancies,o.checkouts,o.rented,o.vacancy_card_order).filter('));
 assert.ok(html.includes('const available=HouseVacancySort.sort(o.vacancies,o.checkouts,o.rented,o.vacancy_card_order)'));
 assert.ok(html.includes("最新在上方"));
 assert.ok(manifest.includes("'vacancy-sort.js'"));
 assert.ok(manifest.includes("'vacancy-drag.js'"));
 assert.match(html,/data-vacancy-room=/);
 assert.match(html,/card-drag-handle/);
});

test("Manual card order overrides checkout recency and is stable across pages",()=>{
 const rooms=[
  {room:"A",since:"2026-10-10"},
  {room:"B",since:"2026-11-09"},
  {room:"C",since:"2026-11-08"}
 ];
 const manual=["C","A","B"];
 assert.deepEqual(Array.from(sort(rooms,[],[],manual),r=>r.room),manual);
 assert.deepEqual(Array.from(sort(rooms,[],[]),r=>r.room),["B","C","A"]);
});
test("Newly vacant rooms appear first, without discarding existing custom order",()=>{
 const rooms=[{room:"A",since:"2026-11-03"},{room:"B",since:"2026-11-05"},
  {room:"新退租",since:"2026-11-12"}];
 assert.deepEqual(Array.from(sort(rooms,[],[],["A","B"]),r=>r.room),["新退租","A","B"]);
});
test("Rented rooms are hidden even if previously present in shared sort order",()=>{
 const rooms=[{room:"A",since:"2026-11-03"},{room:"B",since:"2026-11-05"}];
 const rented=[{room:"A",status:"rented"}];
 assert.deepEqual(Array.from(sort(rooms,[],rented,["A","B"]),r=>r.room),["B"]);
});
test("Same room with punctuation and alternate Shaanxi characters retains its manual position",()=>{
 const rooms=[{room:"陜西703"},{room:"其他A"}];
 assert.deepEqual(Array.from(sort(rooms,[],[],["陝西-703","其他A"]),r=>r.room),["陜西703","其他A"]);
});
