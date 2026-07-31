(() => {
  const SUPABASE_URL = 'https://wlxnqjytmimiuxtzffds.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_86eZkbkNPi2-eZKPL23UPg_MOkXg_mO';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.travelArchiveSupabase = client;

  let currentUser = null;
  let editingJourneyId = null;

  const $ = id => document.getElementById(id);
  const setStatus = (text, type = '') => {
    const el = $('dbStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `db-status ${type}`.trim();
  };
  const setAuthMessage = (text, error = false) => {
    const el = $('authMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `auth-message${error ? ' error' : ''}`;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const formatDate = value => value ? new Intl.DateTimeFormat('zh-TW', {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(`${value}T00:00:00`)) : '';

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
      list.innerHTML = rows.map(row => `
        <article class="journey-card" role="button" tabindex="0" data-region="其他" data-search="${escapeHtml(`${row.country || ''} ${row.title || ''}`)}" onclick="openDetail()">
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
        </article>`).join('');
    }
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
    renderJourneys(data || []);
    setStatus(`已載入 ${data?.length || 0} 趟旅程`, 'success');
  }

  function openJourneyForEdit(row) {
    editingJourneyId = row.id;
    $('journeyName').value = row.title || '';
    $('journeyCountry').value = row.country || '其他';
    $('journeyStart').value = row.start_date || '';
    $('journeyEnd').value = row.end_date || '';
    $('journeyMainCurrency').value = row.main_currency || 'TWD';
    $('journeyDefaultRate').value = row.default_exchange_rate ?? 1;
    window.openJourneyModal();
  }

  async function editJourney(id) {
    const { data, error } = await client.from('journeys').select('*').eq('id', id).single();
    if (error) return alert(`讀取旅程失敗：${error.message}`);
    openJourneyForEdit(data);
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

    const payload = {
      user_id: currentUser.id,
      title,
      country: $('journeyCountry')?.value || null,
      start_date: startDate,
      end_date: endDate,
      main_currency: $('journeyMainCurrency')?.value || 'TWD',
      default_exchange_rate: Number($('journeyDefaultRate')?.value || 1),
      summary: null,
      updated_at: new Date().toISOString()
    };

    setStatus(editingJourneyId ? '正在更新旅程…' : '正在儲存旅程…');
    const query = editingJourneyId
      ? client.from('journeys').update(payload).eq('id', editingJourneyId)
      : client.from('journeys').insert(payload);
    const { error } = await query;
    if (error) {
      console.error(error);
      setStatus(`儲存失敗：${error.message}`, 'error');
      return alert(`儲存失敗：${error.message}`);
    }
    editingJourneyId = null;
    window.closeModal('journeyModal');
    await loadJourneys();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('signUpButton')?.addEventListener('click', signUp);
    $('signInButton')?.addEventListener('click', signIn);
    $('logoutButton')?.addEventListener('click', signOut);
    document.querySelector('.journey-list')?.addEventListener('click', event => {
      const editButton = event.target.closest('[data-edit-journey]');
      const deleteButton = event.target.closest('[data-delete-journey]');
      if (editButton) { event.stopPropagation(); editJourney(editButton.dataset.editJourney); }
      if (deleteButton) { event.stopPropagation(); deleteJourney(deleteButton.dataset.deleteJourney); }
    });

    // Replace prototype-only save with real Supabase save.
    window.saveJourneyPrototype = saveJourney;
    const originalOpenJourneyModal = window.openJourneyModal;
    window.openJourneyModal = function() {
      if (!editingJourneyId) {
        $('journeyName').value = '';
        $('journeyStart').value = new Date().toISOString().slice(0,10);
        $('journeyEnd').value = new Date().toISOString().slice(0,10);
      }
      originalOpenJourneyModal();
    };

    const { data: { session } } = await client.auth.getSession();
    session?.user ? showSignedIn(session.user) : showSignedOut();
    client.auth.onAuthStateChange((_event, session) => session?.user ? showSignedIn(session.user) : showSignedOut());
  });
})();
