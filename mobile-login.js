(function () {
  'use strict';
  const C = HouseCore, $ = selector => document.querySelector(selector);
  let keys = null, launched = false, busy = false, autoBusy = false, pairError = false, epoch = 0;
  function report(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
  try {
    const encoded = new URLSearchParams(location.hash.slice(1)).get('pair');
    if (encoded !== null) {
      const pair = C.decodePair(encoded); C.saveConfig(pair.c);
      if (pair.email) localStorage.setItem('house_admin_email_v1', pair.email);
      history.replaceState(null, '', location.pathname + location.search);
      $('#pairMsg').textContent = '配對設定已匯入。請使用同一個管理員帳號登入。';
    } else $('#pairMsg').textContent = C.readConfig() ? '已連結專案，可直接登入或解鎖。' : '請先在電腦完成同步設定，產生手機配對連結後在這裡開啟。';
    $('#email').value = localStorage.getItem('house_admin_email_v1') || '';
  } catch (e) { pairError = true; $('#pairMsg').textContent = C.errorMessage(e); report('配對未完成，請從電腦重新產生連結。', true); }
  function paint(s = {}) {
    const sameAccount = s.user?.email?.toLowerCase() === $('#email').value.trim().toLowerCase();
    $('#firebaseFields').hidden = !!sameAccount;
    $('#firebasePw').required = !sameAccount;
    $('#go').disabled = busy || pairError || !window.HouseCloud?.configured();
    $('#go').textContent = busy ? '驗證中…' : sameAccount ? '解鎖並開啟家總管' : '登入並開啟家總管';
    if (!busy && !launched && !pairError) report(s.message || '請登入並解鎖', s.mode === 'error');
  }
  function lock() {
    epoch++; keys = null; launched = false;
    $('#frame').src = 'about:blank'; $('#app').hidden = true; $('#login').hidden = false;
    $('#masterPw').value = ''; $('#firebasePw').value = '';
    report('已鎖定。請重新輸入家總管管理密碼。');
  }
  function loadPage(src) {
    if (!keys || !['vacancy.html', 'checkout.html', 'sync-setup.html'].includes(src)) return;
    document.querySelectorAll('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === src));
    $('#frame').src = src;
  }
  function launch(value) { keys = value; launched = true; $('#login').hidden = true; $('#app').hidden = false; loadPage('vacancy.html'); }
  $('#frame').addEventListener('load', async () => {
    if (!keys || localStorage.getItem(C.LOCK_KEY)) return;
    try { await $('#frame').contentWindow.HousePage?.unlockWithKeys(keys); }
    catch (e) { C.lock(); report(C.errorMessage(e), true); }
  });
  async function tryAutoStart() {
    if (busy || autoBusy || launched || pairError || localStorage.getItem(C.LOCK_KEY) || !window.HouseCloud?.currentUser()) return;
    if (HouseCloud.currentUser().email?.toLowerCase() !== $('#email').value.trim().toLowerCase()) return;
    autoBusy = true;
    const current = epoch;
    try {
      const value = await HouseTrusted.getKeys(C.readConfig()?.projectId);
      if (!value) return;
      await HouseTrusted.decryptVaultWithKey(HOUSE_VAULT, value.vaultKey);
      if (navigator.onLine) await HouseCloud.checkAccess();
      if (current === epoch && !localStorage.getItem(C.LOCK_KEY) && !busy) launch(value);
    } catch (e) { report(C.errorMessage(e), true); }
    finally { autoBusy = false; }
  }
  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); if (busy || pairError) return;
    busy = true; const current = epoch; paint(HouseCloud.getStatus());
    try {
      const c = C.readConfig(); if (!c) throw new Error('請先從電腦開啟手機配對連結');
      const email = $('#email').value.trim();
      if (HouseCloud.currentUser()?.email?.toLowerCase() !== email.toLowerCase()) {
        if (!$('#firebasePw').value) throw new Error('請輸入 Firebase 登入密碼');
        await HouseCloud.login(email, $('#firebasePw').value);
      }
      if(navigator.onLine) await HouseCloud.checkAccess();
      const value = await HouseTrusted.prepare($('#masterPw').value, c.projectId);
      if (current !== epoch) return;
      if ($('#trust').checked) await HouseTrusted.remember(value);
      else await HouseTrusted.forget({ lock: false });
      if (current !== epoch) return;
      localStorage.removeItem(C.LOCK_KEY);
      localStorage.setItem('house_admin_email_v1', email);
      $('#firebasePw').value = ''; $('#masterPw').value = '';
      launch(value);
    } catch (e) { report(C.errorMessage(e), true); }
    finally { busy = false; const text = $('#status').textContent, error = $('#status').classList.contains('error'); paint(HouseCloud.getStatus()); report(text, error); }
  };
  $('#email').oninput = () => { epoch++; paint(window.HouseCloud?.getStatus() || {}); };
  $('#exit').onclick = () => C.lock();
  document.querySelectorAll('[data-src]').forEach(b => b.onclick = () => loadPage(b.dataset.src));
  window.HouseShell = { lock };
  window.addEventListener('house-lock', lock);
  window.addEventListener('house-cloud-ready', () => { paint(HouseCloud.getStatus()); tryAutoStart(); });
  window.addEventListener('house-cloud-state', e => { paint(e.detail); if (!e.detail.user && launched) C.lock(); tryAutoStart(); });
})();
