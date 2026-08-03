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

  function renderJourneys(rows) {
    const list = document.querySelector('.journey-list');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<div class="expense-empty">資料庫目前沒有旅程。請按右上角「＋ 新增旅程」建立第一趟。</div>';
    } else {
      list.innerHTML = rows.map(row => {
        const details = row.details || {};
        const searchText = `${row.country || ''} ${row.country === '台灣' ? '臺灣' : ''} ${row.country === '臺灣' ? '台灣' : ''} ${row.title || ''} ${(details.cities || []).join(' ')} ${details.pin_place || ''}`;
        return `
        <article class="journey-card" role="button" tabindex="0" data-region="${escapeHtml(details.region || '其他')}" data-search="${escapeHtml(searchText)}" onclick="openDetail('${row.id}')">
          <div class="journey-top">
            <div><div class="eyebrow">${escapeHtml((row.country || 'TRIP').toUpperCase())}</div><h3>${escapeHtml(row.title)}</h3></div>
            <span class="status-badge">已保存</span>
          </div>
          <p class="journey-date">${formatDate(row.start_date)}－${formatDate(row.end_date)}</p>
          <p class="summary">${escapeHtml(row.summary || '尚未填寫旅程摘要。')}</p>
          <div class="journey-bottom">
            <span>${escapeHtml(row.main_currency || 'TWD')}</span>
            <div class="icon-actions"><button type="button" aria-label="編輯旅程" data-edit-journey="${row.id}">✎</button><button type="button" aria-label="刪除旅程" data-delete-journey="${row.id}">⌫</button></div>
          </div>
        </article>`;
      }).join('');
    }
    window.setJourneyData?.(rows);
    if ($('journeyCount')) $('journeyCount').textContent = String(rows.length);
    if ($('countryCount')) $('countryCount').textContent = String(new Set(rows.map(row => row.country).filter(Boolean)).size);
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
    renderJourneys(rows);
    setStatus(`已載入 ${data?.length || 0} 趟旅程`, 'success');
  }

  function resetJourneyForm() {
    const modal = $('journeyModal');
    modal?.querySelectorAll('input').forEach(input => {
      if (input.type === 'checkbox') input.checked = false;
      else if (!['button','submit','hidden'].includes(input.type)) input.value = '';
    });
    modal?.querySelectorAll('textarea').forEach(input => { input.value = ''; });
    if ($('journeyRegion')) $('journeyRegion').selectedIndex = 0;
    if ($('journeyCountry')) $('journeyCountry').selectedIndex = 0;
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
  }

  function openJourneyForEdit(row) {
    resetJourneyForm();
    editingJourneyId = row.id;
    existingCoverPath = row.cover_path || '';
    const details = row.details || {};
    setFieldValue('journeyName', row.title);
    setFieldValue('journeyCountry', row.country || '其他');
    setFieldValue('journeyStart', row.start_date);
    setFieldValue('journeyEnd', row.end_date);
    setFieldValue('journeyMainCurrency', row.main_currency || 'TWD');
    setFieldValue('journeyDefaultRate', row.default_exchange_rate ?? 1);
    if (details.region) setFieldValue('journeyRegion', details.region);
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
    showCoverPreview(row.cover_url || '');
    if ($('journeyPhotoStatus')) $('journeyPhotoStatus').textContent = existingCoverPath ? '目前照片已保存；重新選擇檔案即可更換。' : '可上傳 JPG、PNG 或 WebP；儲存時會自動轉成 WebP。';
    window.openJourneyModal('edit');
  }

  async function editJourney(id) {
    const { data, error } = await client.from('journeys').select('*').eq('id', id).single();
    if (error) return alert(`讀取旅程失敗：${error.message}`);
    openJourneyForEdit(await resolveCoverUrl(data));
  }

  async function deleteJourney(id) {
    if (!confirm('確定刪除這趟旅程嗎？此動作之後會一併刪除相關 Day、Spot 與費用。')) return;
    const { error } = await client.from('journeys').delete().eq('id', id);
    if (error) return alert(`刪除失敗：${error.message}`);
    await loadJourneys();
  }

  async function saveJourney() {
    if (!currentUser) return alert('請先登入。');
    const title = $('journeyName')?.value.trim();
    const startDate = $('journeyStart')?.value;
    const endDate = $('journeyEnd')?.value;
    if (!title || !startDate || !endDate) return alert('請填寫旅程名稱、開始日期與結束日期。');
    if (endDate < startDate) return alert('結束日期不能早於開始日期。');

    const details = {
      region: fieldValue('journeyRegion'),
      cities: [...document.querySelectorAll('#cityInputGrid input')].map(input => input.value.trim()).filter(Boolean),
      pin_place: fieldValue('journeyPinPlace').trim(),
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
      country: $('journeyCountry')?.value || null,
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
