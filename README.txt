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
