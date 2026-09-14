# 家總管

以 GitHub Pages 提供的靜態房務網站，包含空房與房屋資訊、退租點交、Firebase 同步設定及手機入口。房屋主檔在瀏覽器解鎖；退租紀錄先存本機，再透過 Firebase Authentication 與 Cloud Firestore 同步。網站沒有自建 API 伺服器。

## 架構與入口

| 檔案／介面 | 職責 |
| --- | --- |
| `index.html` | 功能入口與操作流程說明。 |
| `vacancy.html`、`checkout.html` | 房屋資訊、空房清單及退租點交。已完成點交會成為空房清單的來源。 |
| `house-core.js`／`HouseCore` | 設定與配對格式驗證、專案綁定、本機紀錄驗證、版本比較、合併及原子寫入。 |
| `cloud-sync.js`／`HouseCloud` | 共用 Firebase 初始化、登入、權限檢查、加解密、快照合併、交易寫入及同步狀態。 |
| `trusted-device.js`／`HouseTrusted` | 管理密碼導出金鑰、主檔解密，以及 IndexedDB 裝置信任。 |
| `app-session.js`／`HousePage` | 操作頁解鎖、清除畫面、跨頁鎖定；提供手機外殼傳入金鑰的介面。 |
| `sync-setup.html`、`sync-setup.js` | 連結專案、登入、解鎖同步、加密備份及配對連結。 |
| `mobile-login.html`、`mobile-login.js` | 匯入配對設定、帳號與管理密碼驗證，以及 iframe 工作區。 |
| `secure-data.js` | 既有加密房屋主檔 `HOUSE_VAULT`。 |

各頁共用相同的資料鍵與同步模組。`upload-local.html` 保留舊網址，會導向 `sync-setup.html#step3`，使用同一套比對及同步流程。

## 資料與同步規則

本機退租資料存於 localStorage 的 `house_ops_checkout_v1`，**快取仍是明文**。畫面鎖定不會加密或清除這份快取；雲端同步也不等同於額外備份。請在私人、具螢幕鎖定的瀏覽器環境使用。

- 本機新增、修改與刪除先保留為待同步資料。刪除使用 `__deleted: true` 標記，標記持續保留，避免舊裝置重新上傳已刪除的紀錄。
- 本機寫入使用 Web Locks，讀取最新資料與寫回都在同一個鎖內完成。不支援 Web Locks 的瀏覽器會停止寫入並提示更新。
- 同步只使用經伺服器確認、沒有尚待提交寫入的完整快照進行合併；快取快照不能用來判斷某筆資料在雲端不存在。
- 完整快照先解密及驗證，再修改本機。上傳透過 Firestore transaction 重新讀取同一筆遠端資料並比較版本；確認成功時，也不會覆蓋已更新的本機版本。
- 比較先使用 `updated_at`。時間相同時，刪除標記優先，再比較排序後的資料內容，使各裝置得到確定的相同結果。`_pending` 不參與內容比較。
- `updated_at` 取自用戶端時鐘；`nextTime` 保證本機同筆紀錄的新時間大於已知舊版。這不能消除不同裝置的時鐘偏差，也不是欄位層級的衝突合併。多裝置同時改同筆資料仍會選出單一版本，請保持裝置時間正確。
- 本機 JSON／紀錄格式損壞，或雲端解密、格式檢查失敗時，停止相關寫入並顯示錯誤。不要以清空本機資料或強制覆寫雲端作為修復方式；先保全原始資料，再由管理員檢查。

瀏覽器會綁定 Firebase 專案，避免把既有本機房務資料傳到其他專案。清除連線設定會保留本機資料及專案綁定；不同專案請使用獨立瀏覽器設定檔。

## 加密、密碼與裝置信任

保留既有 v1 加密協定：AES-GCM 256 位元金鑰，PBKDF2／SHA-256 導出金鑰，雲端金鑰使用 `housesystem-sync-v1|{projectId}` 作為 salt，迭代 250000 次。主檔使用自身的 salt、IV、迭代參數與 gzip 標記。每次雲端加密產生新的 12 位元組 IV，儲存 `v`、`iv`、`ct`。

