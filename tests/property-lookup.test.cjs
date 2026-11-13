const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../house-property-lookup.js"),"utf8");
function helper(){
 const ctx={window:{}};
 vm.runInNewContext(source,ctx,{filename:"house-property-lookup.js"});
 return ctx.window.HousePropertyLookup;
}
const session={
 vault:{properties:[
  {id:1,code:"明德3D",address:"台中市明德街66號",note:"注意電錶"},
  {id:2,code:"平德501",address:"台中市平德路101號"},
  {id:3,code:"南屯643-301",address:"台中市南屯路643號"}
 ]},
 ops:{rented:[{room:"平德501",address:"台中市平德路101號",rent:13000,power_rate:5.5}],
  vacancies:[{room:"新房B12",address:"台中市新屋路18號",rent:12000,power_rate:5}],
  checkouts:[{room:"明德3D",address:"台中市明德街66號",deposit:22000}]}
};
test("Room keywords find corresponding master addresses and retain master ID",()=>{
 const api=helper();
 const rows=api.search(session,"明德");
 assert.equal(rows[0].code,"明德3D");
 assert.equal(rows[0].address,"台中市明德街66號");
 assert.equal(rows[0].id,"1");
 const byRoom=api.byRoom(session,"明德-3D");
 assert.equal(byRoom[0].id,"1");
});
test("Partial street address suggests all matching master units",()=>{
 const api=helper();
 assert.deepEqual(Array.from(api.search(session,"台中市平德",4),r=>r.code),["平德501"]);
 assert.deepEqual(Array.from(api.search(session,"南屯 301",4),r=>r.code),["南屯643-301"]);
});
test("Operating rooms without a master entry are available for selection",()=>{
 const api=helper();
 const items=api.search(session,"新屋路");
 assert.equal(items[0].code,"新房B12");
 assert.equal(items[0].id,"");
 assert.equal(items[0].deposit,24000);
 assert.equal(items[0].power_rate,5);
});
test("Search remains read-only and never mutates decrypted master data",()=>{
 const api=helper(),before=JSON.stringify(session);
 api.search(session,"台中");
 api.byRoom(session,"明德3D");
 assert.equal(JSON.stringify(session),before);
});

test("Taipower choice is carried from the matching master suite",()=>{
 const api=helper();
 const record={vault:{properties:[{id:11,code:"電力A6",address:"測試路6號",power_billing:"taipower",power_rate:null}]},
 ops:{vacancies:[],rented:[],checkouts:[]}};
 const match=api.search(record,"測試路")[0];
 assert.equal(match.code,"電力A6");
 assert.equal(match.power_billing,"taipower");
 assert.equal(match.power_rate,null);
});
