Travel Archive v1.5.3｜Supabase Connection

這個版本已完成：

v1.5.3 搜尋／地圖／代表地點修正：
- 首頁國家與城市統計改為純數字，不再開啟 Master Data。
- Master Data「查看」使用「類別名稱＋項目」精準篩選，避免旅程名稱文字誤判。
- 手機地圖固定填滿卡片，並依容器高度限制最低縮放層級。
- 代表地點改用地標原名搭配國家代碼搜尋，避免中英文混合國名造成查無結果。
- 新增太宰府天滿宮、大都會藝術博物館、艾菲爾鐵塔等常用多語名稱。

本次不需要執行新的 SQL。

v1.5.2 首頁／Master Data／費用介面修正：
- Master Data 排序改為 update，避免偶發 journey_options RLS 新增列錯誤。
- 節點類型預設跟隨 Master Data 第一順位，使用數改為 Journey 並可查看。
- 首頁搜尋同步 Journey、國家、城市與載入狀態統計。
- 費用類別、幣別、付款來源可直接在費用視窗新增。
- 修正地圖返回後定位、手機費用區塊溢出、租車欄位提示與匯率幣別文字。
- Review 清除會同時清除心得與旅遊標籤；Topbar 品牌可回首頁。

本次不需要執行新的 SQL。
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

v1.4.0 下一階段：
- Master data 的「國家」「城市」篩選新增第一個選項「全部」。
- 選擇「全部」可一次查看該類別的完整清單；新增資料前仍須選擇所屬地區／國家。
- Day 正式改用 Supabase：支援新增、編輯、刪除、日期排序與拖曳排序後保存。
- 首次使用 v1.4.0 前，請在 Supabase 新增查詢並執行 supabase-v1.4.0-days-migration.sql。
- 本階段尚未把 Spot 與 Expense 寫入 Supabase，會在 Day 驗收完成後接續處理。

v1.4.1 修正：
- Journey 城市依 Master Data 名稱統一並去除重複，例如「別府／別府市」統一為「別府」。
- Day 頁籤固定保留一個「＋ 新增一天」，不再重複累積或消失。
- 超出 Journey 日期時改為確認後仍可新增，支援轉機與延伸行程。
- 修正 Day 拖曳時的日期唯一限制錯誤；請執行 supabase-v1.4.1-day-drag-fix.sql。
- 刪除 Day 後，新增日期重新依目前最後一天計算。
- Day Modal 不再因桌機拖選文字而誤關閉。
- 首頁 Journey 搜尋結果改為每頁五筆，超過時顯示分頁。

v1.4.2 修正：
- Journey 分頁加入第一頁、上一頁、下一頁、最末頁 icon。
- Master Data 超過 10 筆時自動分頁，同樣支援第一頁與最末頁。
- 地圖在世界範圍低縮放時以海洋色填滿容器，不再露出灰色區塊。
- 手機版可按住 Day Tab 左側拖曳把手調整順序；桌機拖曳維持原本操作。
- 本版不需要新增或執行 SQL。

v1.4.3 修正：
- 地圖依容器高度計算最低縮放，不再只是用底色補空白；地圖圖磚會放大裁切並填滿整個區塊。
- Master Data 上下移改為單次批次儲存完整順序，避免重複 sort_order 與連點競爭。
- 排序儲存期間暫時停用操作鍵，完成後停留在項目所在分頁。
- 本版不需要新增或執行 SQL。

v1.5.0 下一階段：Spot 行程節點
- Spot 正式寫入 Supabase，不再顯示名古屋示範節點。
- 支援在指定 Day 新增、編輯、刪除行程節點。
- 支援類型、名稱、時間、備註與景點心得。
- 同一天內可用滑鼠、觸控或鍵盤調整順序，重新整理後仍保留。
- Day 刪除時，所屬 Spot 會由資料庫一併刪除。
- 請先執行 supabase-v1.5.0-spots-migration.sql；這份 SQL 相容舊版 spots.user_id 並保留既有資料。
- Expense 費用仍維持目前階段，待 Spot 驗收後再接 Supabase。

