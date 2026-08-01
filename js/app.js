let map=null,markerLayer=null,currentJourneyId=null,currentUser=null,journeys=[],editingJourneyId=null,photoObjectUrl='';
const $=id=>document.getElementById(id);
const value=id=>$(id)?.value?.trim?.()||'';
const setValue=(id,v='')=>{if($(id))$(id).value=v??''};
const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

document.addEventListener('DOMContentLoaded',async()=>{
  bindHomeViewTabs();bindPhotoPreview();bindDragAndDrop();bindDismissBehaviors();initMap();
  await restoreSession();await loadJourneys();
});

async function restoreSession(){
  if(!window.travelDb){showStatus('無法連接資料庫','error');return}
  const {data}=await travelDb.auth.getSession();currentUser=data?.session?.user||null;
  if(currentUser){$('currentUserText').textContent=currentUser.email||'已登入'}
  $('logoutButton')?.addEventListener('click',async()=>{await travelDb.auth.signOut();location.reload()});
}

async function loadJourneys(){
  if(!currentUser){journeys=readLocalJourneys();renderAll();showStatus('尚未登入，暫時顯示此裝置的資料','error');return}
  const {data,error}=await travelDb.from('journeys').select('*').order('start_date',{ascending:false});
  if(error){journeys=readLocalJourneys();renderAll();showStatus('讀取失敗：'+error.message,'error');return}
  journeys=(data||[]).map(normalizeJourney);renderAll();showStatus('資料已同步');
}

function normalizeJourney(row){
  const cities=Array.isArray(row.cities)?row.cities:(row.cities?String(row.cities).split(',').map(x=>x.trim()).filter(Boolean):[]);
  const transports=Array.isArray(row.transports)?row.transports:(row.transportation?String(row.transportation).split(',').map(x=>x.trim()).filter(Boolean):[]);
  return {...row,title:row.title||row.name||'未命名旅程',region:row.region||row.category||'其他',country:row.country||'',cities,
    pin_place:row.pin_place||row.representative_place||row.main_city||cities[0]||row.country||'',cover_url:row.cover_url||row.cover_photo||row.cover_path||'',
    transports,no_flight:Boolean(row.no_flight),summary:row.summary||''};
}

function renderAll(){renderJourneyList();renderTimeline();renderMap();renderStats()}

function renderStats(){
  const stats=document.querySelectorAll('.stats .stat strong');if(!stats.length)return;
  stats[0].textContent=journeys.length;
  stats[1].textContent=new Set(journeys.map(j=>j.country).filter(Boolean)).size;
  stats[2].textContent=new Set(journeys.flatMap(j=>j.cities||[]).filter(Boolean)).size;
}

function renderJourneyList(){
  const list=$('journeyList');if(!list)return;
  if(!journeys.length){list.innerHTML='<div class="empty-state">目前還沒有旅程，按右上角「新增旅程」開始收藏。</div>';return}
  list.innerHTML=journeys.map((j,i)=>`<article class="journey-card" data-region="${escapeHtml(j.region)}" data-search="${escapeHtml([j.country,...j.cities,j.pin_place,j.title].join(' '))}">
    <div class="journey-top"><div><div class="eyebrow">${escapeHtml(j.country)} · ${escapeHtml(j.cities[0]||j.pin_place||'')}</div><h3>${escapeHtml(j.title)}</h3><div class="date">${formatRange(j.start_date,j.end_date)}</div></div>${i===0?'<div class="pill">最新旅程</div>':''}</div>
    ${j.summary?`<p class="summary">${escapeHtml(j.summary)}</p>`:''}<div class="chips">${journeyTags(j).map(x=>`<span class="chip">${escapeHtml(x)}</span>`).join('')}</div>
    <div class="card-actions"><button class="text-link" onclick="openDetail('${j.id}')">查看實際行程　→</button><div class="icon-actions"><button onclick="openJourneyModal('${j.id}')" aria-label="編輯">✎</button><button onclick="deleteJourney('${j.id}')" aria-label="刪除">⌫</button></div></div></article>`).join('');
  filterJourneys();
}

