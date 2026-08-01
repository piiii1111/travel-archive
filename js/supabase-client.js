const SUPABASE_URL='https://wlxnqjytmimiuxtzffds.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_86eZkbkNPi2-eZKPL23UPg_MOkXg_mO';
window.travelDb=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}})||null;
