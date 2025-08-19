
(() => {
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const API = (window.__FOODY__&&window.__FOODY__.FOODY_API) || window.foodyApi || "https://foodyback-production.up.railway.app";

  // State
  let ALL = [];           // full dataset
  let VIEW = [];          // filtered/sorted
  let RENDER_N = 24;      // incremental render count
  let CURRENT = null;     // offer opened in sheet

  
  // --- Geolocation & distance ---
  let USER_POS = null; // {lat,lng}
  function getOfferPos(o){
    try{
      if (o.lat!=null && o.lng!=null) return {lat:+o.lat,lng:+o.lng};
      if (o.latitude!=null && o.longitude!=null) return {lat:+o.latitude,lng:+o.longitude};
      if (o.restaurant && (o.restaurant.lat!=null || o.restaurant.latitude!=null)){
        const r=o.restaurant; return {lat:+(r.lat||r.latitude), lng:+(r.lng||r.longitude)};
      }
    }catch(_){}
    return null;
  }
  function haversine(a,b){
    const R=6371; const toRad=v=>v*Math.PI/180;
    const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lng-a.lng);
    const lat1=toRad(a.lat), lat2=toRad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h)); // km
  }
  function getDistanceKm(o){
    const p=getOfferPos(o); if(!p||!USER_POS) return Infinity;
    return haversine(USER_POS, p);
  }
  function requestGeo(){
    if (!navigator.geolocation){ toast('Геолокация не поддерживается'); return; }
    navigator.geolocation.getCurrentPosition((pos)=>{
      USER_POS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      applyFilterSort(); render(true);
    }, ()=> toast('Не удалось определить геопозицию'), { enableHighAccuracy:true, timeout:5000, maximumAge:60000 });
  }
