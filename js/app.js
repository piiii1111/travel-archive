let journeys = [];
let map;
let journeyMarkerLayer;
let activeJourneyId = null;
let reviewTags = [];
const regionCountryMap = new Map();
let visibleJourneys = [];
let pendingMapFit = false;
let activeMasterFilter = null;
const masterFilterLabels={region:'地區',country:'國家',city:'城市',currency:'貨幣',expense_category:'費用類別',payer:'付款來源',transport:'交通方式',spot_type:'節點類型',tag:'旅遊標籤'};

function normalizeText(value){return String(value || '').trim().replace(/\s+/g,' ')}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function displayDate(value){return value?value.replaceAll('-','.'):'未設定'}
function dateTimeText(value){return value?value.replace('T',' ').replaceAll('-','.'):'未填寫'}
function canonicalCity(value){return normalizeText(value).replace(/[市縣县]$/u,'')}
function canonicalCountry(value){
  const country=normalizeText(value);
  if(['台灣','臺灣','Taiwan'].includes(country))return '台灣';
  if(['韓國','南韓','大韓民國','South Korea','Korea'].includes(country))return '韓國';
  return country;
}
function inferRegionForCountry(country){
  const value=normalizeText(country);
  if(['台灣','臺灣'].includes(value))return '台灣';
  if(['日本','韓國','南韓','大韓民國'].includes(value))return '東北亞';
  if(['泰國','新加坡','馬來西亞','越南','菲律賓','印尼'].includes(value))return '東南亞';
  if(['英國','法國','德國','義大利','西班牙'].includes(value))return '歐洲';
  if(['美國','加拿大','墨西哥'].includes(value))return '美洲';
  if(['澳洲','紐西蘭'].includes(value))return '大洋洲';
  return '其他';
}
window.inferRegionForCountry=inferRegionForCountry;
function renderStats(source=journeys){
  const countries = new Set(); const cities = new Set();
  source.forEach(j=>{const country=canonicalCountry(j.country);if(country)countries.add(country);(j.cities||[]).forEach(c=>{const city=canonicalCity(c);if(city)cities.add(`${country}|${city}`)})});
  document.getElementById('journeyCount').textContent=source.length;
  document.getElementById('countryCount').textContent=[...countries].filter(Boolean).length;
  document.getElementById('cityCount').textContent=[...cities].filter(Boolean).length;
}
function setRegionCountryData(rows,options=[]){
  regionCountryMap.clear();
  const regionSelect=document.getElementById('journeyRegion');
  const activeRegions=(options||[]).filter(option=>option.option_type==='region').map(option=>option.value);
  const previousRegion=regionSelect?.value;
  if(regionSelect&&activeRegions.length){regionSelect.innerHTML=activeRegions.map(region=>`<option>${escapeHtml(region)}</option>`).join('');if(activeRegions.includes(previousRegion))regionSelect.value=previousRegion}
  (options||[]).filter(option=>option.option_type==='country').forEach(option=>{
    const region=option.parent_value||'其他';
    if(!regionCountryMap.has(region))regionCountryMap.set(region,new Set());
    regionCountryMap.get(region).add(option.value);
  });
  syncJourneyCountryOptions();
}
window.setRegionCountryData=setRegionCountryData;
function syncJourneyCountryOptions(preferredCountry=''){
  const region=document.getElementById('journeyRegion')?.value;
  const countrySelect=document.getElementById('journeyCountry');
  if(!countrySelect||!region)return;
  const previous=preferredCountry||countrySelect.value;
  const countries=[...(regionCountryMap.get(region)||[])];
  if(preferredCountry&&!countries.includes(preferredCountry))countries.push(preferredCountry);
  countrySelect.innerHTML=countries.length?countries.map(country=>`<option>${escapeHtml(country)}</option>`).join(''):'<option value="">請新增這個地區的第一個國家</option>';
  if(countries.includes(previous))countrySelect.value=previous;
}
async function addCustomCountry(){
  const region=document.getElementById('journeyRegion')?.value;
  if(!region)return;
  const country=normalizeText(prompt(`請輸入「${region}」的國家名稱`)||'');
  if(!country)return;
  if(!regionCountryMap.has(region))regionCountryMap.set(region,new Set());
  regionCountryMap.get(region).add(country);
  syncJourneyCountryOptions(country);
  const saved=await window.saveJourneyOption?.('country',country,region);
  if(saved===false)alert('國家已加入目前畫面，但尚未保存到資料庫，請確認已執行本版本的 SQL。');
}
async function addCustomRegion(){
  const region=normalizeText(prompt('請輸入新的地區分類名稱')||'');
  if(!region)return;
  const select=document.getElementById('journeyRegion');
  if(![...select.options].some(option=>option.value===region))select.add(new Option(region,region));
  select.value=region;syncJourneyCountryOptions();
  const saved=await window.saveJourneyOption?.('region',region,'');
  if(saved===false)alert('地區已加入目前畫面，但尚未保存到資料庫。');
}
function setCurrencyData(rows,options=[]){
  (rows||[]).forEach(row=>{const code=normalizeText(row.main_currency).toUpperCase();if(code&&!masterData.currency.includes(code))masterData.currency.push(code)});
  (options||[]).filter(option=>option.option_type==='currency').forEach(option=>{const code=normalizeText(option.value).toUpperCase();if(code&&!masterData.currency.includes(code))masterData.currency.push(code)});
  const select=document.getElementById('journeyMainCurrency');
  if(select)populateSelect('journeyMainCurrency',masterData.currency,select.value||'TWD');
}
window.setCurrencyData=setCurrencyData;
async function addCustomCurrency(){
  const code=normalizeText(prompt('請輸入貨幣代碼，例如：MYR、PHP、AUD')||'').toUpperCase();
  if(!code)return;
  if(!/^[A-Z]{3,5}$/.test(code)){alert('請輸入 3～5 個英文字母的貨幣代碼。');return}
  if(!masterData.currency.includes(code))masterData.currency.push(code);
  populateSelect('journeyMainCurrency',masterData.currency,code);
  syncJourneyCurrencySettings();
  const saved=await window.saveJourneyOption?.('currency',code,'');
  if(saved===false)alert('貨幣已加入目前畫面，但尚未保存到資料庫。');
}
function renderJourneyTransportChips(values,selectedValues=[]){
  const container=document.getElementById('journeyTransportChips');
  if(!container)return;
  const selected=new Set(selectedValues);
  container.innerHTML=[...new Set(values)].map(value=>`<label class="check-chip"><input type="checkbox" data-journey-transport value="${escapeHtml(value)}"${selected.has(value)?' checked':''}${value==='租車'?' onchange="toggleRentalFields()"':''}>${escapeHtml(value)}</label>`).join('');
}
async function addCustomTransport(){
  const value=normalizeText(prompt('請輸入新的主要交通方式')||'');
  if(!value)return;
  const current=[...document.querySelectorAll('[data-journey-transport]')];
  const values=current.map(input=>input.value);
  const selected=current.filter(input=>input.checked).map(input=>input.value);
  if(!values.includes(value))values.push(value);
  if(!selected.includes(value))selected.push(value);
  renderJourneyTransportChips(values,selected);
  const saved=await window.saveJourneyOption?.('transport',value,'');
  if(saved===false)alert('交通方式已加入目前畫面，但尚未保存到資料庫。');
}
function datePart(value){return String(value||'').slice(0,10)}
function withDate(value,date){return date?`${date}T${String(value||'').slice(11,16)||'00:00'}`:''}
function offsetDate(value,days){const date=new Date(`${value}T00:00:00`);date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)}
function syncJourneyDateFields(source=''){
  const startInput=document.getElementById('journeyStart');const endInput=document.getElementById('journeyEnd');
  const start=startInput?.value;let end=endInput?.value;
  if(!start)return;
  if(!end||end<start){end=start;if(endInput)endInput.value=end;if(source==='end')alert('結束日期不能早於開始日期，已調整為開始日期。')}
  if(endInput)endInput.min=start;
  const setDefault=(id,value)=>{const input=document.getElementById(id);if(input&&!input.value)input.value=value};
  setDefault('journeyOutboundDate',start);
  setDefault('expenseDate',start);
  setDefault('journeyInboundDate',end);
  setDefault('journeyRentalPickupAt',`${start}T00:00`);
  setDefault('journeyRentalReturnAt',`${end}T00:00`);
  if(source==='start'){
    const outbound=document.getElementById('journeyOutboundDate');if(outbound)outbound.value=start;
    const pickup=document.getElementById('journeyRentalPickupAt');if(pickup)pickup.value=withDate(pickup.value,start);
    const expense=document.getElementById('expenseDate');if(expense&&!expense.value)expense.value=start;
  }
  if(source==='end'){
    const inbound=document.getElementById('journeyInboundDate');if(inbound)inbound.value=end;
    const rentalReturn=document.getElementById('journeyRentalReturnAt');if(rentalReturn)rentalReturn.value=withDate(rentalReturn.value,end);
  }
  if(source==='start'&&document.getElementById('dayEditDate'))document.getElementById('dayEditDate').value=start;
  const inbound=document.getElementById('journeyInboundDate');
  if(inbound){inbound.removeAttribute('min');inbound.removeAttribute('max')}
  const dayInput=document.getElementById('dayEditDate');
  if(dayInput){dayInput.removeAttribute('min');dayInput.removeAttribute('max')}
  [['journeyRentalPickupAt','租車取車時間'],['journeyRentalReturnAt','租車還車時間']].forEach(([id])=>{const input=document.getElementById(id);if(input){input.min=`${start}T00:00`;input.max=`${end}T23:59`;if(input.value&&(datePart(input.value)<start||datePart(input.value)>end))input.value=withDate(input.value,id==='journeyRentalReturnAt'?end:start)}});
}
function validateJourneyBoundedDate(input,label){
  const start=document.getElementById('journeyStart')?.value;const end=document.getElementById('journeyEnd')?.value;const value=datePart(input?.value);
  if(!value||!start||!end)return true;
  if(value<start||value>end){alert(`${label}必須在 Journey 日期 ${start}～${end} 之內。`);input.value=input.type==='datetime-local'?withDate(input.value,value<start?start:end):(value<start?start:end);return false}
  return true;
}
function renderTimeline(source=journeys){
  const root=document.getElementById('archiveTimelineGrid'); if(!root)return;
  const groups=source.reduce((acc,j)=>((acc[j.year]??=[]).push(j),acc),{});
  root.innerHTML=Object.keys(groups).sort((a,b)=>b-a).map(year=>{
    const trips=groups[year].sort((a,b)=>b.start.localeCompare(a.start));
    return `<section class="archive-year-group"><div class="archive-year-label"><span></span><b>${year}</b></div><div class="archive-year-trips">${trips.map(j=>`<button class="archive-trip-card" type="button" onclick="openDetail('${j.id}')"><img src="${j.photo}" alt="${j.title}"><span class="archive-trip-body"><b>${j.title}</b><small>${j.date}</small><small>${j.country}${j.cities.length ? ` · ${j.cities.join('、')}` : ''}</small></span></button>`).join('')}</div></section>`
  }).join('') || '<div class="expense-empty">目前還沒有旅程。</div>';
}
function initMap(){
  if(!window.L || !document.getElementById('map')) return;
  map=L.map('map',{zoomControl:true,zoomSnap:.05,zoomDelta:.25,worldCopyJump:false,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1}).setView([29.4,129.5],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',noWrap:true,bounds:[[-85,-180],[85,180]]}).addTo(map);
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
function renderMapPins(source=journeys){
  if(!map||!journeyMarkerLayer)return;
  journeyMarkerLayer.clearLayers();
  const points=[];
  source.forEach((j,index)=>{
    const rawCoords=journeyCoordinates(j,index);const coords=[Math.max(-85,Math.min(85,rawCoords[0])),Math.max(-180,Math.min(180,rawCoords[1]))];points.push(coords);
    const pinPhoto=escapeHtml(String(j.photo).replaceAll("'",'%27'));
    const icon=L.divIcon({className:'photo-pin-wrap',html:`<button class="photo-pin" type="button" aria-label="開啟 ${escapeHtml(j.title)}"><span class="photo-pin-image" style="background-image:url('${pinPhoto}')"></span></button>`,iconSize:[48,48],iconAnchor:[24,24]});
    L.marker(coords,{icon}).addTo(journeyMarkerLayer).on('click',()=>openDetail(j.id));
  });
  const mapVisible=!document.getElementById('homeView')?.classList.contains('hidden')&&!document.getElementById('mapCard')?.classList.contains('hidden');
  if(!mapVisible){pendingMapFit=true;return}
  pendingMapFit=false;
  requestAnimationFrame(()=>{map.stop();map.invalidateSize(false);const fillZoom=Math.log2(Math.max(256,map.getSize().y+2)/256);map.setMinZoom(fillZoom);if(points.length){map.fitBounds(points,{padding:[45,45],maxZoom:6,animate:false});if(map.getZoom()<fillZoom)map.setZoom(fillZoom,{animate:false})}else map.setView([25,105],Math.max(2.2,fillZoom),{animate:false});});
}
function setJourneyData(rows){
  journeys=(rows||[]).map((row,index)=>{
    const start=row.start_date||'';const end=row.end_date||'';
    const details={...(row.details||{}),expenses:Array.isArray(row._expenses)?row._expenses:(row.details?.expenses||[])};
    const tags=Array.isArray(details.tags)?details.tags:[];
    const spotTypes=Array.isArray(row._spot_types)?row._spot_types:[];
    const expenseText=(details.expenses||[]).map(expense=>[expense.category,expense.item,expense.currency,expense.payer,expense.note].filter(Boolean).join(' ')).join(' ');
    const searchText=`${row.country||''} ${row.country==='台灣'?'臺灣':''} ${row.country==='臺灣'?'台灣':''} ${row.title||''} ${row.summary||''} ${row.main_currency||''} ${details.region||''} ${tags.join(' ')} ${spotTypes.join(' ')} ${(details.cities||[]).join(' ')} ${(details.transports||[]).join(' ')} ${details.pin_place||''} ${expenseText}`;
    return {id:row.id,title:row.title||'未命名旅程',country:row.country||'',cities:Array.isArray(details.cities)?details.cities:[],region:details.region||inferRegionForCountry(row.country),spotTypes,year:Number(start.slice(0,4))||'未定',start,end,date:start&&end?`${start.replaceAll('-','.')}－${end.replaceAll('-','.')}`:'日期未設定',photo:row.cover_url||'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=700&q=82',latitude:details.latitude,longitude:details.longitude,currency:row.main_currency||'TWD',defaultRate:Number(row.default_exchange_rate)||1,summary:row.summary||'',searchText,details,index};
  });
  visibleJourneys=[...journeys];renderStats();renderTimeline();renderMapPins();
  if(document.getElementById('detailView')?.classList.contains('active')&&activeJourneyId){
    const active=journeys.find(item=>String(item.id)===String(activeJourneyId));
    if(active)renderJourneyDetail(active);
  }
}
window.setJourneyData=setJourneyData;
function switchHomeView(mode,button){
  document.querySelectorAll('.archive-view-tab').forEach(b=>b.classList.toggle('active',b===button));
  document.getElementById('mapCard').classList.toggle('hidden',mode!=='map');
  document.getElementById('archiveTimeline').classList.toggle('hidden',mode!=='timeline');
  if(mode==='map'&&map)setTimeout(()=>renderMapPins(visibleJourneys),80);
}
function openDetail(journeyId){
  const journey=journeys.find(item=>String(item.id)===String(journeyId));
  if(journey){
    activeJourneyId=journey.id;
    window.currentJourneyId=journey.id;
    renderJourneyDetail(journey);
    const infoTab=document.querySelector('.journey-info-tab');
    if(infoTab)showDay('info',infoTab);
    window.loadJourneyDays?.(journey.id);
  }
  document.getElementById('homeView').classList.add('hidden');document.getElementById('detailView').classList.add('active');document.getElementById('dbStatus')?.classList.add('hidden');closeDayMenus();window.scrollTo(0,0)
}
function renderJourneyDetail(journey){
    journeySettings.start=journey.start||journeySettings.start;
    journeySettings.end=journey.end||journeySettings.end;
    window.currentJourneyStart=journey.start||'';
    window.currentJourneyEnd=journey.end||'';
    journeySettings.mainCurrency=journey.currency||journeySettings.mainCurrency;
    journeySettings.defaultRate=Number(journey.defaultRate)||journeySettings.defaultRate;
    const budgetRateInput=document.getElementById('journeyRate');
    if(budgetRateInput){budgetRateInput.value=journeySettings.defaultRate;budgetRateInput.dataset.persistedRate=String(journeySettings.defaultRate)}
    syncExpenseDayOptions();
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
    const emptyReview='尚未新增這趟旅行的總心得。';
    const reviewText=document.getElementById('reviewText');
    const reviewEditor=document.getElementById('reviewEditor');
    reviewTags=Array.isArray(journey.details?.tags)?[...journey.details.tags]:[];
    const reviewDisplay=[journey.summary||'',reviewTags.join('、')].filter(Boolean).join(' · ')||emptyReview;
    if(reviewText)reviewText.textContent=reviewDisplay;
    if(reviewEditor)reviewEditor.value=journey.summary||'';
    renderReviewTags();
    renderJourneyInfo(journey);
}
function renderJourneyInfo(journey){
  const root=document.querySelector('.journey-info-grid');if(!root)return;
  const d=journey.details||{};
  const route=(flight)=>`${flight?.from||'未填寫'} → ${flight?.to||'未填寫'}`;
  const flightCard=(label,flight)=>`<article class="journey-info-card"><div class="journey-info-icon">✈</div><div><div class="eyebrow">${label}</div><h3>${escapeHtml(route(flight))}</h3><dl><div><dt>航班</dt><dd>${escapeHtml([d.airline,flight?.number].filter(Boolean).join(' ')||'未填寫')}</dd></div><div><dt>時間</dt><dd>${escapeHtml([flight?.date,flight?.departTime,flight?.arriveTime].filter(Boolean).join('　')||'未填寫')}</dd></div><div><dt>機場</dt><dd>${escapeHtml(route(flight))}</dd></div></dl></div></article>`;
  const rental=d.rental||{};
  const hasRental=(d.transports||[]).includes('租車');
  const rentalCard=hasRental?`<article class="journey-info-card"><div class="journey-info-icon">車</div><div><div class="eyebrow">租車資料</div><h3>${escapeHtml(rental.company||'未填寫租車公司')}</h3><dl><div><dt>取車</dt><dd>${escapeHtml(`${dateTimeText(rental.pickup_at)}${rental.pickup?`・${rental.pickup}`:''}`)}</dd></div><div><dt>還車</dt><dd>${escapeHtml(`${dateTimeText(rental.return_at)}${rental.return_place?`・${rental.return_place}`:''}`)}</dd></div><div><dt>配備</dt><dd>${escapeHtml(rental.options?.join('、')||'未填寫')}</dd></div></dl></div></article>`:'';
  root.innerHTML=`
    <article class="journey-info-card"><div class="journey-info-icon">旅</div><div><div class="eyebrow">基本資料</div><h3>${escapeHtml(journey.title)}</h3><dl><div><dt>日期</dt><dd>${escapeHtml(journey.date)}</dd></div><div><dt>國家</dt><dd>${escapeHtml(journey.country||'未填寫')}</dd></div><div><dt>城市／地區</dt><dd>${escapeHtml(journey.cities.join('、')||'未填寫')}</dd></div></dl></div></article>
    ${d.no_flight?'<article class="journey-info-card"><div class="journey-info-icon">✈</div><div><div class="eyebrow">航班資訊</div><h3>本次旅程沒有搭乘飛機</h3></div></article>':`${flightCard('去程航班',d.outbound)}${flightCard('回程航班',d.inbound)}`}
    ${rentalCard}
    <article class="journey-info-card"><div class="journey-info-icon">⌖</div><div><div class="eyebrow">代表地點</div><h3>${escapeHtml(d.pin_place||'未填寫')}</h3><dl><div><dt>定位地址</dt><dd>${escapeHtml(d.pin_address||'未填寫')}</dd></div><div><dt>主要交通</dt><dd>${escapeHtml([...(d.transports||[]),d.other_transport].filter(Boolean).join('、')||'未填寫')}</dd></div></dl></div></article>`;
}
function editActiveJourney(target='modal-head'){
  if(!activeJourneyId)return;
  const result=window.travelArchiveEditJourney?.(activeJourneyId);
  Promise.resolve(result).then(()=>setTimeout(()=>{
    const modal=document.querySelector('#journeyModal .modal');
    const destination=target==='modal-head'?modal?.querySelector('.modal-head'):document.getElementById(target);
    if(!modal||!destination)return;
    const top=target==='modal-head'?0:Math.max(0,destination.getBoundingClientRect().top-modal.getBoundingClientRect().top+modal.scrollTop-18);
    modal.scrollTo({top,behavior:'smooth'});
    if(target!=='modal-head'&&destination.matches('input,select,textarea'))destination.focus({preventScroll:true});
  },120));
  return result;
}
function deleteActiveJourney(){
  if(!activeJourneyId)return;
  window.travelArchiveDeleteJourney?.(activeJourneyId,{returnHome:true});
}
function closeDetail(){document.getElementById('detailView').classList.remove('active');document.getElementById('homeView').classList.remove('hidden');document.getElementById('dbStatus')?.classList.remove('hidden');window.scrollTo(0,0);if(map)setTimeout(()=>renderMapPins(visibleJourneys),80)}
function goHomeFromBrand(){document.querySelectorAll('.modal-backdrop.show').forEach(modal=>modal.classList.remove('show'));document.body.classList.remove('modal-open');if(document.getElementById('detailView')?.classList.contains('active'))closeDetail();else window.scrollTo({top:0,behavior:'smooth'})}
function scrollActiveViewToTop(){
  const modal=document.querySelector('.modal-backdrop.show .modal');
  if(modal)modal.scrollTo({top:0,behavior:'smooth'});
  else window.scrollTo({top:0,behavior:'smooth'});
}
window.scrollActiveViewToTop=scrollActiveViewToTop;
function togglePinLocationHelp(force){
  const help=document.getElementById('pinLocationHelp'),button=document.getElementById('pinLocationHelpButton');if(!help||!button)return;
  const open=typeof force==='boolean'?force:help.hidden;
  help.hidden=!open;button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'收起定位使用說明':'展開定位使用說明');
}
window.togglePinLocationHelp=togglePinLocationHelp;
window.goHomeFromBrand=goHomeFromBrand;
function showDay(day,button){
  document.querySelectorAll('.day-tab').forEach(b=>b.classList.remove('active'));
  button.classList.add('active');
  document.querySelectorAll('.day-section').forEach(s=>s.classList.toggle('active',String(s.dataset.day)===String(day)));
  const addDayButton=document.querySelector('.empty-add-day');
  if(addDayButton)addDayButton.hidden=['info','budget'].includes(String(day));
}
function openExclusiveModal(id){document.querySelectorAll('.modal-backdrop.show').forEach(modal=>{if(modal.id!==id)modal.classList.remove('show')});document.getElementById(id)?.classList.add('show');document.body.classList.add('modal-open')}
window.openExclusiveModal=openExclusiveModal;
function openJourneyModal(){openExclusiveModal('journeyModal')}
function openDayModal(){openExclusiveModal('dayModal')}
function openSpotModal(){openExclusiveModal('spotModal')}
function closeModal(id){document.getElementById(id)?.classList.remove('show');if(!document.querySelector('.modal-backdrop.show'))document.body.classList.remove('modal-open')}
function closeOnBackdrop(e,id){if(['journeyModal','masterDataModal','dayModal','spotModal','expenseModal'].includes(id))return;if(e.target.id===id)closeModal(id)}
function closeDayMenus(){document.querySelectorAll('.day-menu-panel.show').forEach(panel=>panel.classList.remove('show'))}
function toggleDayMenu(btn){const panel=btn.nextElementSibling;const shouldOpen=!panel?.classList.contains('show');closeDayMenus();if(shouldOpen)panel?.classList.add('show')}
function toggleThought(btn){btn.nextElementSibling?.classList.toggle('show')}
function switchMode(mode,btn){document.querySelectorAll('.mode-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
let journeyPage=1;
const journeyPageSize=5;
function filterJourneys(keepPage=false){
  if(!keepPage)journeyPage=1;
  const rawQuery=normalizeText(document.getElementById('searchInput')?.value);
  const q=rawQuery.toLowerCase();
  const region=document.getElementById('regionFilter')?.value||'all';
  const parsedFilter=Object.entries(masterFilterLabels).map(([type,label])=>({type,label,prefix:`${label} `})).find(item=>rawQuery.startsWith(item.prefix)&&rawQuery.slice(item.prefix.length).trim());
  if(activeMasterFilter&&rawQuery!==`${masterFilterLabels[activeMasterFilter.type]} ${activeMasterFilter.value}`)activeMasterFilter=null;
  const structuredFilter=parsedFilter?{type:parsedFilter.type,value:rawQuery.slice(parsedFilter.prefix.length).trim()}:activeMasterFilter;
  const matchesMaster=(journey,filter)=>{
    if(!filter)return true;const value=filter.value,details=journey.details||{};
    if(filter.type==='region')return journey.region===value;
    if(filter.type==='country')return canonicalCountry(journey.country)===canonicalCountry(value);
    if(filter.type==='city')return (journey.cities||[]).some(city=>canonicalCity(city)===canonicalCity(value));
    if(filter.type==='currency')return journey.currency===value;
    if(filter.type==='transport')return (details.transports||[]).includes(value);
    if(filter.type==='tag')return (details.tags||[]).includes(value);
    if(filter.type==='spot_type')return (journey.spotTypes||[]).includes(value);
    const expenses=Array.isArray(details.expenses)?details.expenses:Array.isArray(journey.expenses)?journey.expenses:[];
    if(filter.type==='expense_category')return expenses.some(expense=>expense.category===value);
    if(filter.type==='payer')return expenses.some(expense=>expense.payer===value);
    return false;
  };
  const filtered=journeys.filter(j=>(structuredFilter?matchesMaster(j,structuredFilter):(!q||String(j.searchText||'').toLowerCase().includes(q)))&&(region==='all'||j.region===region));
  visibleJourneys=filtered;
  const totalPages=Math.max(1,Math.ceil(filtered.length/journeyPageSize));
  journeyPage=Math.min(journeyPage,totalPages);
  const start=(journeyPage-1)*journeyPageSize;
  const filteredIds=new Set(filtered.map(journey=>String(journey.id)));
  let matchedIndex=0;
  document.querySelectorAll('.journey-card').forEach(card=>{
    const matches=filteredIds.has(String(card.dataset.journeyId));
    const visible=matches&&matchedIndex>=start&&matchedIndex<start+journeyPageSize;
    card.style.display=visible?'':'none';
    if(matches)matchedIndex+=1;
  });
  const pagination=document.getElementById('journeyPagination');
  if(pagination){
    pagination.hidden=filtered.length<=journeyPageSize;
    pagination.innerHTML=filtered.length<=journeyPageSize?'':`<button type="button" aria-label="第一頁" ${journeyPage===1?'disabled':''} onclick="setJourneyPage(1)">|‹</button><button type="button" aria-label="上一頁" ${journeyPage===1?'disabled':''} onclick="setJourneyPage(${journeyPage-1})">‹</button><span>${journeyPage} / ${totalPages}</span><button type="button" aria-label="下一頁" ${journeyPage===totalPages?'disabled':''} onclick="setJourneyPage(${journeyPage+1})">›</button><button type="button" aria-label="最末頁" ${journeyPage===totalPages?'disabled':''} onclick="setJourneyPage(${totalPages})">›|</button>`;
  }
  renderTimeline(filtered);
  renderMapPins(filtered);
  renderStats(filtered);
  const status=document.getElementById('dbStatus');if(status){status.textContent=`已載入 ${filtered.length} 趟旅程`;status.className=`db-status success${document.getElementById('detailView')?.classList.contains('active')?' hidden':''}`}
}
function setJourneyPage(page){journeyPage=Math.max(1,Number(page)||1);filterJourneys(true);document.querySelector('.section-head')?.scrollIntoView({behavior:'smooth',block:'start'})}
window.setJourneyPage=setJourneyPage;
function filterHomeByValue(value,event){event?.preventDefault();event?.stopPropagation();document.querySelectorAll('.modal-backdrop.show').forEach(modal=>modal.classList.remove('show'));document.body.classList.remove('modal-open');if(document.getElementById('detailView')?.classList.contains('active'))closeDetail();const input=document.getElementById('searchInput');if(input)input.value=value||'';filterJourneys();document.querySelector('.section-head')?.scrollIntoView({behavior:'smooth',block:'start'})}
window.filterHomeByValue=filterHomeByValue;
function filterHomeByMaster(type,value,event){event?.preventDefault();event?.stopPropagation();activeMasterFilter={type,value};document.querySelectorAll('.modal-backdrop.show').forEach(modal=>modal.classList.remove('show'));document.body.classList.remove('modal-open');if(document.getElementById('detailView')?.classList.contains('active'))closeDetail();const input=document.getElementById('searchInput');if(input)input.value=`${masterFilterLabels[type]||type} ${value}`;filterJourneys();document.querySelector('.section-head')?.scrollIntoView({behavior:'smooth',block:'start'})}
window.filterHomeByMaster=filterHomeByMaster;
function toggleRentalFields(){
  const fields=document.getElementById('rentalFields');if(!fields)return;
  const selected=[...document.querySelectorAll('#journeyModal [data-journey-transport]:checked')].some(input=>input.value==='租車');
  fields.classList.toggle('show',selected);
  if(selected)setTimeout(()=>fields.scrollIntoView({behavior:'smooth',block:'center'}),80);
}
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
function renderReviewTags(){
  const list=document.getElementById('reviewTagList');
  if(!list)return;
  list.innerHTML=reviewTags.map((tag,index)=>`<span class="review-tag-item">${escapeHtml(tag)}<button type="button" aria-label="刪除 ${escapeHtml(tag)}" onclick="removeReviewTag(${index})">×</button></span>`).join('');
}
window.renderReviewTags=renderReviewTags;
function addReviewTag(){
  const input=document.getElementById('reviewTagInput');
  const tag=normalizeText(input?.value);
  if(!tag)return;
  if(!reviewTags.some(item=>item.toLowerCase()===tag.toLowerCase()))reviewTags.push(tag);
  if(input)input.value='';
  renderReviewTags();
  input?.focus();
}
function removeReviewTag(index){reviewTags.splice(index,1);renderReviewTags()}
function handleReviewTagKey(event){if(event.key==='Enter'){event.preventDefault();addReviewTag()}}
async function saveActiveJourneyReview(value){
  if(!activeJourneyId)return false;
  const saved=await window.saveJourneySummary?.(activeJourneyId,value,reviewTags);
  return Boolean(saved);
}
window.saveActiveJourneyReview=saveActiveJourneyReview;
async function saveReview(){
  const value=document.getElementById('reviewEditor')?.value.trim() || '';
  await saveActiveJourneyReview(value);
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
  [['journeyRentalPickupAt','租車取車時間'],['journeyRentalReturnAt','租車還車時間']].forEach(([id,label])=>document.getElementById(id)?.addEventListener('change',event=>validateJourneyBoundedDate(event.target,label)));
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
window.initSpotDragging=initSpotDragging;

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

function applyManagedMasterOptions(options=[]){
  const active=options.filter(option=>option.is_active!==false);
  const values=type=>active.filter(option=>option.option_type===type).map(option=>option.value);
  const categories=values('expense_category');if(categories.length)masterData.category=[...new Set(categories)];
  const payers=values('payer');if(payers.length)masterData.payer=[...new Set(payers)];
  const currencies=values('currency');if(currencies.length)masterData.currency=[...new Set(currencies)];
  const spotTypes=values('spot_type'),spotTypeSelect=document.getElementById('spotType');
  if(spotTypeSelect&&spotTypes.length){const previous=spotTypeSelect.value;spotTypeSelect.innerHTML=[...new Set(spotTypes)].map(value=>`<option>${escapeHtml(value)}</option>`).join('');if(spotTypes.includes(previous))spotTypeSelect.value=previous}
  const transportValues=values('transport');
  if(transportValues.length){
    const selected=[...document.querySelectorAll('[data-journey-transport]:checked')].map(input=>input.value);
    renderJourneyTransportChips(transportValues,selected);
    toggleRentalFields();
  }
  syncMasterSelects();renderMasterData();renderBudget();
}
window.applyManagedMasterOptions=applyManagedMasterOptions;

let activeMasterTab = 'category';
let budgetFilterMode = 'all';
let activeExpenseId = null;

const prototypeExpenses = [];
function setJourneyExpenses(rows=[]){
  const hadMissing=prototypeExpenses.some(isExpenseMissing);
  prototypeExpenses.splice(0,prototypeExpenses.length,...rows);activeExpenseId=null;
  if(budgetFilterMode==='missing'&&hadMissing&&!prototypeExpenses.some(isExpenseMissing))budgetFilterMode='all';
  renderBudget();
}
window.setJourneyExpenses=setJourneyExpenses;

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
  const actualDay=(window.currentJourneyDayOptions||[]).find(option=>option.date===date);
  if(actualDay)return actualDay.value;
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
function syncExpenseDayOptions(){const select=document.getElementById('expenseDay');if(!select||!journeySettings.start||!journeySettings.end)return;const selected=select.value;const actualDays=window.currentJourneyDayOptions||[];let options='<option value="">未指定</option>';if(actualDays.length){options+=actualDays.map(option=>`<option value="${option.value}">${option.value} · ${String(option.date||'').replaceAll('-','/')}</option>`).join('')}else{const start=new Date(`${journeySettings.start}T00:00:00`),end=new Date(`${journeySettings.end}T00:00:00`);let index=1;for(let date=new Date(start);date<=end;date.setDate(date.getDate()+1),index++){const value=`Day ${index}`,label=`${value} · ${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}`;options+=`<option value="${value}">${label}</option>`}}select.innerHTML=options;select.value=[...select.options].some(option=>option.value===selected)?selected:''}
function syncExpensePhaseFilterOptions(){
  const select=document.getElementById('expensePhaseFilter');if(!select)return;
  const selected=select.value||'all';
  const days=window.currentJourneyDayOptions||[];
  select.innerHTML='<option value="all">全部</option><option value="pretrip">出發前</option>'+days.map(day=>`<option value="day:${escapeHtml(day.value)}">${escapeHtml(day.value)}</option>`).join('')+'<option value="posttrip">旅遊後</option>';
  select.value=[...select.options].some(option=>option.value===selected)?selected:'all';
}
window.syncExpensePhaseFilterOptions=syncExpensePhaseFilterOptions;
function localToday(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
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
async function addExpenseMasterOption(type,selectId,label){
  const value=normalizeText(prompt(`請輸入新的${label}`)||'');if(!value)return;
  const key=type==='expense_category'?'category':type==='currency'?'currency':'payer';
  const normalized=type==='currency'?value.toUpperCase():value;
  if(!masterData[key].includes(normalized))masterData[key].push(normalized);
  const saved=await window.saveJourneyOption?.(type,normalized,'');
  if(saved===false)return alert(`${label}尚未保存，請稍後再試。`);
  syncMasterSelects();const select=document.getElementById(selectId);if(select)select.value=normalized;
  if(selectId==='expenseCurrency')toggleCustomRate();
}
window.addExpenseMasterOption=addExpenseMasterOption;
async function deleteExpensePrototype(id){
  if(window.deleteJourneyExpense)return window.deleteJourneyExpense(id);
  const index=prototypeExpenses.findIndex(expense=>expense.id===id);
  if(index>=0 && confirm('確定刪除這筆費用嗎？')){prototypeExpenses.splice(index,1);renderBudget();}
}
function renderBudget(){
  const list=document.getElementById('expenseList'); if(!list)return;
  const phaseSelect=document.getElementById('expensePhaseFilter');
  const phaseFilter=phaseSelect?.value||'all';
  const periodExpenses=prototypeExpenses.filter(expense=>{
    if(phaseFilter==='all')return true;
    if(phaseFilter==='pretrip'||phaseFilter==='posttrip')return expense.phase===phaseFilter;
    if(phaseFilter.startsWith('day:'))return expense.phase==='local'&&expense.day===phaseFilter.slice(4);
    return true;
  });
  const missing=periodExpenses.filter(isExpenseMissing).length;
  let visible=[...periodExpenses];
  if(budgetFilterMode==='missing') visible=visible.filter(isExpenseMissing);
  const phaseLabels={pretrip:'出發前',local:'旅行中',posttrip:'旅遊後'};
  const groups=visible.reduce((acc,e)=>{const key=e.phase==='local'?(e.day||'旅行中'):phaseLabels[e.phase];(acc[key]??=[]).push(e);return acc;},{});
  const groupRank=group=>group==='出發前'?0:/^Day\s+(\d+)$/i.test(group)?Number(group.match(/\d+/)[0]):group==='旅行中'?10000:group==='旅遊後'?20000:15000;
  list.innerHTML=Object.entries(groups).sort(([a],[b])=>groupRank(a)-groupRank(b)).map(([group,items])=>`<section class="expense-group"><div class="expense-group-title"><b>${group}</b><span>${items.length} 筆</span></div>${items.map(e=>`<article class="expense-row ${isExpenseMissing(e)?'expense-incomplete':''}" role="button" tabindex="0" aria-label="編輯 ${e.item||e.category||'費用'}" onclick="openExpenseModal('${e.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openExpenseModal('${e.id}')}"><div class="expense-icon">${(e.category||'?').slice(0,1)}</div><div class="expense-main"><div><b>${e.item||'尚未填寫項目'}</b><span>${e.category||'未分類'} · ${e.payer||'未指定付款來源'} · ${e.date||'未填日期'}</span></div>${e.note?`<small>${e.note}</small>`:''}${isExpenseMissing(e)?'<small class="missing-label">需要補充完整資訊</small>':''}</div><div class="expense-value"><strong>${currencySymbol(e.currency)} ${e.amount===null?'—':numberText(e.amount)}</strong>${e.currency&&e.currency!=='TWD'?`<small>約 NT$ ${numberText(expenseTwd(e))}</small>`:'<small>台幣</small>'}</div><button class="expense-delete" type="button" aria-label="刪除費用" onclick="event.stopPropagation();deleteExpensePrototype('${e.id}')">×</button></article>`).join('')}</section>`).join('')||'<div class="expense-empty">這個篩選條件沒有費用。</div>';

  if(budgetFilterMode==='missing'&&missing===0)list.innerHTML='<div class="expense-empty expense-complete-message">全部都已填寫完整。</div>';
  const total=periodExpenses.reduce((sum,e)=>sum+expenseTwd(e),0);
  document.getElementById('budgetTotalTwd').textContent=`NT$ ${numberText(total)}`;
  document.getElementById('budgetEntryCount').textContent=`${periodExpenses.length} 筆`;
  document.getElementById('budgetMissingCount').textContent=`${missing} 筆`;
  document.getElementById('budgetCurrencyKpi').textContent=journeySettings.mainCurrency;
  document.getElementById('budgetMainCurrencyText').textContent=`${journeySettings.mainCurrency} ${journeySettings.mainCurrency==='JPY'?'日圓':''}`;
  const rateLabel=document.getElementById('budgetRateCurrencyLabel');if(rateLabel)rateLabel.textContent=`1 ${journeySettings.mainCurrency} =`;
  document.getElementById('heroCurrencyBadge').textContent=journeySettings.mainCurrency;
  const notice=document.getElementById('missingInfoCard');
  document.getElementById('missingInfoText').textContent=missing?`還有 ${missing} 筆消費尚未完成`:'所有消費資料都已完成';
  if(notice)notice.hidden=missing===0;
  notice?.classList.toggle('is-clear',missing===0);
  notice?.classList.toggle('active',budgetFilterMode==='missing');
  document.getElementById('budgetAllFilterButton')?.classList.toggle('active',budgetFilterMode==='all');
  document.getElementById('budgetMissingFilterButton')?.classList.toggle('active',budgetFilterMode==='missing');

  const categories=periodExpenses.filter(e=>e.category && e.amount!==null).reduce((acc,e)=>{acc[e.category]=(acc[e.category]||0)+expenseTwd(e);return acc},{});
  const entries=Object.entries(categories).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...entries.map(([,v])=>v),1);
  document.getElementById('categorySummary').innerHTML=entries.length?entries.map(([name,value])=>`<div class="category-row"><div><b>${name}</b><span>NT$ ${numberText(value)}</span></div><div class="category-bar"><i style="width:${Math.max(4,value/max*100)}%"></i></div></div>`).join(''):'<p class="summary-empty">尚無可統計的消費。</p>';

  const payers=periodExpenses.filter(e=>e.payer && e.amount!==null).reduce((acc,e)=>{acc[e.payer]=(acc[e.payer]||0)+expenseTwd(e);return acc},{});
  const payerEntries=Object.entries(payers).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
  const payerMax=Math.max(...payerEntries.map(([,value])=>value),1);
  document.getElementById('payerSummary').innerHTML=payerEntries.length?payerEntries.map(([name,value])=>`<div class="category-row"><div><b>${name}</b><span>NT$ ${numberText(value)}</span></div><div class="category-bar"><i style="width:${Math.max(4,value/payerMax*100)}%"></i></div></div>`).join(''):'<p class="summary-empty">尚無付款來源資料。</p>';
}
function setBudgetFilter(mode){
  budgetFilterMode=mode==='missing'?'missing':'all';
  renderBudget();
  document.getElementById('expenseList')?.scrollIntoView({behavior:'smooth',block:'start'});
}
window.setBudgetFilter=setBudgetFilter;
function showMissingExpenses(){setBudgetFilter(budgetFilterMode==='missing'?'all':'missing')}
function openExpenseModal(expenseId=null){
  activeExpenseId=expenseId;
  openExclusiveModal('expenseModal');
  syncMasterSelects();
  const expense=prototypeExpenses.find(item=>item.id===expenseId);
  const today=localToday();
  document.getElementById('expenseModalTitle').textContent=expense?'編輯費用':'新增費用';
  document.getElementById('expenseSaveButton').textContent=expense?'儲存修改':'新增費用';
  const expenseDate=expense?.date||today;
  document.getElementById('expenseDate').value=expenseDate;
  const expenseDay=expense?.day||dayFromDate(expenseDate);
  document.getElementById('expenseDay').value=expenseDay;
  document.getElementById('expensePhase').value=expenseDay?'local':(expense?.phase||phaseFromDate(expenseDate));
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
  if(phase)phase.value=day?.value?'local':phaseFromDate(date);
}
function syncExpenseDateFromDay(){
  const selected=document.getElementById('expenseDay')?.value;
  const phase=document.getElementById('expensePhase');
  if(phase)phase.value=selected?'local':phaseFromDate(document.getElementById('expenseDate')?.value);
}
window.syncExpenseDateFromDay=syncExpenseDateFromDay;
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
async function addExpensePrototype(){
  const amountRaw=document.getElementById('expenseAmount')?.value;
  const payload={
    id:activeExpenseId||Date.now(),phase:document.getElementById('expensePhase').value,day:document.getElementById('expenseDay').value,
    date:document.getElementById('expenseDate').value,category:document.getElementById('expenseCategory').value,item:document.getElementById('expenseItem').value.trim(),
    currency:document.getElementById('expenseCurrency').value,amount:amountRaw===''?null:Number(amountRaw),rate:document.getElementById('expenseRate').value===''?null:Number(document.getElementById('expenseRate').value),
    payer:document.getElementById('expensePayer').value,note:document.getElementById('expenseNote').value.trim()
  };
  if(window.saveJourneyExpense){
    const button=document.getElementById('expenseSaveButton');if(button)button.disabled=true;
    try{return await window.saveJourneyExpense(payload)}finally{if(button)button.disabled=false}
  }
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
function setJourneyRate(value){
  const normalized=Number(value)||0;
  journeySettings.defaultRate=normalized;
  const modalRate=document.getElementById('journeyDefaultRate');
  const budgetRate=document.getElementById('journeyRate');
  if(modalRate&&Number(modalRate.value)!==normalized)modalRate.value=normalized;
  if(budgetRate&&Number(budgetRate.value)!==normalized)budgetRate.value=normalized;
  renderBudget();
}
function syncJourneyRateSettings(){
  setJourneyRate(document.getElementById('journeyDefaultRate')?.value);
}
function syncJourneyRateFromBudget(){
  setJourneyRate(document.getElementById('journeyRate')?.value);
}
async function persistJourneyRate(){
  const input=document.getElementById('journeyRate');
  const rate=Number(input?.value);
  if(!window.currentJourneyId||!Number.isFinite(rate)||rate<=0)return;
  if(input)input.disabled=true;
  try{
    const previous=Number(input?.dataset.persistedRate||journeySettings.defaultRate);
    const saved=await window.updateJourneyDefaultRate?.(rate,previous);
    if(saved===false)alert('匯率同步失敗，請稍後再試。');
    if(saved===null){setJourneyRate(previous);return;}
    if(saved&&input)input.dataset.persistedRate=String(rate);
  }finally{if(input)input.disabled=false}
}
window.persistJourneyRate=persistJourneyRate;
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
  syncExpenseDayOptions();
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
  syncMasterSelects();renderMasterData();renderBudget();
  const rate=document.getElementById('journeyRate');if(rate)rate.value=journeySettings.defaultRate;
  ['expenseAmount','expenseRate'].forEach(id=>document.getElementById(id)?.addEventListener('input',updateConvertedPreview));
});
