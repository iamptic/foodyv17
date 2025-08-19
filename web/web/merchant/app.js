(() => {
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn, { passive:false }); };


// === Существующая инициализация (оставляем) ===
const state = {
api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
rid: localStorage.getItem('foody_restaurant_id') || '',
key: localStorage.getItem('foody_key') || '',
};


// --- KPI guest/authorized toggle (фикс дашборда) ---
function setDashAuthUI(authed){
const g = $('#dashGuest'); const k = $('#dashKpis');
if (g) g.style.display = authed ? 'none' : '';
if (k) k.style.display = authed ? '' : 'none';
}


function gate(){
const authed = !!(state.rid && state.key);
setDashAuthUI(authed);
const tabs = $('#tabs'); const bn = $('.bottom-nav');
if (!authed){
if (tabs) tabs.style.display = 'none'; if (bn) bn.style.display = 'none';
onAuthView();
return false;
}
if (tabs) tabs.style.display = ''; if (bn) bn.style.display = '';
activateTab('offers'); try{ refreshDashboard(); }catch(_){}
return true;
}


// --- Табы (оставляем), добавляем refreshDashboard на dashboard ---
on('#tabs','click',(e)=>{ const b=e.target.closest('.seg-btn'); if(!b) return; activateTab(b.dataset.tab); if(b.dataset.tab==='dashboard'){ try{ refreshDashboard(); }catch(_){} } });


function activateTab(tab){
$$('.seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
$$('.pane').forEach(p=>p.classList.toggle('active', p.id===tab));
if (tab==='offers') loadOffers();
if (tab==='profile') loadProfile?.();
}


// --- Upper offers only: render в #offersList + фильтр #offersFilter ---
function getFilter(){ try { return document.querySelector('#offersFilter .seg-btn.active')?.dataset.filter || 'active'; } catch(_) { return 'active'; } }
function isActive(of){
const ex = of.expires_at ? new Date(of.expires_at) : null;
const qty = Number(of.qty_left ?? of.quantity ?? of.qty_total ?? 0);
return qty>0 && (!ex || ex>new Date());
}
function renderOffersToCards(items){
const root = $('#offersList'); if (!root) return; root.innerHTML = '';
const f = getFilter();
const list = items.filter(o => f==='all' ? true : (f==='active'? isActive(o) : !isActive(o)));
if (!list.length){ root.innerHTML = '<div class="hint">Пока нет офферов</div>'; return; }
const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle:'short', timeStyle:'short' });
for (const o of list){
const row = document.createElement('div'); row.className='item';
const qty = Number(o.qty_left ?? o.quantity ?? o.qty_total ?? 0) || 0;
const price = Number(o.price ?? (o.price_cents? o.price_cents/100 : 0));
const old = Number(o.original_price ?? o.old_price ?? (o.original_price_cents? o.original_price_cents/100:0));
const exStr = o.expires_at ? fmt.format(new Date(o.expires_at)) : '—';
row.innerHTML = `
<div style="display:flex;gap:10px;align-items:center;">
<div class="badge">${qty} шт</div>
<div style="font-weight:700;">${escapeHtml(o.title||'—')}</div>
})();
