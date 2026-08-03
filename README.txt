Travel Archive v1.2｜Supabase Connection

這個版本已完成：
1. Email＋密碼註冊／登入
2. 登出
3. 從 Supabase 讀取 journeys
4. 新增、編輯、刪除 Journey
5. 重新整理後資料仍存在

使用方式：
- 將整個資料夾上傳 GitHub。
- 使用 Cloudflare Pages 部署。
- Supabase Dashboard > Authentication > URL Configuration：
  Site URL 填入 Cloudflare Pages 網址。
  Redirect URLs 加入同一網址與網址後方的 /*。

安全提醒：
- index 與 JS 中只使用 sb_publishable_...，這是前端可公開的低權限金鑰。
- 絕對不要放入 sb_secret_... 或 service_role。


v1.2.1 修正：
- 新增「摩托車」交通方式。
- 新增「本次旅程沒有搭乘飛機」選項。
- 若 Supabase 出現 default_exchange_rate 欄位不存在，請先執行同包內的 supabase-v1.2.1-migration.sql。

v1.2.2 修正：
- 新增旅程時正確寫入 owner_id。
- 地圖、時光軸與旅程清單統一讀取 Supabase 的真實旅程資料。
- 每趟旅程只顯示一個地圖 Pin。
- 移除 popover；點擊 Pin 直接進入旅程。
- 修正地圖／時光軸切換。
- 新增旅程表單不再帶入名古屋範例資料。
- 手機版儲存按鈕保持在可操作範圍。
- 捲動頁面時自動關閉 day-menu。
- db-status 只在首頁顯示。

v1.2.2 更新不需要再執行新的 SQL。

v1.2.3 修正：
- 編輯旅程會回填已保存的城市、航班、交通、租車與照片資料。
- 只有新增旅程會開啟空白表單。
- 修正「新增更多城市」按鈕。
- JPG、PNG、WebP 會自動轉成 WebP 後上傳至 Supabase Storage。

使用 v1.2.3 前，請先在 Supabase SQL 編輯器執行：
supabase-v1.2.3-migration.sql

這份 SQL 只增加 details 欄位與 journey-covers 照片空間，不會刪除既有資料。

v1.2.4 修正：
- 首頁搜尋「台灣」或「臺灣」都能找到台灣旅程。
- 首頁刪除按鈕會直接顯示確認視窗，不會先開啟 Journey Detail。
- Journey Info 改為顯示目前旅程已保存的真實資料。
- Hero 狀態依日期顯示「規劃中／旅途中／已完成」。

本次更新不需要新增或執行 SQL，只需更新網站檔案。

v1.2.5 修正：
- 地區與國家下拉選單依已建立的 Journey 自動連動。
- 儲存 Journey 時會查詢代表地點的真實座標；找不到時要求輸入完整地址。
- 首頁 status-badge 與 Hero 狀態同步。
- cityCount 將「宜蘭／宜蘭市」等只有結尾「市」差異的名稱合併計算。

本次更新不需要新增或執行 SQL，只需更新網站檔案。

v1.2.6 修正：
- Journey 開始日期自動帶入結束日、去程日、租車取車日與費用日期的預設月份日期。
- Journey 結束日期自動帶入回程日與租車還車日。
- 回程、租車及 Day 日期受 Journey 起訖日限制；去程與費用日期允許超出範圍。
- 主要幣別可自行新增貨幣代碼，並由既有 Journey 自動保留。
- 代表地點支援直接輸入經緯度，並改善韓國／釜山景點與地址搜尋。

本次更新不需要新增或執行 SQL，只需更新網站檔案。
