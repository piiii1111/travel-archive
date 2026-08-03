let journeys = [];
let map;
let journeyMarkerLayer;
let activeJourneyId = null;

function normalizeText(value){return String(value || '').trim().replace(/\s+/g,' ')}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function displayDate(value){return value?value.replaceAll('-','.'):'未設定'}
function dateTimeText(value){return value?value.replace('T',' ').replaceAll('-','.'):'未填寫'}
function renderStats(){
  const countries = new Set(); const cities = new Set();
  journeys.forEach(j=>{countries.add(normalizeText(j.country));(j.cities||[]).forEach(c=>cities.add(normalizeText(c)))});
  document.getElementById('journeyCount').textContent=journeys.length;
  document.getElementById('countryCount').textContent=[...countries].filter(Boolean).length;
  document.getElementById('cityCount').textContent=[...cities].filter(Boolean).length;
}
function renderTimeline(){
  const root=document.getElementById('archiveTimelineGrid'); if(!root)return;
  const groups=journeys.reduce((acc,j)=>((acc[j.year]??=[]).push(j),acc),{});
  root.innerHTML=Object.keys(groups).sort((a,b)=>b-a).map(year=>{
    const trips=groups[year].sort((a,b)=>b.start.localeCompare(a.start));
    return `<section class="archive-year-group"><div class="archive-year-label"><span></span><b>${year}</b></div><div class="archive-year-trips">${trips.map(j=>`<button class="archive-trip-card" type="button" onclick="openDetail('${j.id}')"><img src="${j.photo}" alt="${j.title}"><span class="archive-trip-body"><b>${j.title}</b><small>${j.date}</small><small>${j.country}${j.cities.length ? ` · ${j.cities.join('、')}` : ''}</small></span></button>`).join('')}</div></section>`
  }).join('') || '<div class="expense-empty">目前還沒有旅程。</div>';
}
function initMap(){
  if(!window.L || !document.getElementById('map')) return;
  map=L.map('map',{zoomControl:true}).setView([29.4,129.5],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  journeyMarkerLayer=L.layerGroup().addTo(map);
  renderMapPins();
}
function journeyCoordinates(j,index){
  const lat=Number(j.latitude);const lng=Number(j.longitude);
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat&&lng)return [lat,lng];
  const text=`${j.title} ${j.country} ${(j.cities||[]).join(' ')}`;
  const known=[['淡水',[25.1676,121.445]],['墾丁',[21.946,120.797]],['名古屋',[35.1815,136.9066]],['東京',[35.6762,139.6503]],['台灣',[23.6978,120.9605]],['日本',[36.2048,138.2529]],['韓國',[35.9078,127.7669]],['泰國',[15.87,100.9925]]];
  const found=known.find(([name])=>text.includes(name));
  const base=found?.[1]||[23.6978,120.9605];
  return [base[0]+index*0.025,base[1]+index*0.025];
}
function renderMapPins(){
  if(!map||!journeyMarkerLayer)return;
  journeyMarkerLayer.clearLayers();
  const points=[];
  journeys.forEach((j,index)=>{
    const coords=journeyCoordinates(j,index);points.push(coords);
    const icon=L.divIcon({className:'photo-pin-wrap',html:`<button class="photo-pin" type="button" aria-label="開啟 ${j.title}"><img src="${j.photo}" alt="${j.title}"></button>`,iconSize:[48,48],iconAnchor:[24,24]});
    L.marker(coords,{icon}).addTo(journeyMarkerLayer).on('click',()=>openDetail(j.id));
  });
  if(points.length)map.fitBounds(points,{padding:[45,45],maxZoom:6});
}
function setJourneyData(rows){
  journeys=(rows||[]).map((row,index)=>{
    const start=row.start_date||'';const end=row.end_date||'';
    const details=row.details||{};
    return {id:row.id,title:row.title||'未命名旅程',country:row.country||'',cities:Array.isArray(details.cities)?details.cities:[],region:details.region||'其他',year:Number(start.slice(0,4))||'未定',start,end,date:start&&end?`${start.replaceAll('-','.')}－${end.replaceAll('-','.')}`:'日期未設定',photo:row.cover_url||'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=700&q=82',latitude:row.latitude,longitude:row.longitude,currency:row.main_currency||'TWD',details,index};
  });
  renderStats();renderTimeline();renderMapPins();
}
window.setJourneyData=setJourneyData;
function switchHomeView(mode,button){
  document.querySelectorAll('.archive-view-tab').forEach(b=>b.classList.toggle('active',b===button));
  document.getElementById('mapCard').classList.toggle('hidden',mode!=='map');
  document.getElementById('archiveTimeline').classList.toggle('hidden',mode!=='timeline');
  if(mode==='map'&&map)setTimeout(()=>map.invalidateSize(),50);
}
function openDetail(journeyId){
  const journey=journeys.find(item=>String(item.id)===String(journeyId));
  if(journey){
    activeJourneyId=journey.id;
    document.getElementById('detailTitle').textContent=journey.title;
    document.getElementById('detailEyebrow').textContent=`${journey.country}${journey.cities.length?` · ${journey.cities[0]}`:''}`;
    const days=journey.start&&journey.end?Math.max(1,Math.round((new Date(`${journey.end}T00:00:00`)-new Date(`${journey.start}T00:00:00`))/86400000)+1):null;
    document.getElementById('detailMetaText').textContent=`${journey.date}${days?`　｜　${days} 天 ${Math.max(0,days-1)} 夜`:''}${journey.details.pin_place?`　｜　代表地點：${journey.details.pin_place}`:''}`;
    document.getElementById('detailHero').style.backgroundImage=`url("${String(journey.photo).replaceAll('"','%22')}")`;
    document.getElementById('heroCurrencyBadge').textContent=journey.currency;
    const today=new Date();today.setHours(0,0,0,0);
    const start=journey.start?new Date(`${journey.start}T00:00:00`):null;
    const end=journey.end?new Date(`${journey.end}T23:59:59`):null;
    document.getElementById('heroStatusBadge').textContent=start&&start>today?'規劃中':end&&end<today?'已完成':'旅途中';
    renderJourneyInfo(journey);
  }
  document.getElementById('homeView').classList.add('hidden');document.getElementById('detailView').classList.add('active');document.getElementById('dbStatus')?.classList.add('hidden');closeDayMenus();window.scrollTo(0,0)
}
function renderJourneyInfo(journey){
  const root=document.querySelector('.journey-info-grid');if(!root)return;
  const d=journey.details||{};
  const route=(flight)=>`${flight?.from||'未填寫'} → ${flight?.to||'未填寫'}`;
  const flightCard=(label,flight)=>`<article class="journey-info-card"><div class="journey-info-icon">✈</div><div><div class="eyebrow">${label}</div><h3>${escapeHtml(route(flight))}</h3><dl><div><dt>航班</dt><dd>${escapeHtml([d.airline,flight?.number].filter(Boolean).join(' ')||'未填寫')}</dd></div><div><dt>時間</dt><dd>${escapeHtml([flight?.date,flight?.departTime,flight?.arriveTime].filter(Boolean).join('　')||'未填寫')}</dd></div><div><dt>機場</dt><dd>${escapeHtml(route(flight))}</dd></div></dl></div></article>`;
  const rental=d.rental||{};
  root.innerHTML=`
    <article class="journey-info-card"><div class="journey-info-icon">旅</div><div><div class="eyebrow">基本資料</div><h3>${escapeHtml(journey.title)}</h3><dl><div><dt>日期</dt><dd>${escapeHtml(journey.date)}</dd></div><div><dt>國家</dt><dd>${escapeHtml(journey.country||'未填寫')}</dd></div><div><dt>城市／地區</dt><dd>${escapeHtml(journey.cities.join('、')||'未填寫')}</dd></div></dl></div></article>
    ${d.no_flight?'<article class="journey-info-card"><div class="journey-info-icon">✈</div><div><div class="eyebrow">航班資訊</div><h3>本次旅程沒有搭乘飛機</h3></div></article>':`${flightCard('去程航班',d.outbound)}${flightCard('回程航班',d.inbound)}`}
    <article class="journey-info-card"><div class="journey-info-icon">車</div><div><div class="eyebrow">交通／租車資料</div><h3>${escapeHtml(rental.company||d.transports?.join('、')||'未填寫')}</h3><dl><div><dt>取車</dt><dd>${escapeHtml(`${dateTimeText(rental.pickup_at)}${rental.pickup?`・${rental.pickup}`:''}`)}</dd></div><div><dt>還車</dt><dd>${escapeHtml(`${dateTimeText(rental.return_at)}${rental.return_place?`・${rental.return_place}`:''}`)}</dd></div><div><dt>配備</dt><dd>${escapeHtml(rental.options?.join('、')||'未填寫')}</dd></div></dl></div></article>
    <article class="journey-info-card"><div class="journey-info-icon">⌖</div><div><div class="eyebrow">代表地點</div><h3>${escapeHtml(d.pin_place||'未填寫')}</h3><dl><div><dt>主要交通</dt><dd>${escapeHtml([...(d.transports||[]),d.other_transport].filter(Boolean).join('、')||'未填寫')}</dd></div></dl></div></article>`;
}
function editActiveJourney(){
  if(!activeJourneyId)return;
  window.travelArchiveEditJourney?.(activeJourneyId);
}
function closeDetail(){document.getElementById('detailView').classList.remove('active');document.getElementById('homeView').classList.remove('hidden');document.getElementById('dbStatus')?.classList.remove('hidden');window.scrollTo(0,0);if(map)setTimeout(()=>map.invalidateSize(),50)}
function showDay(day,button){document.querySelectorAll('.day-tab').forEach(b=>b.classList.remove('active'));button.classList.add('active');document.querySelectorAll('.day-section').forEach(s=>s.classList.toggle('active',String(s.dataset.day)===String(day)))}
function openJourneyModal(){document.getElementById('journeyModal')?.classList.add('show');document.body.classList.add('modal-open')}
function openDayModal(){document.getElementById('dayModal')?.classList.add('show')}
function openSpotModal(){document.getElementById('spotModal')?.classList.add('show')}
function closeModal(id){document.getElementById(id)?.classList.remove('show');document.body.classList.remove('modal-open')}
function closeOnBackdrop(e,id){if(id==='journeyModal')return;if(e.target.id===id)closeModal(id)}
function closeDayMenus(){document.querySelectorAll('.day-menu-panel.show').forEach(panel=>panel.classList.remove('show'))}
function toggleDayMenu(btn){const panel=btn.nextElementSibling;const shouldOpen=!panel?.classList.contains('show');closeDayMenus();if(shouldOpen)panel?.classList.add('show')}
function toggleThought(btn){btn.nextElementSibling?.classList.toggle('show')}
function switchMode(mode,btn){document.querySelectorAll('.mode-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
function filterJourneys(){const q=normalizeText(document.getElementById('searchInput').value).toLowerCase();const region=document.getElementById('regionFilter').value;document.querySelectorAll('.journey-card').forEach(c=>{const okQ=!q||c.dataset.search.toLowerCase().includes(q);const okR=region==='all'||c.dataset.region===region;c.style.display=okQ&&okR?'':'none'})}
function toggleRentalFields(){document.getElementById('rentalFields')?.classList.toggle('show')}
function addCityInput(value=''){
  const grid=document.getElementById('cityInputGrid');
  if(!grid)return;
  const input=document.createElement('input');
  input.placeholder=`城市／地區 ${grid.querySelectorAll('input').length+1}`;
  input.value=value;
  grid.appendChild(input);
  input.focus();
}
function toggleFlightFields(){
  const noFlight=document.getElementById('journeyNoFlight')?.checked;
  const fields=document.getElementById('flightFields');
  if(!fields)return;
  fields.hidden=Boolean(noFlight);
  fields.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=Boolean(noFlight)});
}
function saveJourneyPrototype(){closeModal('journeyModal');alert('Prototype：介面確認用，尚未寫入資料庫。')}
function saveReview(){
  const value=document.getElementById('reviewEditor')?.value.trim() || '';
  const reviewText=document.getElementById('reviewText');
  const journeySummary=document.getElementById('journeySummary');
  if(reviewText) reviewText.textContent=value;
  if(journeySummary) journeySummary.textContent=value;
  const nagoya=journeys.find(j=>j.id==='nagoya');
  if(nagoya) nagoya.review=value;
  closeModal('reviewModal');
}