// Elements
  const grid = $('#grid');
  const sortSel = document.getElementById('sort');
  const gridSk = $('#gridSkeleton');
  const q = $('#q');
  const filters = $('#filters');
  const loadMoreWrap = $('#loadMoreWrap');
  const loadMoreBtn = $('#loadMore');
  const sheet = $('#sheet');
  const toastBox = $('#toast');
  const ticketBar = $('#ticketBar');
  const ticketOffer = $('#ticketOffer');
  const ticketCode = $('#ticketCode');

  // Utils
  const fmt = new Intl.DateTimeFormat('ru-RU', {dateStyle:'short', timeStyle:'short'});
  function leftStr(iso){
    try{
      if(!iso) return ''; const t = new Date(iso).getTime()-Date.now(); if (t<=0) return 'истёк';
      const m = Math.floor(t/60000), h = Math.floor(m/60), mm = m%60;
      return h>0 ? `осталось ${h}ч ${mm}м` : `осталось ${m}м`;
    }catch(_){return ''}
  }
  function disc(price, old){ if (!old || old<=0) return 0; return Math.round( (1 - price/old)*100 ); }
  function parseJSON(res){ return res.json().catch(_=>({})); }
  function toast(m){ const el=document.createElement('div'); el.className='t'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(),2800); }

  // Ticket (reservation) bar from localStorage
  function readTicket(){
    try{ return JSON.parse(localStorage.getItem('foody_ticket')||'null'); }catch(_){ return null; }
  }
  function writeTicket(t){
    try{
      if (t) localStorage.setItem('foody_ticket', JSON.stringify(t)); else localStorage.removeItem('foody_ticket');
      applyTicket();
    }catch(_){}
  }
  function applyTicket(){
    const t = readTicket();
    if (t && t.code && t.title){ ticketBar.classList.remove('hidden'); ticketOffer.textContent = t.title; ticketCode.textContent = t.code; }
    else { ticketBar.classList.add('hidden'); }
  }
  $('#showTicket')?.addEventListener('click', ()=>{
    const t = readTicket(); if (!t) return;
    openSheet({ title: t.title, image_url: t.image_url, price_cents:t.price_cents, original_price_cents:t.original_price_cents, qty_left:t.qty_left, expires_at:t.expires_at, description:t.description, ticket_code: t.code });
  });

  // Filters
  let currentFilter = 'all';
  if (filters){
    filters.addEventListener('click', (e)=>{
      const btn = e.target.closest('.chip'); if (!btn) return;
      $$('.chip', filters).forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all'; applyFilterSort(); render(true);
    });
  }
  q?.addEventListener('input', ()=>{ applyFilterSort(); render(true); });
  sortSel?.addEventListener('change', ()=>{ applyFilterSort(); render(true); });
  document.getElementById('nearMe')?.addEventListener('click', requestGeo);

  function applyFilterSort(){
    const qv = (q?.value||'').trim().toLowerCase();
    const now = Date.now();
    let arr = ALL.slice();
    if (qv) arr = arr.filter(o=> (o.title||'').toLowerCase().includes(qv));
    if (currentFilter==='soon') arr = arr.filter(o=> o.expires_at && (new Date(o.expires_at).getTime()-now) < 4*3600e3 );
    if (currentFilter==='discount') arr = arr.filter(o=> disc((o.price_cents||0)/100,(o.original_price_cents||0)/100) >= 50);
    if (currentFilter==='in_stock') arr = arr.filter(o=> (o.qty_left??0) > 0);
    // sort
    const mode = (sortSel?.value||'soon');
    arr.sort((a,b)=>{
      if (mode==='distance'){
        const da = getDistanceKm(a), db = getDistanceKm(b);
        return (da - db);
      }
      // default: soonest first, then bigger discount
      const ta = a.expires_at? new Date(a.expires_at).getTime(): Infinity;
      const tb = b.expires_at? new Date(b.expires_at).getTime(): Infinity;
      if (ta!==tb) return ta-tb;
      const da = disc((a.price_cents||0)/100,(a.original_price_cents||0)/100);
      const db = disc((b.price_cents||0)/100,(b.original_price_cents||0)/100);
      return db-da;
    });
    VIEW = arr;
  }

  // Render
  function render(reset=false){
    if (!grid) return;
    if (reset){ grid.innerHTML=''; grid.dataset.rendered='0'; }
    if (VIEW.length===0){ grid.innerHTML = '<div class="empty">Пока нет офферов рядом</div>'; loadMoreWrap.classList.add('hidden'); return; }
    const rendered = Number(grid.dataset.rendered||0);
    const upto = Math.min(VIEW.length, rendered + RENDER_N);
    for (let i=rendered; i<upto; i++){
      const o = VIEW[i];
      const price = (o.price_cents||0)/100, old = (o.original_price_cents||0)/100, d = disc(price, old);
      const el = document.createElement('div'); el.className='card'; el.innerHTML =
        `<img loading="lazy" src="${o.image_url||''}" alt="">
         <div class="p">
           <div class="price">${price.toFixed(0)} ₽${d?`<span class="badge">-${d}%</span>`:''}</div>
           <div class="title">${o.title||'—'}</div>
           <div class="meta">Осталось: ${o.qty_left??'—'}</div>
         </div>`;
      el.addEventListener('click', ()=>openSheet(o));
      grid.appendChild(el);
    }
    grid.dataset.rendered = String(upto);
    loadMoreWrap.classList.toggle('hidden', upto>=VIEW.length);
  }
  loadMoreBtn?.addEventListener('click', ()=>render(false));

  // Sheet
  function openSheet(o){
    CURRENT = o;
    $('#sTitle').textContent = o.title||'—';
    $('#sImg').src = o.image_url||'';
    const price = (o.price_cents||0)/100, old = (o.original_price_cents||0)/100, d = disc(price, old);
    $('#sPrice').textContent = price.toFixed(0)+' ₽';
    $('#sOld').textContent = old? (old.toFixed(0)+' ₽') : '';
    $('#sDisc').textContent = d? ('-'+d+'%') : '';
    $('#sQty').textContent = (o.qty_left??'—');
    $('#sExp').textContent = o.expires_at? fmt.format(new Date(o.expires_at)) : '—';
    $('#sLeft').textContent = leftStr(o.expires_at||'');
    $('#sDesc').textContent = o.description||'';
    // Reserve button
    const btn = $('#reserveBtn');
    if (btn){
      btn.disabled = false;
      btn.onclick = async ()=>{
        btn.disabled = true;
        try{
          const resp = await fetch(API+'/api/v1/public/reserve',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ offer_id: o.id||o.offer_id, name: 'TG', phone: '' })
          });
          const data = await parseJSON(resp);
          if (!resp.ok) throw new Error(data?.detail||'reserve');
          toast('Забронировано ✅');
          if (data && (data.code||data.ticket_code)){
            writeTicket({ code: data.code||data.ticket_code, title: o.title, image_url: o.image_url, price_cents:o.price_cents, original_price_cents:o.original_price_cents, qty_left:o.qty_left, expires_at:o.expires_at, description:o.description });
          }
        }catch(e){ toast('Не удалось забронировать'); }
        finally { btn.disabled = false; }
      };
    }
    sheet.classList.remove('hidden');
  }
  $('#sheetClose')?.addEventListener('click', ()=>{ sheet.classList.add('hidden'); });

  // Load
  async function load(){
    try{
      gridSk.classList.remove('hidden');
      const res = await fetch(API + '/api/v1/public/offers');
      const data = await parseJSON(res);
      if (Array.isArray(data)) ALL = data;
      else if (data && Array.isArray(data.items)) ALL = data.items;
      else if (data && Array.isArray(data.results)) ALL = data.results;
      else if (data && data.data && Array.isArray(data.data.offers)) ALL = data.data.offers;
      else ALL = [];
    }catch(_){
      ALL = [];
    }finally{
      gridSk.classList.add('hidden');
      applyFilterSort(); render(true);
    }
  }

  // refresh button
  $('#refresh')?.addEventListener('click', load);

  // auto refresh every 60s
  setInterval(()=>{ applyFilterSort(); render(true); }, 60000);

  // init
  applyTicket();
  load();
})();