v1.5.1 Spot 驗收修正：
- Day 編輯儲存後回到剛剛編輯的 Day，新建 Day 也會進入新 Day。
- Day 摘要與 Spot Timeline 之間增加留白。
- Spot 拖曳後依位置交換時間；刪除 Spot 不會改動其他節點時間。
- Spot Modal 可直接新增節點類型。
- Master Data 新增「節點類型」，支援新增、改名、停用、刪除、排序與使用數量。
- 請執行 supabase-v1.5.1-spot-types-migration.sql。


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

v1.3.0 資料管理：
- Header 新增「管理」，集中管理地區、國家、貨幣、費用類別、付款來源、交通方式及旅遊標籤。
- 支援新增、同步改名、啟用／停用及安全刪除。
- 國家、地區、貨幣、交通方式與旅遊標籤改名時，會同步既有 Journey。
- 已被 Journey 使用的資料不能永久刪除，只能停用；未使用資料才可刪除。
- 手機版管理視窗使用動態視窗高度與底部安全距離。

使用 v1.3.0 前，請在 Supabase SQL 編輯器開啟「新增查詢」並執行：
supabase-v1.3.0-master-data-migration.sql

這份 SQL 只擴充共用資料管理，不會刪除既有 Journey。

v1.3.1 修正：
- 資料管理視窗不再因滑鼠拖曳選取文字而誤關閉，只能按右上角 × 關閉。
- Master Data 每筆資料新增上移／下移，順序會同步到前端所有相關選單。
- 預設將「其他」排列在地區、國家及費用類別的最後。
- 手機版「＋新增旅程」改為上下兩行，桌機維持單行。
- Journey Modal 底部操作區改為完整實色遮罩，不再露出後方欄位。

使用 v1.3.1 前，請在 Supabase SQL 編輯器開啟「新增查詢」並執行：
supabase-v1.3.1-master-order-migration.sql

這份 SQL 只新增 Master Data 順序欄位，不會刪除或修改 Journey。

v1.2.13 修正：
- 「旅程資訊」與「費用」頁籤不顯示「新增一天」，只有 Day 頁籤會顯示。
- 移除重複的 Day Tab 拖曳事件，拖曳結束或取消時會清除反白／透明狀態。
- 費用摘要新增「付款來源統計」，依共同帳戶、我、同行者、現金等來源換算台幣彙總。

本次更新不需要新增或執行 SQL，只需更新網站檔案。

v1.2.11 修正：
- 總心得編輯區新增「旅遊標籤」，可自行新增與刪除溫泉、海邊、爬山、自行車等屬性。
- 首頁 Journey 摘要會顯示旅遊標籤，搜尋也包含標籤文字。
- 主要交通方式新增「自有車」。

旅遊標籤沿用既有 journeys.details 儲存，本次更新不需要新增或執行 SQL。

v1.2.12 修正：
- Journey Detail 的總心得顯示改為「總心得 · 旅遊標籤」，與首頁摘要一致。
- 編輯心得時只回填總心得本身，旅遊標籤仍維持獨立欄位，不會混入心得文字。

本次更新不需要新增或執行 SQL，只需更新網站檔案。

v1.2.8 修正：
- journeyInboundDate 完全移除日期範圍限制，預設仍帶入 journeyEnd。
- countryCount 統一由完整 Journey 資料計算，並正規化台灣／臺灣、韓國／南韓等名稱。
- photo-pin 改用 background-size: cover 滿版裁切，不再受 img 樣式影響。
- 延續舊 Journey 國家→地區推斷，修正舊台灣旅程代表地點更新。

本次更新不需要新增或執行 SQL，只需更新網站檔案。

v1.2.7 修正：
- 回程日期改為 Journey 開始日前 2 天至結束日後 2 天的寬鬆範圍，預設仍帶入結束日。
- 地圖 photo-pin 的直式與橫式照片都會置中裁切、滿版填滿圓形。
- 舊 Journey 缺少 region 時，依國家自動推斷地區，修正台灣舊旅程定位失敗。
- 首頁 Journey 清單只顯示依開始日期最新的 5 趟；地圖與時光軸仍顯示全部旅程。

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