document.addEventListener('DOMContentLoaded',()=>{
  renderStats();renderTimeline();initMap();
  const currentJourney=journeys.find(j=>j.id==='nagoya');
  if(currentJourney?.review){
    const reviewText=document.getElementById('reviewText');
    const journeySummary=document.getElementById('journeySummary');
    const reviewEditor=document.getElementById('reviewEditor');
    if(reviewText) reviewText.textContent=currentJourney.review;
    if(journeySummary) journeySummary.textContent=currentJourney.review;
    if(reviewEditor) reviewEditor.value=currentJourney.review;
  }
  document.querySelectorAll('[data-home-view]').forEach(btn=>btn.addEventListener('click',()=>switchHomeView(btn.dataset.homeView,btn)));
  window.addEventListener('scroll',closeDayMenus,{passive:true,capture:true});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.day-menu'))closeDayMenus()});
  document.getElementById('detailHero').style.backgroundImage="url('https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1600&q=85')";
});

/**
 * Enables mouse, pen and touch sorting for itinerary spot cards.
 * The DOM order is the source of truth in this beta. A future repository
 * implementation can listen for `spotorderchange` and persist sort_order.
 */
function initSpotDragging(){
  document.querySelectorAll('.timeline').forEach(list=>{
    if(!list.querySelector('.spot-card')) return;
    list.setAttribute('draggable-list','true');
    let activeCard=null, pointerId=null, frame=null;
    const cards=()=>[...list.querySelectorAll(':scope > .spot-card')];
    const emitOrder=()=>list.dispatchEvent(new CustomEvent('spotorderchange',{bubbles:true,detail:{order:cards().map((card,index)=>{card.dataset.sortOrder=String(index);return card.dataset.spotId||card.querySelector('h3')?.textContent?.trim()||String(index)})}}));
    const move=event=>{
      if(!activeCard||event.pointerId!==pointerId)return;
      event.preventDefault();
      const y=event.clientY;
      if(frame)cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const sibling=cards().filter(card=>card!==activeCard).find(card=>{const rect=card.getBoundingClientRect();return y<rect.top+rect.height/2});
        sibling?list.insertBefore(activeCard,sibling):list.appendChild(activeCard);
      });
    };
    const end=event=>{
      if(!activeCard||(event.pointerId!=null&&event.pointerId!==pointerId))return;
      if(frame)cancelAnimationFrame(frame);
      activeCard.releasePointerCapture?.(pointerId);
      activeCard.classList.remove('dragging');document.body.classList.remove('spot-sorting');
      emitOrder();activeCard=null;pointerId=null;frame=null;
    };
    list.querySelectorAll(':scope > .spot-card').forEach(card=>{
      card.removeAttribute('draggable');
      let handle=card.querySelector('.drag-handle');
      if(!handle){handle=document.createElement('span');handle.className='drag-handle';handle.textContent='⋮⋮';card.prepend(handle)}
      handle.tabIndex=0;handle.setAttribute('role','button');handle.setAttribute('aria-label','拖曳調整行程順序');
      handle.addEventListener('pointerdown',event=>{
        event.preventDefault();event.stopPropagation();activeCard=card;pointerId=event.pointerId;
        card.classList.add('dragging');document.body.classList.add('spot-sorting');card.setPointerCapture?.(pointerId);
      });
      handle.addEventListener('keydown',event=>{
        if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
        if(event.key==='ArrowUp'&&card.previousElementSibling)list.insertBefore(card,card.previousElementSibling);
        if(event.key==='ArrowDown'&&card.nextElementSibling)list.insertBefore(card.nextElementSibling,card);
        emitOrder();handle.focus();
      });
    });
    list.addEventListener('pointermove',move,{passive:false});list.addEventListener('pointerup',end);list.addEventListener('pointercancel',end);
  });
}