// === Foody buyer storefront logic ===
const FOODY_API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app';

function shapeOffers(resp){
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp.results)) return resp.results;
  if (resp.data && Array.isArray(resp.data.offers)) return resp.data.offers;
  if (resp.offers && Array.isArray(resp.offers)) return resp.offers;
  return [];
}
function parseDateSafe(x){ try{ return x? new Date(x): null }catch(_){ return null } }

// Haversine
function distKm(a, b){
  if (!a || !b) return Infinity;
  const toRad = d=>d*Math.PI/180;
  const R = 6371;
  const dLat = toRad((b.lat-a.lat));
  const dLon = toRad((b.lng-a.lng));
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
let myPos = null;
async function locate(){
  return new Promise((resolve,reject)=>{
    if (!navigator.geolocation) return reject('no-geo');
    navigator.geolocation.getCurrentPosition(pos=>{
      myPos = {lat: pos.coords.latitude, lng: pos.coords.longitude};
      resolve(myPos);
    }, err=>reject(err), {enableHighAccuracy:true, maximumAge:15000, timeout:12000});
  });
}
function offerLatLng(o){
  if (o.lat && o.lng) return {lat:+o.lat, lng:+o.lng};
  if (o.location && o.location.lat && o.location.lng) return {lat:+o.location.lat, lng:+o.location.lng};
  if (o.restaurant && o.restaurant.lat && o.restaurant.lng) return {lat:+o.restaurant.lat, lng:+o.restaurant.lng};
  return null;
}




const Store = {
  page: 0,
  hasMore: true,
  loading: false,
  q: '',
  sort: 'exp', // exp | disc | near
  nearOnly: false,
  nearKm: 3,
  items: [],
};

async function fetchPage(){
  if (Store.loading || !Store.hasMore) return;
  Store.loading = true;
  try{
    const url = `${FOODY_API}/api/v1/public/offers?limit=24&offset=${Store.page*24}`;
    const resp = await fetch(url, {credentials:'include'});
    const data = await resp.json().catch(()=>({}));
    const arr = shapeOffers(data);
    if (arr.length < 24) Store.hasMore = false;
    Store.items = Store.items.concat(arr);
    Store.page += 1;
    renderGrid();
  }catch(e){ console.warn('offers load error', e); }
  finally{ Store.loading = false; }
}




function discountPct(o){
  const price = +((o.price_cents!=null)?(o.price_cents/100):(o.price||0));
  const old   = +((o.original_price_cents!=null)?(o.original_price_cents/100):(o.original_price||0));
  if (!old || !price) return 0;
  return Math.max(0, Math.round((1-price/old)*100));
}
function fmtPrice(o){
  const price = +((o.price_cents!=null)?(o.price_cents/100):(o.price||0));
  return price.toFixed(2);
}

function applyFilters(items){
  let arr = items.slice();
  // search
  if (Store.q) arr = arr.filter(x => (x.title||'').toLowerCase().includes(Store.q.toLowerCase()));
  // nearby
  if (Store.nearOnly && myPos){
    arr = arr.filter(o => {
      const ll = offerLatLng(o); if (!ll) return false;
      return distKm(myPos, ll) <= Store.nearKm;
    });
  }
  // sort
  if (Store.sort==='exp'){
    arr.sort((a,b)=>{
      const ad = parseDateSafe(a.expires_at)||new Date(8640000000000000);
      const bd = parseDateSafe(b.expires_at)||new Date(8640000000000000);
      return ad - bd;
    });
  } else if (Store.sort==='disc'){
    arr.sort((a,b)=>discountPct(b)-discountPct(a));
  } else if (Store.sort==='near' && myPos){
    arr.sort((a,b)=> (distKm(myPos, offerLatLng(a)) - distKm(myPos, offerLatLng(b))));
  }
  return arr;
}

function cardHTML(o){
  const img = o.image_url || o.image || '';
  const cat = (o.category||'').toString().trim();
  const disc = discountPct(o);
  return `<div class="offer-card" data-id="${o.id}">
    <div class="thumb">${img?`<img src="${img}" loading="lazy" alt="">`:'<div class="skeleton" style="width:100%;height:100%"></div>'}</div>
    <div class="body">
      <div>
        <div class="title">${o.title||'—'}</div>
        <div class="qty">Остаток: ${o.qty_left ?? o.qty ?? '—'}</div>
      </div>
      <div>
        <div class="price">${fmtPrice(o)}</div>
        <div class="badges">
          ${cat?`<span class="badge cat">${cat}</span>`:''}
          ${disc?`<span class="badge disc">-${disc}%</span>`:''}
        </div>
      </div>
    </div>
  </div>`;
}

function renderGrid(){
  const root = document.getElementById('storeGrid'); if (!root) return;
  const list = applyFilters(Store.items);
  if (!list.length){
    root.innerHTML = '<div class="muted" style="padding:20px">Пока нет офферов поблизости</div>';
    return;
  }
  root.innerHTML = list.map(cardHTML).join('');
}




function openDetails(id){
  try{
    const o = Store.items.find(x=>String(x.id)===String(id)); if (!o) return;
    const m = document.getElementById('offerDetailsModal'); if (!m) return;
    document.getElementById('detImg').src = o.image_url || o.image || '';
    document.getElementById('detTitle').textContent = o.title || '—';
    document.getElementById('detQty').textContent = 'Остаток: ' + (o.qty_left ?? o.qty ?? '—');
    document.getElementById('detPrice').textContent = fmtPrice(o);
    const until = parseDateSafe(o.expires_at); document.getElementById('detUntil').textContent = until ? ('До: '+ new Intl.DateTimeFormat('ru-RU', {dateStyle:'short', timeStyle:'short'}).format(until)) : '';
    document.getElementById('detDesc').textContent = o.description || '';
    const bd = document.getElementById('detBadges'); bd.innerHTML = ''; 
    const cat = (o.category||'').toString().trim(); const d = discountPct(o);
    if (cat){ const s = document.createElement('span'); s.className='badge cat'; s.textContent=cat; bd.appendChild(s); }
    if (d){ const s = document.createElement('span'); s.className='badge disc'; s.textContent = '-' + d + '%'; bd.appendChild(s); }
    m.classList.add('_open');
    // actions
    document.getElementById('detClose').onclick = ()=> m.classList.remove('_open');
    const toEdit = document.getElementById('detEdit'); if (toEdit) toEdit.onclick = ()=>{ m.classList.remove('_open'); /* open merchant edit if present by hash */ location.hash = '#offers?edit='+o.id; };
    const toDel = document.getElementById('detDelete'); if (toDel) toDel.onclick = async ()=>{
      try{
        const resp = await fetch(`${FOODY_API}/api/v1/merchant/offers/${o.id}`, {method:'DELETE', credentials:'include'});
        if (!resp.ok) throw new Error('delete failed');
        m.classList.remove('_open');
        Store.items = Store.items.filter(x=>String(x.id)!==String(o.id));
        renderGrid();
        alert('Удалено');
      }catch(e){ alert('Не удалось удалить: '+(e.message||e)); }
    };
  }catch(e){ console.warn(e); }
}

function bindGridClicks(){
  const root = document.getElementById('storeGrid'); if (!root) return;
  root.addEventListener('click', (ev)=>{
    const card = ev.target.closest('.offer-card'); if (!card) return;
    const id = card.getAttribute('data-id'); if (!id) return;
    openDetails(id);
  });
}

