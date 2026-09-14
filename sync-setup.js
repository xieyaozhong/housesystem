(function () {
  'use strict';
  const C = HouseCore, $ = selector => document.querySelector(selector), busy = new Set();
  let current = {}, configured = false, unlocked = false, sessionKeys = null, epoch = 0;
  function message(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
  function paint(s = window.HouseCloud?.getStatus() || {}) {
    current = s;
    let configError=null;
    try { configured = !!C.readConfig(); } catch (e) { configured=false;configError=C.errorMessage(e);$('#configDetails').open=true; }
    const user = s.user, synced = s.mode === 'online' && !s.pending;
    ['step1', 'step2', 'step3', 'step4'].forEach((id, i) => $('#' + id).classList.toggle('done', [configured, !!user, synced, !$('#pairWrap').hidden][i]));
    $('#login').disabled = !configured || !window.HouseCloud || !!user || busy.has('login');
    $('#logout').disabled = !user || busy.has('logout'); $('#password').required = !user;
    $('#checkAccess').disabled = !user || busy.has('checkAccess');
    $('#syncNow').disabled = !user || !s.access || busy.has('syncNow');
    $('#makePair').disabled = !user || !s.access || !synced;
    $('#backup').disabled = !unlocked || busy.has('backup');
    $('#restore').disabled = !unlocked || busy.has('restore');
    $('#uidWrap').hidden = !user; $('#uid').textContent = user?.uid || '';
    message('#status', (s.message || '正在準備同步服務…') + (user ? '\n帳號：' + user.email : ''), s.mode === 'error');
    if (user?.email) { $('#email').value = user.email; localStorage.setItem('house_admin_email_v1', user.email); }
    if (unlocked) message('#syncResult', (s.message || '') + (s.lastSync ? '\n上次雲端確認：' + new Date(s.lastSync).toLocaleString('zh-TW') : ''), s.mode === 'error');
    if (s.mode === 'error' && !s.access && user) $('#permissionHelp').open = true;
    try { const rows = C.readRecords(); $('#localCount').textContent = rows.filter(r => !r.__deleted).length; $('#pendingCount').textContent = rows.filter(r => r._pending).length + ' 筆變更待確認'; }
    catch (e) { message('#syncResult', C.errorMessage(e), true); }
    if (!busy.size) message('#notice', !configured ? '下一步：貼上 Firebase 設定並儲存。' : !user ? '下一步：登入 Firebase 同步帳號。' : !s.access ? '下一步：檢查帳號的 Firestore 讀取權限。' : !synced ? '下一步：解鎖管理密碼，完成本機與雲端同步。' : '同步已完成，可以產生手機配對連結。');
    if(configError || s.mode==='error') message('#notice',configError || s.message,true);
  }
  async function run(id, action, target = '#notice') {
    if (busy.has(id)) return;
    busy.add(id); $('#' + id).disabled = true;
    try { await action(); }
    catch (e) { message(target, C.errorMessage(e), true); $(target).tabIndex=-1; $(target).focus({preventScroll:true}); $(target).scrollIntoView({block:'center',behavior:'smooth'}); }
    finally {
      const text = $(target).textContent, error = $(target).classList.contains('error');
      busy.delete(id); $('#' + id).disabled = false; paintControls(); message(target,text,error);
    }
  }
  function paintControls() {
    // Preserve the action's detailed result instead of overwriting it with a generic status.
    const text = $('#notice').textContent, error = $('#notice').classList.contains('error');
    paint(); message('#notice', text, error);
  }
  async function trustedState() {
    try { $('#trustedState').textContent = await HouseTrusted.has() ? '此裝置已信任' : '此裝置尚未信任'; }
    catch (_) { $('#trustedState').textContent = '裝置信任無法使用，仍可手動解鎖'; }
  }
  async function copy(value, input) {
    try { await navigator.clipboard.writeText(value); message('#notice', '已複製，可貼到手機訊息或 Firebase Console。'); }
    catch (_) { if (input) { input.focus(); input.select(); } message('#notice', '瀏覽器未允許自動複製，請選取文字後手動複製。'); }
  }
  try {
    const c = C.readConfig();
    if (c) { C.fields.forEach(k => $('#' + k).value = c[k]); $('#configDetails').open = false; }
    $('#email').value = localStorage.getItem('house_admin_email_v1') || '';
  } catch (e) { message('#notice', C.errorMessage(e), true); }
  $('#parseCfg').onclick = () => run('parseCfg', async () => { const c = C.parseConfig($('#configPaste').value); C.fields.forEach(k => $('#' + k).value = c[k]); message('#notice', '設定已帶入，確認後按「儲存並連結專案」。'); });
  $('#saveCfg').onclick = () => run('saveCfg', async () => { C.saveConfig(Object.fromEntries(C.fields.map(k => [k, $('#' + k).value]))); location.reload(); });
  $('#clearCfg').onclick = () => run('clearCfg', async () => {
    if (!confirm('清除這台裝置的連線設定並登出？本機房務資料會保留。')) return;
    await window.HouseCloud?.logout(); await HouseTrusted.forget(); localStorage.removeItem(C.CONFIG_KEY); location.reload();
  });
  $('#loginForm').onsubmit = e => { e.preventDefault(); run('login', async () => {
    await HouseCloud.login($('#email').value.trim(), $('#password').value); $('#password').value = '';
    await HouseCloud.checkAccess(); message('#notice', '帳號與讀取權限已確認，請繼續解鎖並同步。');
  }); };
  $('#checkAccess').onclick = () => run('checkAccess', async () => { await HouseCloud.checkAccess(); message('#notice', '讀取權限正常，請繼續解鎖並同步。'); });
  $('#logout').onclick = () => run('logout', async () => { unlocked = false; await HouseCloud.logout(); message('#notice', '已登出並鎖定資料。'); });
  $('#copyUid').onclick = () => copy($('#uid').textContent);
  $('#syncForm').onsubmit = e => { e.preventDefault(); run('syncNow', async () => {
    const currentEpoch = epoch;
    let keys;
    if ($('#master').value) keys = await HouseTrusted.prepare($('#master').value, C.readConfig()?.projectId);
    else if(unlocked && sessionKeys) keys=sessionKeys;
    else if (!localStorage.getItem(C.LOCK_KEY)) keys = await HouseTrusted.getKeys(C.readConfig()?.projectId);
    if (!keys) throw new Error('請輸入家總管管理密碼以解鎖資料');
    if(currentEpoch !== epoch) throw new Error('解鎖期間裝置已被鎖定，請重新輸入管理密碼');
    await HouseCloud.setCryptoKeys(keys); unlocked = true; sessionKeys=keys; $('#master').value = '';
    if ($('#trust').checked) await HouseTrusted.remember(keys);
    if(currentEpoch !== epoch) throw new Error('裝置已被鎖定，請重新解鎖');
    await trustedState(); message('#syncResult', '正在比對並同步…');
    await HouseCloud.forceSync(); message('#notice', '同步完成，現在可以配對手機。');
  }, '#syncResult'); };
  $('#makePair').onclick = () => run('makePair', async () => {
    const s = HouseCloud.getStatus();
    if (s.mode !== 'online' || s.pending || !s.access) throw new Error('請先完成本機與雲端同步');
    const u = new URL('mobile-login.html', location.href);
    u.hash = 'pair=' + C.encode({ v: 1, c: C.readConfig(), email: s.user.email || '' });
    $('#pairUrl').value = u.href; $('#openPair').href = u.href; $('#pairWrap').hidden = false;
    message('#notice', '配對連結已產生。請在手機瀏覽器開啟，登入後即可使用。');
  });
  $('#copyPair').onclick = () => copy($('#pairUrl').value, $('#pairUrl'));
  $('#sharePair').onclick = () => run('sharePair', async () => {
    if (navigator.share) { try { await navigator.share({ title: '家總管手機配對', url: $('#pairUrl').value }); } catch (e) { if (e.name !== 'AbortError') await copy($('#pairUrl').value, $('#pairUrl')); } }
    else await copy($('#pairUrl').value, $('#pairUrl'));
  });
  $('#backup').onclick = () => run('backup', async () => {
    const data = await HouseCloud.encryptBackup(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'housesystem-encrypted-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); message('#notice', '加密備份已下載，請保留原管理密碼以便還原。');
  });
  $('#restore').onclick=()=>run('restore',async()=>{
    const file=$('#backupFile').files[0];
    if(!file)throw new Error('請先選擇家總管加密備份檔');
    if(file.size>10*1024*1024)throw new Error('備份檔超過 10 MB，請聯絡管理員協助匯入');
    if(!confirm('將備份與本機資料合併，保留每筆較新的版本及刪除紀錄。確定匯入？'))return;
    let backup;try{backup=JSON.parse(await file.text())}catch(_){throw new Error('備份檔格式不正確')}
    const count=await HouseCloud.restoreBackup(backup);
    message('#notice','已核對 '+count+' 筆備份紀錄，較新的變更已保留在本機。請按「解鎖並同步」確認雲端進度。');
    $('#backupFile').value='';
  });
  $('#forgetTrusted').onclick = () => run('forgetTrusted', async () => {
    if (!confirm('取消裝置信任並鎖定？下次需輸入家總管管理密碼。')) return;
    await HouseTrusted.forget(); unlocked = false; await trustedState(); message('#notice', '已取消信任並鎖定。');
  });
  window.addEventListener('house-cloud-ready', () => { paint(); });
  window.addEventListener('house-cloud-state', e => paint(e.detail));
  window.addEventListener('house-checkouts-changed', () => paint());
  window.addEventListener('storage', e => { if (e.key === C.LOCAL_KEY) paint(); });
  window.addEventListener('house-lock', () => { epoch++; unlocked = false; sessionKeys=null; $('#master').value = ''; paint(); });
  window.HousePage={unlockWithKeys:async keys=>{
    const currentEpoch=epoch;
    await HouseCloud.ready;
    if(currentEpoch!==epoch || localStorage.getItem(C.LOCK_KEY)) return;
    await HouseCloud.setCryptoKeys(keys);
    if(currentEpoch!==epoch)return;
    unlocked=true;sessionKeys=keys;
    if(navigator.onLine){await HouseCloud.checkAccess();await HouseCloud.forceSync()}
    paint();
  }};
  paint(); trustedState();
})();