document.addEventListener('DOMContentLoaded',initSpotDragging);

function openJourneyCardByKey(event){
  if(event.key==='Enter' || event.key===' '){
    event.preventDefault();
    openDetail();
  }
}

const journeySettings = {
  start: '2025-10-22',
  end: '2025-10-27',
  mainCurrency: 'JPY',
  defaultRate: 0.2052
};

const masterData = {
  category: ['機票','住宿','交通','餐飲','購物','票券','通信','保險','其他'],
  currency: ['TWD','JPY','USD','EUR','KRW','THB'],
  payer: ['共同帳戶','我','同行者','現金']
};

let activeMasterTab = 'category';
let budgetFilterMode = 'all';
let activeExpenseId = null;

const prototypeExpenses = [
  {id:1,phase:'pretrip',day:'',date:'2025-07-18',category:'機票',item:'台灣虎航',currency:'TWD',amount:17980,rate:1,payer:'共同帳戶',note:'台中往返名古屋'},
  {id:2,phase:'pretrip',day:'Day 1',date:'2025-08-02',category:'住宿',item:'東橫 INN',currency:'TWD',amount:1987,rate:1,payer:'共同帳戶',note:'第一晚'},
  {id:3,phase:'local',day:'Day 2',date:'2025-10-23',category:'交通',item:'常滑停車費',currency:'JPY',amount:300,rate:null,payer:'現金',note:''},
  {id:4,phase:'local',day:'Day 2',date:'2025-10-23',category:'餐飲',item:'午餐與咖啡',currency:'JPY',amount:4280,rate:null,payer:'共同帳戶',note:'信用卡'},
  {id:5,phase:'local',day:'Day 4',date:'2025-10-25',category:'購物',item:'麵包超人紀念品',currency:'JPY',amount:6200,rate:null,payer:'同行者',note:''},
  {id:6,phase:'pretrip',day:'Day 2',date:'2025-09-05',category:'票券',item:'名古屋港水族館',currency:'TWD',amount:824,rate:1,payer:'共同帳戶',note:'Klook'},
  {id:7,phase:'pretrip',day:'',date:'2025-07-01',category:'通信',item:'eSIM',currency:'TWD',amount:488,rate:1,payer:'共同帳戶',note:'10GB'},
  {id:8,phase:'pretrip',day:'',date:'2025-07-12',category:'保險',item:'旅遊不便險',currency:'TWD',amount:0,rate:1,payer:'共同帳戶',note:'信用卡附贈'},
  {id:9,phase:'pretrip',day:'',date:'2025-09-01',category:'其他',item:'',currency:'TWD',amount:null,rate:1,payer:'',note:'預設項目，待補資料'}
];

