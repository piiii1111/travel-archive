Travel Archive v1.2.2 修正版

本次修正：
1. 新增旅程會同時送出 owner_id 與 user_id，並自動相容現有 Supabase 欄位。
2. 地圖固定為每趟旅程一個 Pin，不再依城市數量重複建立。
3. 修正「地圖／時光軸」切換，時光軸改為依年份由新到舊排列。
4. 移除點擊畫面左側就返回首頁的行為，選取表單文字不再誤跳頁。
5. 新增旅程表單改為真正空白，不會帶入名古屋資料。
6. 手機版儲存列固定於視窗底部，並支援 iPhone 安全區。
7. 往下滑動時會自動收起 day-menu。
8. 資料庫連線成功提示只會出現在首頁。

更新方式：
A. 先到 Supabase → SQL 編輯器 → 新增查詢。
B. 貼上 supabase/migrations/007_fix_journey_owner_id.sql 的全部內容，按 Run。
C. 將本資料夾內的 index.html、css、js 全部更新到 GitHub Repository 根目錄。
D. 等 Cloudflare Pages 自動完成部署，再用 Command + Shift + R 強制重新整理。

請勿只上傳 index.html，css 與 js 資料夾也必須一起更新。