function journeyTags(j){const tags=[];const days=dayCount(j.start_date,j.end_date);if(days)tags.push(`${days} 天 ${Math.max(0,days-1)} 夜`);return tags.concat((j.transports||[]).slice(0,2))}
function dayCount(a,b){if(!a||!b)return 0;return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1)}
function formatRange(a,b){if(!a&&!b)return '日期未設定';const f=x=>x?String(x).replaceAll('-','.'):'未設定';return `${f(a)}－${f(b)}`}

function bindHomeViewTabs(){document.querySelectorAll('[data-home-view]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('[data-home-view]').forEach(x=>x.classList.toggle('active',x===btn));
  const timeline=btn.dataset.homeView==='timeline';$('mapCard').classList.toggle('hidden',timeline);$('archiveTimeline').classList.toggle('hidden',!timeline);
  if(!timeline)setTimeout(()=>map?.invalidateSize(),50);
}))}

function renderTimeline(){
  const box=$('archiveTimelineGrid'),years=$('archiveTimeline')?.querySelector('.timeline-years');if(!box)return;
  const sorted=[...journeys].sort((a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||'')));
  const grouped=Object.groupBy?Object.groupBy(sorted,j=>String(j.start_date||'未定').slice(0,4)):sorted.reduce((a,j)=>((a[String(j.start_date||'未定').slice(0,4)]||=[]).push(j),a),{});
  const yearKeys=Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  if(years)years.innerHTML=yearKeys.map(y=>`<span>${escapeHtml(y)}</span>`).join('');
  box.innerHTML=yearKeys.map(y=>`<section class="timeline-year-group"><h3>${escapeHtml(y)}</h3><div class="timeline-year-cards">${grouped[y].map(timelineCard).join('')}</div></section>`).join('')||'<div class="empty-state">新增旅程後會依年份顯示在這裡。</div>';
}
function timelineCard(j){const style=j.cover_url?`style="background-image:url('${escapeHtml(j.cover_url)}')"`:'';return `<button class="timeline-trip" onclick="openDetail('${j.id}')"><span class="timeline-photo" ${style}></span><span class="timeline-copy"><strong>${escapeHtml(j.title)}</strong><small>${formatRange(j.start_date,j.end_date)}</small><small>📍 ${escapeHtml(j.pin_place||j.cities[0]||j.country)}</small></span></button>`}

function initMap(){if(!window.L||!$('map'))return;map=L.map('map',{zoomControl:true}).setView([30,125],4);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);markerLayer=L.layerGroup().addTo(map)}
function renderMap(){if(!map||!markerLayer)return;markerLayer.clearLayers();const bounds=[];const used=new Map();
  journeys.forEach((j,index)=>{let coords=journeyCoords(j);if(!coords)return;const key=coords.join(',');const duplicate=used.get(key)||0;used.set(key,duplicate+1);coords=[coords[0]+duplicate*.045,coords[1]+duplicate*.045];bounds.push(coords);
    const icon=L.divIcon({className:'',html:`<div class="photo-pin" style="width:44px;height:44px;${j.cover_url?`background-image:url('${escapeHtml(j.cover_url)}')`:''}"></div>`,iconSize:[44,44],iconAnchor:[22,22]});
    L.marker(coords,{icon}).addTo(markerLayer).on('click',()=>openPinPopover(j));
  });if(bounds.length)map.fitBounds(bounds,{padding:[45,45],maxZoom:7})}
function journeyCoords(j){const lat=Number(j.latitude??j.lat),lng=Number(j.longitude??j.lng);if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat&&lng)return[lat,lng];const terms=[j.pin_place,...(j.cities||[]),j.country].filter(Boolean);for(const term of terms){const hit=Object.entries(window.TRAVEL_COORDINATES||{}).find(([k])=>String(term).includes(k)||k.includes(String(term)));if(hit)return hit[1]}return[23.7,120.96]}
function openPinPopover(j){$('popCountry').textContent=j.country||j.region;$('popCity').textContent=j.pin_place||j.cities[0]||j.title;$('popTrips').innerHTML=`<button class="timeline-trip" onclick="openDetail('${j.id}');closePopover()">${timelineCard(j).replace(/^<button[^>]*>|<\/button>$/g,'')}</button>`;$('popover').classList.add('show')}
function closePopover(){$('popover').classList.remove('show')}

