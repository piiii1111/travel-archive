-- Travel Archive v1.2.2
-- 用途：讓已登入的使用者新增旅程時，owner_id 自動帶入自己的登入 ID。
-- 這份修正不會刪除任何旅程或其他資料。

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journeys'
      and column_name = 'owner_id'
  ) then
    alter table public.journeys
      alter column owner_id set default auth.uid();
  end if;
end $$;

notify pgrst, 'reload schema';
