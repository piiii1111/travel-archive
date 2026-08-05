(() => {
  const SUPABASE_URL = 'https://wlxnqjytmimiuxtzffds.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_86eZkbkNPi2-eZKPL23UPg_MOkXg_mO';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.travelArchiveSupabase = client;

  let currentUser = null;
  let editingJourneyId = null;
  let existingCoverPath = '';
  let selectedCoverBlob = null;
  let selectedCoverPreviewUrl = '';
  let cachedJourneyRows = [];
  let cachedOptionRows = [];
  let activeManagerType = 'region';
  let activeManagerParent = '';
  const managerTypes = [['region','地區'],['country','國家'],['city','城市'],['currency','貨幣'],['expense_category','費用類別'],['payer','付款來源'],['transport','交通方式'],['tag','旅遊標籤']];
  const defaultOptions = [
    ...['東北亞','東南亞','台灣','歐洲','美洲','大洋洲','其他'].map(value=>['region','',value]),
    ...[['東北亞','日本'],['東北亞','韓國'],['東南亞','泰國'],['東南亞','新加坡'],['台灣','台灣'],['歐洲','英國'],['歐洲','法國'],['美洲','美國'],['其他','其他']].map(([parent,value])=>['country',parent,value]),
    ...['TWD','JPY','USD','EUR','KRW','THB'].map(value=>['currency','',value]),
    ...['機票','住宿','交通','餐飲','購物','票券','通信','保險','其他'].map(value=>['expense_category','',value]),
    ...['共同帳戶','我','同行者','現金'].map(value=>['payer','',value]),
    ...['租車','地鐵／捷運','JR／火車／近鐵','公車','計程車／Uber','渡輪／船','摩托車','自有車','自行車','步行'].map(value=>['transport','',value])
  ];
  const optionCompare=(a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.created_at||'').localeCompare(String(b.created_at||''))||a.value.localeCompare(b.value,'zh-Hant');
  const defaultSortOrder=(type,parent,value)=>{
    const siblings=defaultOptions.filter(([optionType,parentValue])=>optionType===type&&(type!=='country'||parentValue===parent));
    const index=siblings.findIndex(([,parentValue,optionValue])=>parentValue===parent&&optionValue===value);
    return index>=0?(index+1)*10:1000;
  };

  const $ = id => document.getElementById(id);
  const setStatus = (text, type = '') => {
    const el = $('dbStatus');
    if (!el) return;
    el.textContent = text;
    const detailOpen = $('detailView')?.classList.contains('active');
    el.className = `db-status ${type}${detailOpen ? ' hidden' : ''}`.trim();
  };
  const setAuthMessage = (text, error = false) => {
    const el = $('authMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `auth-message${error ? ' error' : ''}`;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const formatDate = value => value ? new Intl.DateTimeFormat('zh-TW', {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(`${value}T00:00:00`)) : '';
  const journeyStatus = row => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = row.start_date ? new Date(`${row.start_date}T00:00:00`) : null;
    const end = row.end_date ? new Date(`${row.end_date}T23:59:59`) : null;
    return start && start > today ? '規劃中' : end && end < today ? '已完成' : '旅途中';
  };
  const fieldValue = id => $(id)?.value || '';
  const setFieldValue = (id, value = '') => { if ($(id)) $(id).value = value ?? ''; };

  async function resolveCoverUrl(row) {
    if (!row.cover_path) return { ...row, cover_url: '' };
    if (/^https?:\/\//i.test(row.cover_path)) return { ...row, cover_url: row.cover_path };
    const { data, error } = await client.storage.from('journey-covers').createSignedUrl(row.cover_path, 60 * 60 * 24 * 7);
    if (error) console.warn('無法讀取旅程照片：', error.message);
    return { ...row, cover_url: data?.signedUrl || '' };
  }

  async function convertImageToWebp(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('請選擇 JPG、PNG 或 WebP 圖片。');
    const image = await createImageBitmap(file);
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.84));
    if (!blob) throw new Error('照片轉換失敗，請改用另一張圖片。');
    return blob;
  }

  function showCoverPreview(url) {
    const preview = $('journeyPhotoPreview');
    if (preview) preview.style.backgroundImage = url ? `url("${String(url).replaceAll('"', '%22')}")` : '';
  }

  async function handleCoverSelection(event) {
    const file = event.target.files?.[0];
    selectedCoverBlob = null;
    if (selectedCoverPreviewUrl) URL.revokeObjectURL(selectedCoverPreviewUrl);
    selectedCoverPreviewUrl = '';
    if (!file) return showCoverPreview('');
    try {
      if ($('journeyPhotoStatus')) $('journeyPhotoStatus').textContent = '正在將照片轉成 WebP…';
      selectedCoverBlob = await convertImageToWebp(file);
      selectedCoverPreviewUrl = URL.createObjectURL(selectedCoverBlob);
      showCoverPreview(selectedCoverPreviewUrl);
      if ($('journeyPhotoStatus')) $('journeyPhotoStatus').textContent = `已轉成 WebP（${Math.max(1, Math.round(selectedCoverBlob.size / 1024))} KB），按儲存後上傳。`;
    } catch (error) {
      event.target.value = '';
      showCoverPreview('');
      if ($('journeyPhotoStatus')) $('journeyPhotoStatus').textContent = '照片處理失敗，請重新選擇。';
      alert(error.message);
    }
  }

  async function searchPlace(place, country) {
    const countryCodes = {'台灣':'tw','臺灣':'tw','日本':'jp','韓國':'kr','南韓':'kr','大韓民國':'kr','泰國':'th','新加坡':'sg','英國':'gb','英國（UK）':'gb','GB':'gb','UK':'gb','United Kingdom':'gb','法國':'fr','美國':'us'};
    const countryNames = {'GB':'United Kingdom','UK':'United Kingdom','英國（UK）':'United Kingdom'};
    const aliases = [
      [/廣安[裏里]海灘|廣安[裏里]沙灘/u, 'Gwangalli Beach, Busan'],
      [/釜山海雲台|海雲台海灘/u, 'Haeundae Beach, Busan'],
      [/倫敦大[本笨]鐘|大[本笨]鐘|Big Ben/iu, 'Big Ben, London'],
      [/西敏宮|倫敦國會大廈/u, 'Palace of Westminster, London']
    ];
    const normalized = aliases.reduce((value,[pattern,replacement])=>pattern.test(value)?replacement:value, place.trim());
    const query = [normalized, countryNames[country] || country].filter(Boolean).join(', ');
    const params = new URLSearchParams({ format:'jsonv2', q:query, limit:'1', 'accept-language':'zh-TW' });
    const code = countryCodes[country];
    if (code) params.set('countrycodes', code);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!response.ok) throw new Error('目前無法連線到地圖定位服務，請稍後再試。');
    const results = await response.json();
    return results[0] || null;
  }

  function parseCoordinates(value) {
    const match = String(value || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,，]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!match) return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude, pin_address:`${latitude}, ${longitude}` };
  }

  async function resolvePinLocation(place, country, cities) {
    if (!place) return { latitude:null, longitude:null, pin_address:'' };
    const directCoordinates = parseCoordinates(place);
    if (directCoordinates) return directCoordinates;
    let result = await searchPlace(place, country);
    if (!result) {
      const address = prompt(`找不到「${place}」的地理位置。\n\n請輸入較完整的實際地址，例如：宜蘭縣羅東鎮民權路。`);
      if (!address?.trim()) throw new Error('尚未找到代表地點，旅程尚未儲存。');
      const fallbackCoordinates = parseCoordinates(address);
      if (fallbackCoordinates) return fallbackCoordinates;
      result = await searchPlace(address.trim(), country);
      if (!result) throw new Error(`仍然找不到「${address.trim()}」，請確認地址後再試一次。`);
    }
    return { latitude:Number(result.lat), longitude:Number(result.lon), pin_address:result.display_name || '' };
  }

  async function signUp() {
    const email = $('authEmail')?.value.trim();
    const password = $('authPassword')?.value;
    if (!email || !password) return setAuthMessage('請輸入 Email 與密碼。', true);
    setAuthMessage('正在建立帳號…');
    const { error } = await client.auth.signUp({ email, password });
    if (error) return setAuthMessage(error.message, true);
    setAuthMessage('帳號已建立。若 Supabase 寄出確認信，請先點信中的確認連結，再回來登入。');
  }

  async function signIn() {
    const email = $('authEmail')?.value.trim();
    const password = $('authPassword')?.value;
    if (!email || !password) return setAuthMessage('請輸入 Email 與密碼。', true);
    setAuthMessage('正在登入…');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return setAuthMessage(error.message, true);
  }

  async function signOut() {
    await client.auth.signOut();
  }

  async function showSignedIn(user) {
    currentUser = user;
    $('authGate')?.classList.add('hidden');
    if ($('currentUserText')) $('currentUserText').textContent = user.email || '已登入';
    setStatus('Supabase 已連線', 'success');
    await initializeMasterData();
    await loadJourneys();
  }

  function showSignedOut() {
    currentUser = null;
    $('authGate')?.classList.remove('hidden');
    if ($('currentUserText')) $('currentUserText').textContent = '尚未登入';
    setStatus('等待登入');
  }

  function renderJourneys(rows, optionRows = []) {
    const list = document.querySelector('.journey-list');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<div class="expense-empty">資料庫目前沒有旅程。請按右上角「＋ 新增旅程」建立第一趟。</div>';
    } else {
      list.innerHTML = rows.map(row => {
        const details = row.details || {};
        const tags = Array.isArray(details.tags) ? details.tags : [];
        const summaryText = [row.summary || '', tags.join('、')].filter(Boolean).join(' · ') || '尚未填寫旅程摘要。';
        const searchText = `${row.country || ''} ${row.country === '台灣' ? '臺灣' : ''} ${row.country === '臺灣' ? '台灣' : ''} ${row.title || ''} ${row.summary || ''} ${row.main_currency || ''} ${details.region || ''} ${tags.join(' ')} ${(details.cities || []).join(' ')} ${(details.transports || []).join(' ')} ${details.pin_place || ''}`;
        return `
        <article class="journey-card" role="button" tabindex="0" data-region="${escapeHtml(details.region || window.inferRegionForCountry?.(row.country) || '其他')}" data-search="${escapeHtml(searchText)}" onclick="openDetail('${row.id}')">
          <div class="journey-top">
            <div><div class="eyebrow">${escapeHtml((row.country || 'TRIP').toUpperCase())}</div><h3>${escapeHtml(row.title)}</h3></div>
            <span class="status-badge">${journeyStatus(row)}</span>
          </div>
          <p class="journey-date">${formatDate(row.start_date)}－${formatDate(row.end_date)}</p>
          <p class="summary"><span>${escapeHtml(row.summary||'')}</span>${tags.length?`<span class="journey-tag-links">${tags.map(tag=>`<button type="button" data-filter-value="${escapeHtml(tag)}" onclick="filterHomeByValue(this.dataset.filterValue,event)">${escapeHtml(tag)}</button>`).join('')}</span>`:(!row.summary?'尚未填寫旅程摘要。':'')}</p>
          <div class="journey-bottom">
            <span>${escapeHtml(row.main_currency || 'TWD')}</span>
            <div class="icon-actions"><button type="button" aria-label="編輯旅程" data-edit-journey="${row.id}">✎</button><button type="button" aria-label="刪除旅程" data-delete-journey="${row.id}">⌫</button></div>
          </div>
        </article>`;
      }).join('');
    }
    const activeOptions=optionRows.filter(option=>option.is_active!==false).sort(optionCompare);
    window.setJourneyData?.(rows);
    window.setRegionCountryData?.(rows, activeOptions);
    window.setCurrencyData?.(rows, activeOptions);
    window.applyManagedMasterOptions?.(activeOptions);
    window.filterJourneys?.();
    if ($('journeyCount')) $('journeyCount').textContent = String(rows.length);
  }

  async function loadJourneys() {
    if (!currentUser) return;
    setStatus('正在讀取旅程…');
    const { data, error } = await client.from('journeys').select('*').order('start_date', { ascending: false });
    if (error) {
      console.error(error);
      setStatus(`讀取失敗：${error.message}`, 'error');
      return;
    }
    const rows = await Promise.all((data || []).map(resolveCoverUrl));
    let { data: optionRows, error: optionError } = await client.from('journey_options').select('*').order('created_at', { ascending: true });
    if (optionError) console.warn('讀取自訂選項失敗，請確認已執行 v1.2.9 SQL：', optionError.message);
    const knownCities=new Set((optionRows||[]).filter(row=>row.option_type==='city').map(row=>`${row.parent_value}|${row.value}`));
    const cityOptions=[];
    rows.forEach(row=>(row.details?.cities||[]).forEach(city=>{const value=String(city||'').trim().replace(/市$/u,'');const key=`${row.country||''}|${value}`;if(value&&!knownCities.has(key)){knownCities.add(key);cityOptions.push({owner_id:currentUser.id,option_type:'city',parent_value:row.country||'',value,is_active:true,sort_order:(knownCities.size+1)*10,updated_at:new Date().toISOString()})}}));
    if(cityOptions.length){const {data:newCities,error:cityError}=await client.from('journey_options').upsert(cityOptions,{onConflict:'owner_id,option_type,parent_value,value'}).select();if(cityError)console.warn('同步城市 Master Data 失敗：',cityError.message);else optionRows=[...(optionRows||[]),...(newCities||[])]}
    cachedJourneyRows=rows;
    cachedOptionRows=optionRows||[];
    renderJourneys(rows, cachedOptionRows);
    if ($('masterDataModal')?.classList.contains('show')) renderMasterManager();
    setStatus(`已載入 ${data?.length || 0} 趟旅程`, 'success');
  }

  async function initializeMasterData() {
    const { data: settings, error: settingsError } = await client.from('travel_archive_settings').select('master_data_initialized').eq('owner_id', currentUser.id).maybeSingle();
    if (settingsError) { console.warn('資料管理尚未啟用，請先執行 v1.3.0 SQL：', settingsError.message); return; }
    if (settings?.master_data_initialized) return;
    const rows=defaultOptions.map(([option_type,parent_value,value])=>({owner_id:currentUser.id,option_type,parent_value,value,is_active:true,sort_order:defaultSortOrder(option_type,parent_value,value)}));
    const { error: seedError } = await client.from('journey_options').upsert(rows,{onConflict:'owner_id,option_type,parent_value,value'});
    if (seedError) { console.warn('建立預設資料失敗：',seedError.message); return; }
    await client.from('travel_archive_settings').upsert({owner_id:currentUser.id,master_data_initialized:true,updated_at:new Date().toISOString()});
  }

  function optionUsage(option) {
    return cachedJourneyRows.reduce((count,row)=>{
      const details=row.details||{};
      if(option.option_type==='region'&&details.region===option.value)return count+1;
      if(option.option_type==='country'&&row.country===option.value)return count+1;
      if(option.option_type==='city'&&row.country===option.parent_value&&(details.cities||[]).some(city=>String(city).replace(/市$/u,'')===option.value))return count+1;
      if(option.option_type==='currency'&&row.main_currency===option.value)return count+1;
      if(option.option_type==='transport'&&(details.transports||[]).includes(option.value))return count+1;
      if(option.option_type==='tag'&&(details.tags||[]).includes(option.value))return count+1;
      return count;
    },0);
  }

  function renderMasterManager() {
    const tabs=$('masterManagerTabs'),list=$('masterManagerList'),parent=$('masterManagerParent');
    if(!tabs||!list||!parent)return;
    tabs.innerHTML=managerTypes.map(([type,label])=>`<button type="button" class="${type===activeManagerType?'active':''}" onclick="switchManagedOptionType('${type}')">${label}</button>`).join('');
    const regions=cachedOptionRows.filter(row=>row.option_type==='region'&&row.is_active!==false).sort(optionCompare),countries=cachedOptionRows.filter(row=>row.option_type==='country'&&row.is_active!==false).sort(optionCompare);
    const usesParent=['country','city'].includes(activeManagerType),filterParents=activeManagerType==='city'?countries:regions;
    parent.hidden=!usesParent;
    if(usesParent){if(!filterParents.some(row=>row.value===activeManagerParent))activeManagerParent=filterParents[0]?.value||'';parent.innerHTML=filterParents.map(row=>`<option value="${escapeHtml(row.value)}">${escapeHtml(row.value)}</option>`).join('');parent.value=activeManagerParent;parent.onchange=()=>setManagedParentFilter(parent.value)}else{activeManagerParent='';parent.onchange=null}
    const rows=cachedOptionRows.filter(row=>row.option_type===activeManagerType&&(!usesParent||row.parent_value===activeManagerParent)).sort(optionCompare);
    list.innerHTML=rows.map(row=>{
      const usage=optionUsage(row);
      const parentItems=row.option_type==='country'?regions:row.option_type==='city'?countries:[];
      const parentSelect=parentItems.length?`<select id="managed-parent-${row.id}">${parentItems.map(item=>`<option ${item.value===row.parent_value?'selected':''}>${escapeHtml(item.value)}</option>`).join('')}</select>`:'';
      return `<div class="master-manager-row ${row.is_active===false?'is-inactive':''}"><div><input id="managed-value-${row.id}" value="${escapeHtml(row.value)}">${parentSelect}</div><div class="master-manager-meta">${usage?`<button type="button" data-filter-value="${escapeHtml(row.value)}" onclick="filterHomeByValue(this.dataset.filterValue,event)">${usage} 個 Journey 使用・查看</button>`:`<span>0 個 Journey 使用</span>`}<b>${row.is_active===false?'已停用':'使用中'}</b></div><div class="master-manager-actions"><button type="button" aria-label="上移 ${escapeHtml(row.value)}" onclick="moveManagedOption('${row.id}',-1)">↑</button><button type="button" aria-label="下移 ${escapeHtml(row.value)}" onclick="moveManagedOption('${row.id}',1)">↓</button><button type="button" onclick="renameManagedOption('${row.id}')">儲存名稱</button><button type="button" onclick="toggleManagedOption('${row.id}')">${row.is_active===false?'啟用':'停用'}</button><button type="button" class="danger" onclick="deleteManagedOption('${row.id}')">刪除</button></div></div>`;
    }).join('')||'<div class="expense-empty">目前沒有這一類資料。</div>';
  }

  function openMasterDataModal(type='region'){activeManagerType=managerTypes.some(([value])=>value===type)?type:'region';activeManagerParent='';renderMasterManager();window.openExclusiveModal?.('masterDataModal')}
  function switchManagedOptionType(type){activeManagerType=type;activeManagerParent='';renderMasterManager()}
  function setManagedParentFilter(value){activeManagerParent=value||'';renderMasterManager()}

  async function addManagedOption(){
    const value=$('masterManagerNewValue')?.value.trim();if(!value)return;
    const parentValue=['country','city'].includes(activeManagerType)?$('masterManagerParent')?.value||'':'';
    const saved=await saveJourneyOption(activeManagerType,value,parentValue);
    if(saved===false)return alert('新增失敗，請確認已執行 v1.3.0 SQL。');
    $('masterManagerNewValue').value='';await loadJourneys();
  }

  async function syncOptionRename(option,newValue,newParent){
    for(const row of cachedJourneyRows){
      const details={...(row.details||{})};let payload=null;
      if(option.option_type==='region'&&details.region===option.value){details.region=newValue;payload={details}}
      if(option.option_type==='country'&&row.country===option.value)payload={country:newValue};
      if(option.option_type==='city'&&row.country===option.parent_value&&(details.cities||[]).some(city=>String(city).replace(/市$/u,'')===option.value)){details.cities=details.cities.map(city=>String(city).replace(/市$/u,'')===option.value?newValue:city);payload={details}}
      if(option.option_type==='currency'&&row.main_currency===option.value)payload={main_currency:newValue};
      if(option.option_type==='transport'&&(details.transports||[]).includes(option.value)){details.transports=details.transports.map(value=>value===option.value?newValue:value);payload={details}}
      if(option.option_type==='tag'&&(details.tags||[]).includes(option.value)){details.tags=details.tags.map(value=>value===option.value?newValue:value);payload={details}}
      if(payload){const {error}=await client.from('journeys').update({...payload,updated_at:new Date().toISOString()}).eq('id',row.id);if(error)throw error}
    }
    if(option.option_type==='region'){
      const {error:countryError}=await client.from('journey_options').update({parent_value:newValue,updated_at:new Date().toISOString()}).eq('option_type','country').eq('parent_value',option.value);
      if(countryError)throw countryError;
    }
    if(option.option_type==='country'){
      const {error:cityError}=await client.from('journey_options').update({parent_value:newValue,updated_at:new Date().toISOString()}).eq('option_type','city').eq('parent_value',option.value);
      if(cityError)throw cityError;
    }
    const {error}=await client.from('journey_options').update({value:newValue,parent_value:newParent??option.parent_value,updated_at:new Date().toISOString()}).eq('id',option.id);
    if(error)throw error;
  }

  async function renameManagedOption(id){
    const option=cachedOptionRows.find(row=>row.id===id);if(!option)return;
    const value=$(`managed-value-${id}`)?.value.trim(),parent=$(`managed-parent-${id}`)?.value??option.parent_value;
    if(!value)return alert('名稱不能空白。');
    if(value===option.value&&parent===option.parent_value)return;
    const usage=optionUsage(option);
    if(usage&&!confirm(`「${option.value}」目前用於 ${usage} 個 Journey。確定同步改名為「${value}」嗎？`))return;
    try{await syncOptionRename(option,value,parent);await loadJourneys()}catch(error){alert(`修改失敗：${error.message}`)}
  }

  async function toggleManagedOption(id){
    const option=cachedOptionRows.find(row=>row.id===id);if(!option)return;
    const {error}=await client.from('journey_options').update({is_active:option.is_active===false,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)return alert(`更新失敗：${error.message}`);await loadJourneys();
  }

  async function moveManagedOption(id,direction){
    const option=cachedOptionRows.find(row=>row.id===id);if(!option)return;
    const siblings=cachedOptionRows.filter(row=>row.option_type===option.option_type&&(!['country','city'].includes(option.option_type)||row.parent_value===option.parent_value)).sort(optionCompare);
    const index=siblings.findIndex(row=>row.id===id),targetIndex=index+Number(direction);
    if(index<0||targetIndex<0||targetIndex>=siblings.length)return;
    const reordered=[...siblings];const [moved]=reordered.splice(index,1);reordered.splice(targetIndex,0,moved);
    reordered.forEach((row,position)=>{row.sort_order=(position+1)*10});
    renderMasterManager();
    const activeOptions=cachedOptionRows.filter(row=>row.is_active!==false).sort(optionCompare);
    window.setRegionCountryData?.(cachedJourneyRows,activeOptions);
    window.applyManagedMasterOptions?.(activeOptions);
    const updatedAt=new Date().toISOString();
    const results=await Promise.all(reordered.map(row=>client.from('journey_options').update({sort_order:row.sort_order,updated_at:updatedAt}).eq('id',row.id)));
    const failed=results.find(result=>result.error);
    if(failed){alert(`順序儲存失敗：${failed.error.message}`);await loadJourneys();}
  }

  async function deleteManagedOption(id){
    const option=cachedOptionRows.find(row=>row.id===id);if(!option)return;
    const usage=optionUsage(option);
    if(option.option_type==='region'&&cachedOptionRows.some(row=>row.option_type==='country'&&row.parent_value===option.value))return alert(`「${option.value}」底下仍有國家，請先移動或刪除這些國家，再刪除地區。`);
    if(usage)return alert(`「${option.value}」目前仍用於 ${usage} 個 Journey，不能刪除。請改用「停用」。`);
    if(!confirm(`確定永久刪除「${option.value}」嗎？`))return;
    const {error}=await client.from('journey_options').delete().eq('id',id);
    if(error)return alert(`刪除失敗：${error.message}`);await loadJourneys();
  }

  async function saveJourneySummary(journeyId, summary, tags = null) {
    if (!currentUser || !journeyId) return false;
    setStatus('正在儲存旅程總心得…');
    let details;
    if (Array.isArray(tags)) {
      const { data, error: readError } = await client.from('journeys').select('details').eq('id', journeyId).single();
      if (readError) {
        setStatus(`旅遊標籤讀取失敗：${readError.message}`, 'error');
        alert(`旅遊標籤讀取失敗：${readError.message}`);
        return false;
      }
      details = { ...(data?.details || {}), tags };
    }
    const payload = {
      summary: summary || null,
      updated_at: new Date().toISOString()
    };
    if (details) payload.details = details;
    const { error } = await client.from('journeys').update(payload).eq('id', journeyId);
    if (error) {
      console.error(error);
      setStatus(`總心得儲存失敗：${error.message}`, 'error');
      alert(`總心得儲存失敗：${error.message}`);
      return false;
    }
    if(Array.isArray(tags))for(const tag of tags)await saveJourneyOption('tag',tag,'');
    await loadJourneys();
    return true;
  }

  function resetJourneyForm() {
    const modal = $('journeyModal');
    modal?.querySelectorAll('input').forEach(input => {
      if (input.type === 'checkbox') input.checked = false;
      else if (!['button','submit','hidden'].includes(input.type)) input.value = '';
    });
    modal?.querySelectorAll('textarea').forEach(input => { input.value = ''; });
    if ($('journeyRegion')) $('journeyRegion').selectedIndex = 0;
    window.syncJourneyCountryOptions?.();
    setFieldValue('journeyMainCurrency', 'TWD');
    setFieldValue('journeyDefaultRate', '1');
    if ($('applyExpenseTemplate')) $('applyExpenseTemplate').checked = true;
    if ($('cityInputGrid')) $('cityInputGrid').innerHTML = '<input placeholder="城市／地區 1">';
    if ($('journeyPhotoInput')) $('journeyPhotoInput').value = '';
    if (selectedCoverPreviewUrl) URL.revokeObjectURL(selectedCoverPreviewUrl);
    selectedCoverPreviewUrl = '';
    selectedCoverBlob = null;
    existingCoverPath = '';
    showCoverPreview('');
    if ($('journeyPhotoStatus')) $('journeyPhotoStatus').textContent = '可上傳 JPG、PNG 或 WebP；儲存時會自動轉成 WebP。';
    $('rentalFields')?.classList.remove('show');
    window.toggleFlightFields?.();
    window.syncJourneyDateFields?.();
  }

  function openJourneyForEdit(row) {
    resetJourneyForm();
    editingJourneyId = row.id;
    existingCoverPath = row.cover_path || '';
    const details = row.details || {};
    setFieldValue('journeyName', row.title);
    setFieldValue('journeyStart', row.start_date);
    setFieldValue('journeyEnd', row.end_date);
    setFieldValue('journeyMainCurrency', row.main_currency || 'TWD');
    setFieldValue('journeyDefaultRate', row.default_exchange_rate ?? 1);
    const editRegion=details.region || window.inferRegionForCountry?.(row.country) || '其他';
    if($('journeyRegion')&&![...$('journeyRegion').options].some(option=>option.value===editRegion))$('journeyRegion').add(new Option(editRegion,editRegion));
    setFieldValue('journeyRegion', editRegion);
    window.syncJourneyCountryOptions?.(row.country || '');
    setFieldValue('journeyPinPlace', details.pin_place);
    const cityGrid = $('cityInputGrid');
    if (cityGrid) {
      cityGrid.innerHTML = '';
      (details.cities?.length ? details.cities : ['']).forEach(city => window.addCityInput?.(city));
    }
    if ($('journeyNoFlight')) $('journeyNoFlight').checked = Boolean(details.no_flight);
    setFieldValue('journeyAirline', details.airline);
    ['Date','Number','From','To','DepartTime','ArriveTime'].forEach(part => {
      setFieldValue(`journeyOutbound${part}`, details.outbound?.[part.charAt(0).toLowerCase() + part.slice(1)]);
      setFieldValue(`journeyInbound${part}`, details.inbound?.[part.charAt(0).toLowerCase() + part.slice(1)]);
    });
    document.querySelectorAll('[data-journey-transport]').forEach(input => { input.checked = (details.transports || []).includes(input.value); });
    setFieldValue('journeyOtherTransport', details.other_transport);
    setFieldValue('journeyRentalCompany', details.rental?.company);
    setFieldValue('journeyRentalPickup', details.rental?.pickup);
    setFieldValue('journeyRentalReturn', details.rental?.return_place);
    setFieldValue('journeyRentalPickupAt', details.rental?.pickup_at);
    setFieldValue('journeyRentalReturnAt', details.rental?.return_at);
    document.querySelectorAll('[data-rental-option]').forEach(input => { input.checked = (details.rental?.options || []).includes(input.value); });
    $('rentalFields')?.classList.toggle('show', (details.transports || []).includes('租車'));
    window.toggleFlightFields?.();
    window.syncJourneyDateFields?.();
    showCoverPreview(row.cover_url || '');
    if ($('journeyPhotoStatus')) $('journeyPhotoStatus').textContent = existingCoverPath ? '目前照片已保存；重新選擇檔案即可更換。' : '可上傳 JPG、PNG 或 WebP；儲存時會自動轉成 WebP。';
    window.openJourneyModal('edit');
  }

  async function editJourney(id) {
    const { data, error } = await client.from('journeys').select('*').eq('id', id).single();
    if (error) return alert(`讀取旅程失敗：${error.message}`);
    openJourneyForEdit(await resolveCoverUrl(data));
  }

  async function deleteJourney(id, options = {}) {
    if (!confirm('確定刪除這趟旅程嗎？此動作之後會一併刪除相關 Day、Spot 與費用。')) return;
    const { error } = await client.from('journeys').delete().eq('id', id);
    if (error) return alert(`刪除失敗：${error.message}`);
    if (options.returnHome) window.closeDetail?.();
    await loadJourneys();
  }

  async function saveJourneyOption(optionType, value, parentValue = '') {
    if (!currentUser) return false;
    const siblingOrders=cachedOptionRows.filter(row=>row.option_type===optionType&&(!['country','city'].includes(optionType)||row.parent_value===(parentValue||''))).map(row=>Number(row.sort_order)||0);
    const payload = { owner_id:currentUser.id, option_type:optionType, parent_value:parentValue || '', value, is_active:true, sort_order:Math.max(0,...siblingOrders)+10, updated_at:new Date().toISOString() };
    const { error } = await client.from('journey_options').upsert(payload, { onConflict:'owner_id,option_type,parent_value,value' });
    if (error) { console.error(error); return false; }
    return true;
  }

  async function saveJourney() {
    if (!currentUser) return alert('請先登入。');
    const title = $('journeyName')?.value.trim();
    const startDate = $('journeyStart')?.value;
    const endDate = $('journeyEnd')?.value;
    if (!title || !startDate || !endDate) return alert('請填寫旅程名稱、開始日期與結束日期。');
    if (endDate < startDate) return alert('結束日期不能早於開始日期。');
    const boundedFields = [['journeyRentalPickupAt','租車取車時間'],['journeyRentalReturnAt','租車還車時間']];
    for (const [id,label] of boundedFields) {
      const input = $(id);
      if (input?.value && !window.validateJourneyBoundedDate?.(input,label)) return;
    }

    const country = fieldValue('journeyCountry');
    const cities = [...document.querySelectorAll('#cityInputGrid input')].map(input => input.value.trim()).filter(Boolean);
    let location;
    try {
      if (fieldValue('journeyPinPlace').trim()) setStatus('正在確認代表地點位置…');
      location = await resolvePinLocation(fieldValue('journeyPinPlace').trim(), country, cities);
    } catch (error) {
      setStatus(error.message, 'error');
      return alert(error.message);
    }

    const details = {
      region: fieldValue('journeyRegion'),
      cities,
      pin_place: fieldValue('journeyPinPlace').trim(),
      pin_address: location.pin_address,
      latitude: location.latitude,
      longitude: location.longitude,
      no_flight: Boolean($('journeyNoFlight')?.checked),
      airline: fieldValue('journeyAirline').trim(),
      outbound: {
        date: fieldValue('journeyOutboundDate'), number: fieldValue('journeyOutboundNumber').trim(),
        from: fieldValue('journeyOutboundFrom').trim(), to: fieldValue('journeyOutboundTo').trim(),
        departTime: fieldValue('journeyOutboundDepartTime'), arriveTime: fieldValue('journeyOutboundArriveTime')
      },
      inbound: {
        date: fieldValue('journeyInboundDate'), number: fieldValue('journeyInboundNumber').trim(),
        from: fieldValue('journeyInboundFrom').trim(), to: fieldValue('journeyInboundTo').trim(),
        departTime: fieldValue('journeyInboundDepartTime'), arriveTime: fieldValue('journeyInboundArriveTime')
      },
      transports: [...document.querySelectorAll('[data-journey-transport]:checked')].map(input => input.value),
      other_transport: fieldValue('journeyOtherTransport').trim(),
      rental: {
        company: fieldValue('journeyRentalCompany').trim(), pickup: fieldValue('journeyRentalPickup').trim(),
        return_place: fieldValue('journeyRentalReturn').trim(), pickup_at: fieldValue('journeyRentalPickupAt'),
        return_at: fieldValue('journeyRentalReturnAt'),
        options: [...document.querySelectorAll('[data-rental-option]:checked')].map(input => input.value)
      }
    };
    const journeyId = editingJourneyId || crypto.randomUUID();
    let coverPath = existingCoverPath || null;
    if (selectedCoverBlob) {
      coverPath = `${currentUser.id}/${journeyId}.webp`;
      setStatus('正在上傳 WebP 照片…');
      const { error: uploadError } = await client.storage.from('journey-covers').upload(coverPath, selectedCoverBlob, { contentType: 'image/webp', upsert: true });
      if (uploadError) {
        setStatus(`照片上傳失敗：${uploadError.message}`, 'error');
        return alert(`照片上傳失敗：${uploadError.message}`);
      }
    }

    const payload = {
      owner_id: currentUser.id,
      user_id: currentUser.id,
      title,
      country: country || null,
      start_date: startDate,
      end_date: endDate,
      main_currency: $('journeyMainCurrency')?.value || 'TWD',
      default_exchange_rate: Number($('journeyDefaultRate')?.value || 1),
      details,
      cover_path: coverPath,
      updated_at: new Date().toISOString()
    };

    setStatus(editingJourneyId ? '正在更新旅程…' : '正在儲存旅程…');
    const query = editingJourneyId
      ? client.from('journeys').update(payload).eq('id', editingJourneyId)
      : client.from('journeys').insert({ id: journeyId, ...payload });
    const { error } = await query;
    if (error) {
      console.error(error);
      setStatus(`儲存失敗：${error.message}`, 'error');
      return alert(`儲存失敗：${error.message}`);
    }
    editingJourneyId = null;
    existingCoverPath = '';
    selectedCoverBlob = null;
    window.closeModal('journeyModal');
    await loadJourneys();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('signUpButton')?.addEventListener('click', signUp);
    $('signInButton')?.addEventListener('click', signIn);
    $('logoutButton')?.addEventListener('click', signOut);
    $('journeyPhotoInput')?.addEventListener('change', handleCoverSelection);
    document.querySelector('.journey-list')?.addEventListener('click', event => {
      const editButton = event.target.closest('[data-edit-journey]');
      const deleteButton = event.target.closest('[data-delete-journey]');
      if (editButton) { event.stopPropagation(); editJourney(editButton.dataset.editJourney); }
      if (deleteButton) { event.stopPropagation(); deleteJourney(deleteButton.dataset.deleteJourney); }
    }, true);

    // Replace prototype-only save with real Supabase save.
    window.saveJourneyPrototype = saveJourney;
    window.travelArchiveEditJourney = editJourney;
    window.travelArchiveDeleteJourney = deleteJourney;
    window.saveJourneyOption = saveJourneyOption;
    window.saveJourneySummary = saveJourneySummary;
    window.openMasterDataModal = openMasterDataModal;
    window.switchManagedOptionType = switchManagedOptionType;
    window.setManagedParentFilter = setManagedParentFilter;
    window.addManagedOption = addManagedOption;
    window.renameManagedOption = renameManagedOption;
    window.toggleManagedOption = toggleManagedOption;
    window.moveManagedOption = moveManagedOption;
    window.deleteManagedOption = deleteManagedOption;
    const originalOpenJourneyModal = window.openJourneyModal;
    window.openJourneyModal = function(mode) {
      if (mode !== 'edit') {
        editingJourneyId = null;
        resetJourneyForm();
      }
      originalOpenJourneyModal();
    };
    resetJourneyForm();

    const { data: { session } } = await client.auth.getSession();
    session?.user ? showSignedIn(session.user) : showSignedOut();
    client.auth.onAuthStateChange((_event, session) => session?.user ? showSignedIn(session.user) : showSignedOut());
  });
})();