房務內容經加密後才傳到 Firestore；文件 ID、更新時間、寫入 UID 等同步中繼資料仍可由獲授權的後端讀取者看見。Firebase 登入密碼與家總管管理密碼用途不同。所有使用同一份加密房務資料的裝置，需使用相同管理密碼；變更協定、salt 或密碼前必須規劃既有資料的重新加密與遷移。

信任裝置僅在 IndexedDB 保留不可匯出的 `CryptoKey` 與專案資訊，不保留管理密碼；讀取舊版信任資料時會移除舊密碼封裝欄位。手動鎖定會停止同步、清除頁面記憶體中的解鎖狀態並通知同來源頁面，下次需再次輸入管理密碼。取消信任會刪除保存的金鑰。

此網站及其原始碼是公開內容。不要提交真實登入密碼、管理密碼、Service Account 私鑰或解密後的房務資料。Firebase Web App 四個連線欄位屬於公開設定；存取控制依靠 Authentication 與 Firestore 規則。配對連結的 fragment 包含公開設定與 Email，不包含密碼、解鎖金鑰或房務紀錄。

## 第一次設定 Firebase

以下工作需要管理員在 Firebase Console 完成，發布 Pages 不會自動完成：

1. 建立或選擇 Firebase 專案，新增網頁應用程式，取得 `apiKey`、`authDomain`、`projectId`、`appId`。
2. 在 Authentication 開啟 Email/Password，建立供各裝置登入的帳號，並確認部署網域的相關設定。
3. 建立 Cloud Firestore，檢查並發布儲存庫的 `firestore.rules`。
4. `handsomeboy784@gmail.com` 是內建指定管理員；該 Firebase 帳號必須完成 Email 驗證。其他帳號仍需由管理員建立 `housesystem_members/{UID}` 文件。
5. 回到設定頁檢查讀取權限、輸入家總管管理密碼並完成同步，確認後產生手機配對連結。

目前規則授予已驗證的 `handsomeboy784@gmail.com` 及會員文件存在的帳號共享 `housesystem_checkouts` 集合讀寫權限，前端不能自行新增會員。`enabled` 欄位本身不會停用帳號的存取權；停用資格需管理員移除會員文件，或另行設計並發布對應規則。

**GitHub Pages 部署只更新靜態網站，不會更新既有 Firebase 專案的 Authentication 設定、會員資料或 Firestore rules。** 儲存庫內有規則檔案，也不代表正式專案已套用；正式登入與讀寫權限仍需在目標專案確認。

## 開發、驗證與部署

使用 Node.js 24 與 npm，與 GitHub Actions 環境保持一致。在儲存庫目錄執行：

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run build
```

`npm test` 執行核心資料規則測試，以及 JavaScript 語法與本機資源連結檢查。`npm run test:browser` 使用 Playwright 驗證瀏覽器流程；Windows 預設使用標準路徑的 Google Chrome，可用 `CHROME_PATH` 指定執行檔。其他平台使用 Playwright 安裝的 Chromium。

瀏覽器測試以合成主檔、測試帳密和合成 Firebase adapter 模擬登入、權限、快照及交易，不連線操作真實房務後端。通過測試代表這些模擬條件下的流程通過，**不代表已驗證正式 Firebase 專案、正式帳號或已部署的安全規則**。

`npm run build` 將明確列出的前端執行檔複製到 `_site`，並產生 `.nojekyll` 與包含版本及提交識別的 `release.json`。新增前端資源時，要同步更新 `scripts/build.mjs` 的檔案清單。

`.github/workflows/deploy.yml` 在 `main` 收到 push 或手動觸發時，先執行 `validate`：安裝依賴、核心檢查、瀏覽器測試、建置及上傳 Pages artifact。`deploy` 依賴 `validate` 成功後才發布。GitHub 儲存庫的 Pages 來源需使用 GitHub Actions；實際發布是否成功，以該次工作流程與站上的 `release.json` 為準。

若要讓同一個工作流程自動發布 Firestore 規則，請在 GitHub 儲存庫設定 `FIREBASE_PROJECT_ID` repository variable，以及內容為 Firebase service-account JSON 的 `FIREBASE_SERVICE_ACCOUNT` repository secret。兩者缺一時，Pages 仍會部署，但規則工作會略過；本專案不把憑證提交到 Git。
