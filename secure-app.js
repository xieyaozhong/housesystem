(function(){
  'use strict';
  async function loadWithKey(key){
    const [ops,finance,vault]=await Promise.all([
      HouseTrusted.decryptVaultWithKey(HOUSE_OPS_SECURE,key),
      HouseTrusted.decryptVaultWithKey(HOUSE_FINANCE_SECURE,key),
      HouseTrusted.decryptVaultWithKey(HOUSE_VAULT,key)
    ]);
    return {key,ops,finance,vault};
  }
  async function unlock(password){
    const keys=await HouseTrusted.prepare(password,null);
    const session=await loadWithKey(keys.vaultKey);
    await HouseTrusted.rememberVaultKey(keys.vaultKey);
    return session;
  }
  async function auto(){
    const key=await HouseTrusted.getVaultKey();
    if(!key)return null;
    try{return await loadWithKey(key)}catch(e){await HouseTrusted.forgetVaultKey();return null}
  }
  async function forget(){await HouseTrusted.forgetVaultKey()}
  window.HouseSecureApp={unlock,auto,forget,loadWithKey};
})();
