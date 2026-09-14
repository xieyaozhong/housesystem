(function () {
  'use strict';
  const C = HouseCore, view = window.HouseView;
  const app = document.querySelector('.app'), input = document.querySelector('#pw'), button = document.querySelector('#unlock');
  let keys = null, busy = false, epoch = 0;
  app.inert = true;
  async function beginCloud() {
    if (!keys || !window.HouseCloud || !HouseCloud.configured()) return;
    const current = epoch;
    await HouseCloud.ready;
    if (current !== epoch || !keys) return;
    await HouseCloud.setCryptoKeys(keys);
    if (current === epoch) HouseCloud.startCheckoutSync();
  }
  async function unlockWithKeys(value) {
    const current = epoch;
    const data = await HouseTrusted.decryptVaultWithKey(HOUSE_VAULT, value.vaultKey);
    if (current !== epoch) return;
    keys = value; localStorage.removeItem(C.LOCK_KEY);
    view.show(data); app.inert = false;
    document.querySelector('#lock').style.display = 'none'; input.value = '';
    document.querySelector('#err').textContent = '';
    beginCloud().catch(e => view.status({ mode: 'error', message: C.errorMessage(e) }));
  }
  async function unlock() {
    if (busy) return;
    const current = epoch;
    busy = true; button.disabled = true;
    try {
      const value = await HouseTrusted.prepare(input.value, C.readConfig()?.projectId);
      if (current !== epoch) return;
      await unlockWithKeys(value);
    } catch (e) { document.querySelector('#err').textContent = C.errorMessage(e); }
    finally { busy = false; button.disabled = false; }
  }
  function clear() {
    epoch++; keys = null; app.inert = true; view.clear();
    input.value = ''; document.querySelector('#lock').style.display = 'grid';
    if (window.parent !== window && window.parent.HouseShell) window.parent.HouseShell.lock();
  }
  button.onclick = unlock;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); unlock(); } };
  document.querySelector('#relock').onclick = () => C.lock();
  window.addEventListener('house-lock', clear);
  window.addEventListener('house-cloud-ready', () => beginCloud().catch(e => view.status({ mode: 'error', message: C.errorMessage(e) })));
  window.addEventListener('house-cloud-state', e => view.status(e.detail));
  window.HousePage = { unlockWithKeys };
  if (window.parent === window && !localStorage.getItem(C.LOCK_KEY)) {
    Promise.resolve().then(async () => {
      const value = await HouseTrusted.getKeys(C.readConfig()?.projectId);
      if (value && !localStorage.getItem(C.LOCK_KEY)) await unlockWithKeys(value);
    }).catch(() => { /* Manual unlock remains available if device storage is unavailable. */ });
  }
})();
