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

  function showSignedIn(user) {
    currentUser = user;
    $('authGate')?.classList.add('hidden');
    if ($('currentUserText')) $('currentUserText').textContent = user.email || '已登入';
    setStatus('Supabase 已連線', 'success');
    loadJourneys();
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
      list.innerHTML = rows.slice(0, 5).map(row => {
        const details = row.details || {};
        const tags = Array.isArray(details.tags) ? details.tags : [];
        const summaryText = [row.summary || '', tags.join('、')].filter(Boolean).join(' · ') || '尚未填寫旅程摘要。';
        const searchText = `${row.country || ''} ${row.country === '台灣' ? '臺灣' : ''} ${row.country === '臺灣' ? '台灣' : ''} ${row.title || ''} ${row.summary || ''} ${tags.join(' ')} ${(details.cities || []).join(' ')} ${details.pin_place || ''}`;
        return `
        <article class="journey-card" role="button" tabindex="0" data-region="${escapeHtml(details.region || window.inferRegionForCountry?.(row.country) || '其他')}" data-search="${escapeHtml(searchText)}" onclick="openDetail('${row.id}')">
          <div class="journey-top">
            <div><div class="eyebrow">${escapeHtml((row.country || 'TRIP').toUpperCase())}</div><h3>${escapeHtml(row.title)}</h3></div>
            <span class="status-badge">${journeyStatus(row)}</span>
          </div>
          <p class="journey-date">${formatDate(row.start_date)}－${formatDate(row.end_date)}</p>
          <p class="summary">${escapeHtml(summaryText)}</p>
          <div class="journey-bottom">
            <span>${escapeHtml(row.main_currency || 'TWD')}</span>
            <div class="icon-actions"><button type="button" aria-label="編輯旅程" data-edit-journey="${row.id}">✎</button><button type="button" aria-label="刪除旅程" data-delete-journey="${row.id}">⌫</button></div>
          </div>
        </article>`;
      }).join('');
    }
    window.setJourneyData?.(rows);
    window.setRegionCountryData?.(rows, optionRows);
    window.setCurrencyData?.(rows, optionRows);
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
    const { data: optionRows, error: optionError } = await client.from('journey_options').select('*').order('created_at', { ascending: true });
    if (optionError) console.warn('讀取自訂選項失敗，請確認已執行 v1.2.9 SQL：', optionError.message);
    renderJourneys(rows, optionRows || []);
    setStatus(`已載入 ${data?.length || 0} 趟旅程`, 'success');
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
    setFieldValue('journeyRegion', details.region || window.inferRegionForCountry?.(row.country) || '其他');
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
    const payload = { owner_id:currentUser.id, option_type:optionType, parent_value:parentValue || '', value };
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