function openJourneyModal(id=null){
  editingJourneyId=id||null;const j=id?journeys.find(x=>String(x.id)===String(id)):null;resetJourneyForm();
  if(j)populateJourneyForm(j);openModal('journeyModal');
}
function openCurrentJourneyModal(){openJourneyModal(currentJourneyId)}
function resetJourneyForm(){
  ['journeyName','journeyStart','journeyEnd','journeyPinPlace','airline','outboundDate','outboundNumber','outboundFrom','outboundTo','outboundDepartTime','outboundArriveTime','inboundDate','inboundNumber','inboundFrom','inboundTo','inboundDepartTime','inboundArriveTime'].forEach(id=>setValue(id,''));
  setValue('journeyRegion','');setValue('journeyCountry','');$('cityInputGrid').innerHTML='<input placeholder="城市／地區 1">';$('noFlight').checked=false;document.querySelectorAll('[data-transport]').forEach(x=>x.checked=false);photoObjectUrl='';$('journeyPhotoPreview').style.backgroundImage='';toggleFlightFields();toggleRentalFields();
}
function populateJourneyForm(j){setValue('journeyRegion',j.region);setValue('journeyCountry',j.country);setValue('journeyName',j.title);setValue('journeyStart',j.start_date);setValue('journeyEnd',j.end_date);setValue('journeyPinPlace',j.pin_place);$('cityInputGrid').innerHTML=(j.cities.length?j.cities:['']).map((c,i)=>`<input value="${escapeHtml(c)}" placeholder="城市／地區 ${i+1}">`).join('');$('noFlight').checked=Boolean(j.no_flight);document.querySelectorAll('[data-transport]').forEach(x=>x.checked=(j.transports||[]).includes(x.value));if(j.cover_url)$('journeyPhotoPreview').style.backgroundImage=`url('${j.cover_url}')`;const f=j.flight_info||{};['airline','outboundDate','outboundNumber','outboundFrom','outboundTo','outboundDepartTime','outboundArriveTime','inboundDate','inboundNumber','inboundFrom','inboundTo','inboundDepartTime','inboundArriveTime'].forEach(id=>setValue(id,j[id]??f[id]??''));toggleFlightFields();toggleRentalFields()}

function collectJourney(){
  const title=value('journeyName'),start=value('journeyStart'),end=value('journeyEnd');if(!title)throw new Error('請輸入旅程名稱');if(!start||!end)throw new Error('請選擇開始與結束日期');if(end<start)throw new Error('結束日期不能早於開始日期');
  const cities=[...$('cityInputGrid').querySelectorAll('input')].map(x=>x.value.trim()).filter(Boolean);const transports=[...document.querySelectorAll('[data-transport]:checked')].map(x=>x.value);const noFlight=$('noFlight').checked;
  const flight_info=noFlight?{}:Object.fromEntries(['airline','outboundDate','outboundNumber','outboundFrom','outboundTo','outboundDepartTime','outboundArriveTime','inboundDate','inboundNumber','inboundFrom','inboundTo','inboundDepartTime','inboundArriveTime'].map(id=>[id,value(id)]));
  return {title,region:value('journeyRegion')||'其他',country:value('journeyCountry'),start_date:start,end_date:end,cities,pin_place:value('journeyPinPlace')||cities[0]||value('journeyCountry'),no_flight:noFlight,flight_info,transports};
}

async function saveJourneyPrototype(){
  let payload;try{payload=collectJourney()}catch(e){alert(e.message);return}const button=document.querySelector('#journeyModal .primary');button.disabled=true;button.textContent='儲存中…';
  try{
    if(currentUser){payload.owner_id=currentUser.id;payload.user_id=currentUser.id;const cover=await uploadCover(editingJourneyId||crypto.randomUUID());if(cover)payload.cover_url=cover;const saved=await flexibleJourneyWrite(payload,editingJourneyId);if(editingJourneyId)journeys=journeys.map(j=>String(j.id)===String(editingJourneyId)?normalizeJourney(saved):j);else journeys.unshift(normalizeJourney(saved));}
    else{const local={...payload,id:editingJourneyId||crypto.randomUUID(),created_at:new Date().toISOString(),cover_url:photoObjectUrl};if(editingJourneyId)journeys=journeys.map(j=>j.id===editingJourneyId?local:j);else journeys.unshift(local);writeLocalJourneys(journeys)}
    closeModal('journeyModal');renderAll();showStatus('旅程已儲存');
  }catch(e){alert('儲存失敗：'+(e.message||e));showStatus('儲存失敗','error')}finally{button.disabled=false;button.textContent='儲存'}
}