v1.2.9 修正：
- Hero 刪除旅程改用真實 Supabase 刪除流程，成功後自動回首頁。
- 新增 journey_options，保存尚未建立 Journey 的自訂地區、國家與貨幣。
- 未選租車時不顯示租車資料卡；主要交通只在代表地點卡顯示。
- Journey Detail 編輯儲存後自動刷新 Journey Info，不需重新整理或返回首頁。

使用 v1.2.9 前，請先在 Supabase SQL 編輯器執行：
supabase-v1.2.9-migration.sql

這份 SQL 只新增自訂選項表，不會刪除或修改既有 Journey。

v1.2.10 修正：
- Journey 總心得儲存至 journeys.summary，首頁摘要與搜尋會自動同步 reviewText。
- 代表地點支援在第二次地址提示中直接輸入經緯度。
- 新增倫敦大本鐘／大笨鐘、Big Ben 與西敏宮地標別名，並補強 GB／UK 國家搜尋。
- 從首頁開啟任何 Journey 時，一律先顯示「旅程資訊」，不沿用上一趟旅程的 Day。

本次更新不需要新增或執行 SQL，只需更新網站檔案。
v1.3.2 更新：
- 首頁搜尋與地區篩選會同步更新 Journey 列表、地圖 Pin 與時光軸。
- Journey 列表仍最多顯示五筆；搜尋時會從全部旅程中找出符合結果。
- 移除手機版 Journey Modal 操作列下方額外延伸的空白遮罩。
- 修正手機版日期與時間欄位超出 Journey Modal 的問題。
- Master Data 排序改為即時交換相鄰兩筆，不再重新載入全部 Journey。
- 本次不需要執行新的 Supabase SQL。
v1.3.3 更新：
- 修正「國家」與「旅遊標籤」排序；舊資料即使排序值重複，也會在移動時自動重新編號。
- 新增費用會依目前 Journey 的起訖日與預填日期，自動判斷出發前、旅行中或旅行後。
- 所有 Modal 改為互斥顯示；開啟新視窗時，舊視窗會自動關閉。
- 修正手機版 dayEditDate 寬度與 Journey 儲存操作列遮罩。
- Master Data 的 Journey 使用數可點選並回首頁篩選；首頁旅遊標籤也可直接點選篩選。
- 首頁搜尋新增貨幣、地區與主要交通方式。
- 本次不需要執行新的 Supabase SQL。
v1.3.4 更新：
- 新增費用預設使用今天日期，再依目前 Journey 起訖日判斷旅行前／中／後與對應 Day。
- Expense Day 顯示 Day 編號與實際日期；非旅程期間維持未指定。
- Master Data 新增「城市」，會從既有 Journey 自動整理，並顯示使用數量。
- 首頁國家數與城市數可點擊，直接開啟 Master Data 對應頁籤。
- 修正手機版租車日期時間、Spot 時間欄位寬度，以及租車 Check Chips 被操作列遮住。
- 「刪除總心得」改為「清除心得」，並同步調整確認文案。
- Journey Modal 操作列下方增加精準的安全區遮罩，不再露出後方欄位。
- 本次不需要執行新的 Supabase SQL。
v1.3.5 更新：
- 修正城市無法寫入 Master Data：需執行 supabase-v1.3.5-city-master-migration.sql。
- 執行 SQL 並重新整理後，系統會從既有 Journey 自動整理城市資料。
- Review 標題調整為「旅遊總心得 · 旅遊標籤」。
- 網站明確載入 Noto Sans TC 與 Noto Serif TC，統一桌機與手機字型。
- Master Data 父層選單沿用上一層排序：地區 → 國家 → 城市。
v1.3.6 更新：
- 修正手機版新增費用日期欄位超出右側。
- Master Data 的父層選單新增篩選功能。
- 國家頁籤可依地區篩選；城市頁籤可依國家篩選。
- 父層篩選選項仍沿用 Master Data 的自訂排序。
- 本次不需要執行新的 Supabase SQL。
