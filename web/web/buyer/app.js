
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