async function flexibleJourneyWrite(payload,id){
  const candidate={...payload};for(let attempt=0;attempt<18;attempt++){
    const query=id?travelDb.from('journeys').update(candidate).eq('id',id).select().single():travelDb.from('journeys').insert(candidate).select().single();const {data,error}=await query;if(!error)return data;
    const missing=extractMissingColumn(error.message);if(missing&&Object.hasOwn(candidate,missing)){delete candidate[missing];continue}
    throw error;
  }throw new Error('資料表欄位與網站版本差異過大，請執行隨附的修正 SQL。')
}
function extractMissingColumn(message=''){const patterns=[/Could not find the '([^']+)' column/i,/column ["']?([a-zA-Z0-9_]+)["']? of relation .* does not exist/i,/schema cache.*["']([a-zA-Z0-9_]+)["']/i];for(const p of patterns){const m=message.match(p);if(m)return m[1]}return''}

async function uploadCover(key){const file=$('journeyPhotoInput')?.files?.[0];if(!file||!currentUser)return'';const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${currentUser.id}/${key}-${Date.now()}.${ext}`;const {error}=await travelDb.storage.from('journey-cover').upload(path,file,{upsert:true});if(error)return'';return travelDb.storage.from('journey-cover').getPublicUrl(path).data.publicUrl||''}

async function deleteJourney(id){if(!confirm('確定刪除此旅程嗎？'))return;try{if(currentUser){const {error}=await travelDb.from('journeys').delete().eq('id',id);if(error)throw error}journeys=journeys.filter(j=>String(j.id)!==String(id));writeLocalJourneys(journeys);renderAll();showStatus('旅程已刪除')}catch(e){alert('刪除失敗：'+e.message)}}

function openDetail(id){const j=journeys.find(x=>String(x.id)===String(id));if(!j)return;currentJourneyId=j.id;$('homeView').classList.add('hidden-by-detail');$('detailView').classList.add('active');$('detailEyebrow').textContent=`${j.country||''} · ${j.cities[0]||j.pin_place||''}`;$('detailTitle').textContent=j.title;$('detailMetaText').textContent=`${formatRange(j.start_date,j.end_date)}　｜　代表地點：${j.pin_place||'未設定'}`;if(j.cover_url){$('detailHero').style.backgroundImage=`url('${j.cover_url}')`}else $('detailHero').style.backgroundImage='';hideStatus();closeAllDayMenus();window.scrollTo({top:0,behavior:'smooth'})}
function closeDetail(){$('detailView').classList.remove('active');$('homeView').classList.remove('hidden-by-detail');currentJourneyId=null;window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>map?.invalidateSize(),60)}

function openModal(id){$(id)?.classList.add('show');document.body.classList.add('modal-open')}
function closeModal(id){$(id)?.classList.remove('show');if(!document.querySelector('.modal-backdrop.show'))document.body.classList.remove('modal-open')}
function closeOnBackdrop(e,id){if(e.target===e.currentTarget)closeModal(id)}
function addCityInput(){const input=document.createElement('input');input.placeholder=`城市／地區 ${$('cityInputGrid').children.length+1}`;$('cityInputGrid').appendChild(input)}
function addCustomRegion(){const v=prompt('請輸入新的地區分類');if(v)addOption('journeyRegion',v)}function addCustomCountry(){const v=prompt('請輸入新的國家');if(v)addOption('journeyCountry',v)}function addOption(id,v){const o=new Option(v,v,true,true);$(id).add(o)}
function toggleFlightFields(){$('flightFields')?.classList.toggle('hidden',$('noFlight')?.checked)}
function toggleRentalFields(){const checked=[...document.querySelectorAll('[data-transport]')].some(x=>x.checked&&x.value==='租車');$('rentalFields')?.classList.toggle('show',checked)}
function bindPhotoPreview(){$('journeyPhotoInput')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(photoObjectUrl)URL.revokeObjectURL(photoObjectUrl);photoObjectUrl=file?URL.createObjectURL(file):'';$('journeyPhotoPreview').style.backgroundImage=photoObjectUrl?`url('${photoObjectUrl}')`:''})}

function filterJourneys(){const q=value('searchInput').toLowerCase(),region=value('regionFilter')||'all';document.querySelectorAll('#journeyList .journey-card').forEach(card=>{const matchQ=!q||(card.dataset.search||'').toLowerCase().includes(q);const matchR=region==='all'||card.dataset.region===region;card.classList.toggle('hidden',!(matchQ&&matchR))})}
function switchMode(mode,button){document.querySelectorAll('.mode-tab').forEach(x=>x.classList.remove('active'));button.classList.add('active');$('modeNote').textContent=`目前顯示「${mode==='planned'?'規劃行程':'實際行程'}」。`}
function showDay(day,button){document.querySelectorAll('.day-section').forEach(x=>x.classList.toggle('active',x.dataset.day==day));document.querySelectorAll('.day-tab').forEach(x=>x.classList.remove('active'));button.classList.add('active');closeAllDayMenus()}
function toggleDayMenu(button){const menu=button.closest('.day-menu'),open=menu.classList.contains('open');closeAllDayMenus();if(!open)menu.classList.add('open')}
function closeAllDayMenus(){document.querySelectorAll('.day-menu.open').forEach(x=>x.classList.remove('open'))}
function bindDismissBehaviors(){window.addEventListener('scroll',closeAllDayMenus,{passive:true,capture:true});document.addEventListener('pointerdown',e=>{if(!e.target.closest('.day-menu'))closeAllDayMenus()})}
function toggleThought(button){button.nextElementSibling?.classList.toggle('show')}
function openDayModal(){openModal('dayModal')}function openSpotModal(){openModal('spotModal')}
function openReviewModal(){setValue('reviewEditor',$('reviewText')?.textContent||'');openModal('reviewModal')}function saveReview(){$('reviewText').textContent=value('reviewEditor');closeModal('reviewModal')}function deleteReview(){if(confirm('確定刪除總心得嗎？'))$('journeyReview').classList.add('hidden')}
function bindDragAndDrop(){document.querySelectorAll('[draggable-list]').forEach(list=>{let dragging;list.addEventListener('dragstart',e=>{dragging=e.target.closest('.spot-card');dragging?.classList.add('dragging')});list.addEventListener('dragend',()=>{dragging?.classList.remove('dragging');dragging=null});list.addEventListener('dragover',e=>{e.preventDefault();if(!dragging)return;const after=[...list.querySelectorAll('.spot-card:not(.dragging)')].find(x=>e.clientY<=x.getBoundingClientRect().top+x.offsetHeight/2);after?list.insertBefore(dragging,after):list.appendChild(dragging)})})}
function showStatus(message,type='success'){if($('detailView')?.classList.contains('active'))return;const box=$('dbStatus');box.textContent=message;box.className=`db-status show ${type==='error'?'error':''}`;clearTimeout(showStatus.timer);showStatus.timer=setTimeout(hideStatus,type==='error'?6000:2300)}function hideStatus(){if($('dbStatus'))$('dbStatus').className='db-status'}
function readLocalJourneys(){try{return JSON.parse(localStorage.getItem('travel-archive-journeys')||'[]').map(normalizeJourney)}catch{return[]}}function writeLocalJourneys(v){localStorage.setItem('travel-archive-journeys',JSON.stringify(v))}

window.openJourneyModal=openJourneyModal;window.openCurrentJourneyModal=openCurrentJourneyModal;window.saveJourneyPrototype=saveJourneyPrototype;window.openDetail=openDetail;window.closeDetail=closeDetail;window.closeModal=closeModal;window.closeOnBackdrop=closeOnBackdrop;window.addCityInput=addCityInput;window.addCustomRegion=addCustomRegion;window.addCustomCountry=addCustomCountry;window.toggleFlightFields=toggleFlightFields;window.toggleRentalFields=toggleRentalFields;window.filterJourneys=filterJourneys;window.deleteJourney=deleteJourney;window.closePopover=closePopover;window.switchMode=switchMode;window.showDay=showDay;window.toggleDayMenu=toggleDayMenu;window.toggleThought=toggleThought;window.openDayModal=openDayModal;window.openSpotModal=openSpotModal;window.openReviewModal=openReviewModal;window.saveReview=saveReview;window.deleteReview=deleteReview;