function currencySymbol(currency){return currency==='JPY'?'¥':currency==='USD'?'US$':currency==='EUR'?'€':currency==='KRW'?'₩':currency==='THB'?'฿':'NT$'}
function numberText(value){return Math.round(Number(value)||0).toLocaleString('zh-TW')}
function isExpenseMissing(expense){
  return !expense.category || !expense.item || expense.amount===null || expense.amount==='' || !expense.currency || !expense.payer;
}
function expenseTwd(expense){
  if(expense.currency==='TWD') return Number(expense.amount)||0;
  const rate=expense.rate!==null && expense.rate!=='' ? Number(expense.rate) : Number(journeySettings.defaultRate);
  return (Number(expense.amount)||0)*(rate||0);
}
function dayFromDate(date){
  if(!date || date<journeySettings.start || date>journeySettings.end) return '';
  const oneDay=86400000;
  const start=new Date(`${journeySettings.start}T00:00:00`);
  const current=new Date(`${date}T00:00:00`);
  return `Day ${Math.round((current-start)/oneDay)+1}`;
}
function phaseFromDate(date){
  if(!date) return 'pretrip';
  if(date<journeySettings.start) return 'pretrip';
  if(date>journeySettings.end) return 'posttrip';
  return 'local';
}
function populateSelect(id,items,selected){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=items.map(item=>`<option value="${item}" ${item===selected?'selected':''}>${item}</option>`).join('');
}
function syncMasterSelects(){
  populateSelect('expenseCategory',masterData.category,document.getElementById('expenseCategory')?.value||masterData.category[0]);
  populateSelect('expenseCurrency',masterData.currency,journeySettings.mainCurrency);
  populateSelect('expensePayer',masterData.payer,document.getElementById('expensePayer')?.value||masterData.payer[0]);
  populateSelect('journeyMainCurrency',masterData.currency,journeySettings.mainCurrency);
}
function deleteExpensePrototype(id){
  const index=prototypeExpenses.findIndex(expense=>expense.id===id);
  if(index>=0 && confirm('確定刪除這筆費用嗎？')){prototypeExpenses.splice(index,1);renderBudget();}
}
function renderBudget(){
  const list=document.getElementById('expenseList'); if(!list)return;
  const phaseFilter=document.getElementById('expensePhaseFilter')?.value||'all';
  let visible=prototypeExpenses.filter(e=>phaseFilter==='all'||e.phase===phaseFilter);
  if(budgetFilterMode==='missing') visible=visible.filter(isExpenseMissing);
  const phaseLabels={pretrip:'出發前',local:'旅行中',posttrip:'旅行後'};
  const groups=visible.reduce((acc,e)=>{const key=e.phase==='local'?(e.day||'旅行中'):phaseLabels[e.phase];(acc[key]??=[]).push(e);return acc;},{});
  list.innerHTML=Object.entries(groups).map(([group,items])=>`<section class="expense-group"><div class="expense-group-title"><b>${group}</b><span>${items.length} 筆</span></div>${items.map(e=>`<article class="expense-row ${isExpenseMissing(e)?'expense-incomplete':''}" role="button" tabindex="0" aria-label="編輯 ${e.item||e.category||'費用'}" onclick="openExpenseModal(${e.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openExpenseModal(${e.id})}"><div class="expense-icon">${(e.category||'?').slice(0,1)}</div><div class="expense-main"><div><b>${e.item||'尚未填寫項目'}</b><span>${e.category||'未分類'} · ${e.payer||'未指定付款來源'} · ${e.date||'未填日期'}</span></div>${e.note?`<small>${e.note}</small>`:''}${isExpenseMissing(e)?'<small class="missing-label">需要補充完整資訊</small>':''}</div><div class="expense-value"><strong>${currencySymbol(e.currency)} ${e.amount===null?'—':numberText(e.amount)}</strong>${e.currency&&e.currency!=='TWD'?`<small>約 NT$ ${numberText(expenseTwd(e))}</small>`:'<small>台幣</small>'}</div><button class="expense-delete" type="button" aria-label="刪除費用" onclick="event.stopPropagation();deleteExpensePrototype(${e.id})">×</button></article>`).join('')}</section>`).join('')||'<div class="expense-empty">這個篩選條件沒有費用。</div>';

  const total=prototypeExpenses.reduce((sum,e)=>sum+expenseTwd(e),0);
  const missing=prototypeExpenses.filter(isExpenseMissing).length;
  document.getElementById('budgetTotalTwd').textContent=`NT$ ${numberText(total)}`;
  document.getElementById('budgetEntryCount').textContent=`${prototypeExpenses.length} 筆`;
  document.getElementById('budgetMissingCount').textContent=`${missing} 筆`;
  document.getElementById('budgetCurrencyKpi').textContent=journeySettings.mainCurrency;
  document.getElementById('budgetMainCurrencyText').textContent=`${journeySettings.mainCurrency} ${journeySettings.mainCurrency==='JPY'?'日圓':''}`;
  document.getElementById('heroCurrencyBadge').textContent=journeySettings.mainCurrency;
  const notice=document.getElementById('missingInfoCard');
  document.getElementById('missingInfoText').textContent=missing?`還有 ${missing} 筆消費尚未完成`:'所有消費資料都已完成';
  notice?.classList.toggle('is-clear',missing===0);

  const categories=prototypeExpenses.filter(e=>e.category && e.amount!==null).reduce((acc,e)=>{acc[e.category]=(acc[e.category]||0)+expenseTwd(e);return acc},{});
  const entries=Object.entries(categories).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...entries.map(([,v])=>v),1);
  document.getElementById('categorySummary').innerHTML=entries.length?entries.map(([name,value])=>`<div class="category-row"><div><b>${name}</b><span>NT$ ${numberText(value)}</span></div><div class="category-bar"><i style="width:${Math.max(4,value/max*100)}%"></i></div></div>`).join(''):'<p class="summary-empty">尚無可統計的消費。</p>';
}
function showMissingExpenses(){
  budgetFilterMode=budgetFilterMode==='missing'?'all':'missing';
  const card=document.getElementById('missingInfoCard');
  card?.classList.toggle('active',budgetFilterMode==='missing');
  renderBudget();
  document.getElementById('expenseList')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function openExpenseModal(expenseId=null){
  activeExpenseId=expenseId;
  document.getElementById('expenseModal')?.classList.add('show');document.body.classList.add('modal-open');
  syncMasterSelects();
  const expense=prototypeExpenses.find(item=>item.id===expenseId);
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('expenseModalTitle').textContent=expense?'編輯費用':'新增費用';
  document.getElementById('expenseSaveButton').textContent=expense?'儲存修改':'新增費用';
  document.getElementById('expenseDate').value=expense?.date||today;
  document.getElementById('expensePhase').value=expense?.phase||phaseFromDate(today);
  document.getElementById('expenseDay').value=expense?.day||dayFromDate(today);
  document.getElementById('expenseCategory').value=expense?.category||masterData.category[0];
  document.getElementById('expenseItem').value=expense?.item||'';
  document.getElementById('expenseCurrency').value=expense?.currency||journeySettings.mainCurrency;
  document.getElementById('expenseAmount').value=expense?.amount??'';
  document.getElementById('expenseRate').value=expense?.rate??'';
  document.getElementById('expensePayer').value=expense?.payer||masterData.payer[0];
  document.getElementById('expenseNote').value=expense?.note||'';
  toggleCustomRate();updateConvertedPreview();
}
function autoAssignExpenseMeta(){
  const date=document.getElementById('expenseDate')?.value;
  const phase=document.getElementById('expensePhase'); const day=document.getElementById('expenseDay');
  if(phase)phase.value=phaseFromDate(date);
  if(day)day.value=dayFromDate(date);
}
function toggleCustomRate(){
  const currency=document.getElementById('expenseCurrency')?.value;
  const rate=document.getElementById('expenseRate');
  if(rate){rate.disabled=currency==='TWD';rate.placeholder=currency==='TWD'?'不需換算':`使用旅程匯率 ${journeySettings.defaultRate}`;if(currency==='TWD')rate.value='';}
  updateConvertedPreview();
}
function updateConvertedPreview(){
  const currency=document.getElementById('expenseCurrency')?.value||journeySettings.mainCurrency;
  const amount=Number(document.getElementById('expenseAmount')?.value)||0;
  const custom=Number(document.getElementById('expenseRate')?.value);
  const rate=currency==='TWD'?1:(custom||journeySettings.defaultRate);
  const preview=document.getElementById('expenseConvertedPreview');if(preview)preview.textContent=`NT$ ${numberText(amount*rate)}`;
}
function addExpensePrototype(){
  const amountRaw=document.getElementById('expenseAmount')?.value;
  const payload={
    id:activeExpenseId||Date.now(),phase:document.getElementById('expensePhase').value,day:document.getElementById('expenseDay').value,
    date:document.getElementById('expenseDate').value,category:document.getElementById('expenseCategory').value,item:document.getElementById('expenseItem').value.trim(),
    currency:document.getElementById('expenseCurrency').value,amount:amountRaw===''?null:Number(amountRaw),rate:document.getElementById('expenseRate').value===''?null:Number(document.getElementById('expenseRate').value),
    payer:document.getElementById('expensePayer').value,note:document.getElementById('expenseNote').value.trim()
  };
  const index=prototypeExpenses.findIndex(item=>item.id===activeExpenseId);
  if(index>=0)prototypeExpenses[index]=payload;else prototypeExpenses.push(payload);
  activeExpenseId=null;
  closeModal('expenseModal');renderBudget();
}
function switchMasterTab(tab,button){
  activeMasterTab=tab;document.querySelectorAll('[data-master-tab]').forEach(b=>b.classList.toggle('active',b===button));
  const labels={category:'類別',currency:'幣別',payer:'付款來源'};document.getElementById('masterDataInput').placeholder=`新增${labels[tab]}`;renderMasterData();
}
function renderMasterData(){
  const root=document.getElementById('masterDataList');if(!root)return;
  root.innerHTML=masterData[activeMasterTab].map(item=>`<span>${item}</span>`).join('');
}
function addMasterItem(){
  const input=document.getElementById('masterDataInput');const value=input.value.trim();if(!value)return;
  if(!masterData[activeMasterTab].includes(value))masterData[activeMasterTab].push(value);
  input.value='';renderMasterData();syncMasterSelects();renderBudget();
}
function syncJourneyCurrencySettings(){
  journeySettings.mainCurrency=document.getElementById('journeyMainCurrency').value;
  syncMasterSelects();renderBudget();
}
function syncJourneyRateSettings(){
  journeySettings.defaultRate=Number(document.getElementById('journeyDefaultRate').value)||0;
  const rate=document.getElementById('journeyRate');if(rate)rate.value=journeySettings.defaultRate;renderBudget();
}
function syncJourneyRateFromBudget(){
  journeySettings.defaultRate=Number(document.getElementById('journeyRate').value)||0;
  const field=document.getElementById('journeyDefaultRate');if(field)field.value=journeySettings.defaultRate;renderBudget();
}
function refreshDayOrder(){
  const nav=document.getElementById('daysNav');if(!nav)return;
  const tabs=[...nav.querySelectorAll('[data-sortable-day]')];
  tabs.forEach((tab,index)=>{
    const oldKey=tab.dataset.dayKey||tab.dataset.sortableDay;tab.dataset.dayKey=oldKey;
    const section=document.querySelector(`.day-section[data-day-key="${oldKey}"],.day-section[data-day="${oldKey}"]`);
    if(section&&!section.dataset.dayKey)section.dataset.dayKey=oldKey;
    const day=index+1;
    const title=tab.dataset.dayTitle||(tab.textContent.replace(/⋮/g,'').replace(/^\s*Day\s*\d+\s*/i,'').trim());tab.dataset.dayTitle=title;
    tab.dataset.sortableDay=String(day);tab.innerHTML=`<span class="day-drag-handle" aria-hidden="true">⋮⋮</span>Day ${day} ${title}`;tab.onclick=()=>showDay(day,tab);
    if(section){
      section.dataset.day=String(day);
      const date=new Date(`${journeySettings.start}T00:00:00`);date.setDate(date.getDate()+index);
      const weekday=['SUN','MON','TUE','WED','THU','FRI','SAT'][date.getDay()];
      const kicker=section.querySelector('.day-kicker');if(kicker)kicker.textContent=`DAY ${String(day).padStart(2,'0')} · ${weekday}`;
      const dateText=section.querySelector('.day-date');if(dateText)dateText.textContent=`${date.getFullYear()} 年 ${date.getMonth()+1} 月 ${date.getDate()} 日`;
      section.querySelectorAll('.add-spot').forEach(button=>button.textContent=`＋ 新增 Day ${day} 行程節點`);
    }
  });
  prototypeExpenses.forEach(expense=>{if(expense.date)expense.day=dayFromDate(expense.date)});
  const daySelect=document.getElementById('expenseDay');if(daySelect){const selected=daySelect.value;daySelect.innerHTML='<option value="">未指定</option>'+tabs.map((_,i)=>`<option>Day ${i+1}</option>`).join('');daySelect.value=selected;}
  renderBudget();
}
function initDayDragging(){
  const nav=document.getElementById('daysNav');if(!nav)return;
  let dragged=null;
  nav.querySelectorAll('[data-sortable-day]').forEach(tab=>{
    tab.dataset.dayKey=tab.dataset.sortableDay;
    const section=document.querySelector(`.day-section[data-day="${tab.dataset.sortableDay}"]`);if(section)section.dataset.dayKey=tab.dataset.sortableDay;
    tab.addEventListener('dragstart',event=>{dragged=tab;tab.classList.add('dragging');event.dataTransfer.effectAllowed='move';});
    tab.addEventListener('dragend',()=>{tab.classList.remove('dragging');dragged=null;refreshDayOrder();});
    tab.addEventListener('dragover',event=>{event.preventDefault();if(!dragged||dragged===tab)return;const rect=tab.getBoundingClientRect();nav.insertBefore(dragged,event.clientX<rect.left+rect.width/2?tab:tab.nextSibling);});
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  syncMasterSelects();renderMasterData();renderBudget();initDayDragging();
  const rate=document.getElementById('journeyRate');if(rate){rate.value=journeySettings.defaultRate;rate.oninput=syncJourneyRateFromBudget;}
  ['expenseAmount','expenseRate'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateConvertedPreview));
});
