// app.js
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn, { passive: false }); };

  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app',
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  const toastBox = $('#toast');
  const showToast = (msg) => {
    if (!toastBox) return alert(msg);
    try {
      const now = Date.now();
      if (!window.__toast) window.__toast = { last:'', ts:0 };
      if (msg && window.__toast.last === String(msg) && (now - window.__toast.ts) < 1200) return;
      window.__toast.last = String(msg); window.__toast.ts = now;
    } catch(_) {}
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    toastBox.appendChild(el); setTimeout(() => el.remove(), 4200);
  };
  window.showToast = showToast; // expose for de-dup patch below

  function toggleLogout(visible){ const b = $('#logoutBtn'); if (b) b.style.display = visible ? '' : 'none'; }
  function updateCreds(){ const el = $('#creds'); if (el) el.textContent = JSON.stringify({ restaurant_id: state.rid, api_key: state.key }, null, 2); }
  const getDigits = v => (v||'').toString().replace(/\D+/g,'');

  function activateTab(tab) {
    try {
      $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      $$('.pane').forEach(p => p.classList.toggle('active', p.id === tab));
      if (tab === 'offers') loadOffers();
      if (tab === 'profile') loadProfile();
      if (tab === 'export') updateCreds();
      if (tab === 'create') initCreateTab();
    } catch (e) { console.warn('activateTab failed', e); }
  }
  on('#tabs','click', (e) => { const btn = e.target.closest('.seg-btn'); if (btn?.dataset.tab) activateTab(btn.dataset.tab); });
  on('.bottom-nav','click', (e) => { const btn = e.target.closest('.nav-btn'); if (btn?.dataset.tab) activateTab(btn.dataset.tab); });

  function gate(){
    const authed = !!(state.rid && state.key);
    if (!authed) {
      activateTab('auth');
      $('#tabs')?.style && ($('#tabs').style.display = 'none');
      $('.bottom-nav')?.style && ($('.bottom-nav').style.display = 'none');
      toggleLogout(false);
      return false;
    }
    $('#tabs')?.style && ($('#tabs').style.display = '');
    $('.bottom-nav')?.style && ($('.bottom-nav').style.display = '');
    activateTab('offers'); try{ refreshDashboard(); }catch(_){ }
    toggleLogout(true);
    return true;
  }

  on('#logoutBtn','click', () => {
    try { localStorage.removeItem('foody_restaurant_id'); localStorage.removeItem('foody_key'); } catch(_) {}
    state.rid = ''; state.key = ''; showToast('Вы вышли');
    toggleLogout(false); activateTab('auth');
    $('#tabs').style.display = 'none'; $('.bottom-nav').style.display = 'none';
  });

  function dtLocalToIso(v){
    if (!v) return null;
    try {
      const [d, t] = v.split(' ');
      const [Y,M,D] = d.split('-').map(x=>parseInt(x,10));
      const [h,m] = (t||'00:00').split(':').map(x=>parseInt(x,10));
      const dt = new Date(Y, (M-1), D, h, m);
      return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16)+':00Z';
    } catch(e){ return null; }
  }

  async function api(path, { method='GET', headers={}, body=null, raw=false } = {}) {
    const url = `${state.api}${path}`;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (state.key) h['X-Foody-Key'] = state.key;
    try {
      const res = await fetch(url, { method, headers: h, body });
      if (!res.ok) {
        const ct = res.headers.get('content-type')||'';
        let msg = `${res.status} ${res.statusText}`;
        if (ct.includes('application/json')) {
          const j = await res.json().catch(()=>null);
          if (j && (j.detail || j.message)) msg = j.detail || j.message || msg;
        } else {
          const t = await res.text().catch(()=>'');
          if (t) msg += ` — ${t.slice(0,180)}`;
        }
        throw new Error(msg);
      }
      if (res.status === 204) return null; // 204 No Content — ничего не парсим
      if (raw) return res;
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    } catch (err) {
      if (String(err.message).includes('Failed to fetch')) throw new Error('Не удалось связаться с сервером. Проверьте соединение или CORS.');
      throw err;
    }
  }

  // ====== AUTH/PROFILE (укорочено, без изменения логики) ======
  // ... (все ваши текущие обработчики авторизации/профиля остаются как в рабочей версии) ...

  // ====== OFFERS ======
  async function loadOffers() {
    if (!state.rid || !state.key) return;
    const root = $('#offerList'); if (root) root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const data = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
      const list = Array.isArray(data) ? data : (data?.items || data?.results || []);
      renderOffers(list);
      // кеш для автозаполнения модалки
      window.__FOODY_STATE__ = window.__FOODY_STATE__ || {};
      window.__FOODY_STATE__.offers = list;
    } catch (err) {
      console.error(err);
      if (root) root.innerHTML = '<div class="hint">Не удалось загрузить</div>';
    }
  }

  function renderOffers(items){
    const root = $('#offerList'); if (!root) return;
    if (!Array.isArray(items) || items.length === 0) { root.innerHTML = '<div class="hint">Пока нет офферов</div>'; return; }
    const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    const rows = items.map(o => {
      const price = o.price_cents!=null ? o.price_cents/100 : (o.price!=null ? Number(o.price) : 0);
      const old   = o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price!=null ? Number(o.original_price) : 0);
      const disc = old>0 ? Math.round((1 - price/old)*100) : 0;
      const exp = o.expires_at ? fmt.format(new Date(o.expires_at)) : '—';
      return `<div class="row" data-offer-id="${o.id}">
        <div>${o.title || '—'}</div>
        <div>${price.toFixed(2)}</div>
        <div>${disc?`-${disc}%`:'—'}</div>
        <div>${o.qty_left ?? '—'} / ${o.qty_total ?? '—'}</div>
        <div>${exp}</div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="edit-offer">Редактировать</button>
          <button class="btn btn-danger" data-action="delete">Удалить</button>
        </div>
      </div>`;
    }).join('');
    root.innerHTML = `<div class="row head"><div>Название</div><div>Цена</div><div>Скидка</div><div>Остаток</div><div>До</div><div></div></div>` + rows;

    // Делегируем «Редактировать»
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="edit-offer"]'); if (!btn) return;
      const row = btn.closest('.row'); const id = row && row.getAttribute('data-offer-id'); if (!id) return;
      const list = (window.__FOODY_STATE__ && window.__FOODY_STATE__.offers) || [];
      const item = list.find(x => String(x.id) === String(id)) || { id };
      openOfferEditModal(item);
    });

    // Делегируем «Удалить»
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="delete"]'); if (!btn) return;
      const row = btn.closest('.row'); const id = row && row.getAttribute('data-offer-id'); if (!id) return;
      if (!confirm('Удалить оффер?')) return;
      try {
        await api(`/api/v1/merchant/offers/${id}`, { method: 'DELETE' });
        row.remove();
        try { refreshDashboard && refreshDashboard(); } catch(_){}
        showToast('Оффер удалён');
      } catch (err) {
        showToast('Не удалось удалить: ' + (err.message || err));
      }
    });
  }

  // ====== Модалка редактирования ======
  function openOfferEditModal(o){
    const m = $('#offerEditModal'); if (!m) return;
    const add = (id, v) => { const el = $(id); if (el != null) el.value = v ?? ''; };

    add('#editId', o.id || '');
    add('#editTitle', o.title || '');
    add('#editOld', (o.original_price_cents!=null ? (o.original_price_cents/100) : (o.original_price || '')) || '');
    add('#editPrice', (o.price_cents!=null ? (o.price_cents/100) : (o.price || '')) || '');
    add('#editQty', (o.qty_total!=null ? o.qty_total : (o.total_qty!=null ? o.total_qty : '')) || '');
    add('#editCategory', o.category || 'other');
    add('#editDesc', o.description || '');

    const formatLocal = (iso) => {
      try{ const d=new Date(iso); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }catch(_){ return ''; }
    };
    add('#editExpires', o.expires_at ? formatLocal(o.expires_at) : (o.expires || ''));

    // flatpickr на полях модалки
    try {
      if (window.flatpickr && window.flatpickr.l10ns?.ru) flatpickr.localize(flatpickr.l10ns.ru);
      if (window.flatpickr && !$('#editExpires')._fp) {
        $('#editExpires')._fp = flatpickr('#editExpires', { enableTime:true, time_24hr:true, minuteIncrement:5, dateFormat:'Y-m-d H:i' });
      }
      if (window.flatpickr && !$('#editBest')._fp) {
        $('#editBest')._fp = flatpickr('#editBest', { enableTime:true, time_24hr:true, minuteIncrement:5, dateFormat:'Y-m-d H:i' });
      }
    } catch(_) {}

    // центрируем через класс _open (соответствует CSS в index.html)
    m.classList.add('_open');
  }

  on('#offerEditCancel','click',(e)=>{ e.preventDefault(); closeOfferEditModal(); });
  function closeOfferEditModal(){ const m=$('#offerEditModal'); if (m){ m.classList.remove('_open'); } }

  // отправка PATCH из модалки
  on('#offerEditForm','submit', async (ev)=>{
    ev.preventDefault();
    const toIsoLocal = (str)=>{
      if(!str) return null; const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/); if(!m) return null;
      const [_,Y,M,D,h,mn] = m.map(Number); const dt = new Date(Y,M-1,D,h,mn); return new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    };
    const id = $('#editId').value;
    const payload = {
      title: ($('#editTitle').value||'').trim(),
      original_price: Number($('#editOld').value||0) || null,
      price: Number($('#editPrice').value||0) || null,
      qty_total: Number($('#editQty').value||0) || null,
      expires_at: toIsoLocal($('#editExpires').value||''),
      category: $('#editCategory').value || 'other',
      description: ($('#editDesc').value||'').trim()
    };
    try{
      await api(`/api/v1/merchant/offers/${id}`, { method:'PATCH', body: JSON.stringify(payload) });
      closeOfferEditModal();
      showToast('Сохранено');
      await loadOffers();
      try { refreshDashboard && refreshDashboard(); } catch(_){}
    }catch(err){ showToast('Не удалось сохранить: '+(err.message||err)); }
  });

  // ====== CREATE: даты и пресеты ======
  function initCreateTab(){
    try {
      if (window.flatpickr && window.flatpickr.l10ns?.ru) flatpickr.localize(flatpickr.l10ns.ru);
      if ($('#expires_at') && !$('#expires_at')._fp) {
        $('#expires_at')._fp = flatpickr('#expires_at', {
          enableTime:true, time_24hr:true, minuteIncrement:5,
          dateFormat:'Y-m-d H:i', altInput:true, altFormat:'d.m.Y H:i',
          defaultDate: new Date(Date.now()+60*60*1000), minDate:'today'
        });
      }
      if ($('#best_before') && !$('#best_before')._fp) {
        $('#best_before')._fp = flatpickr('#best_before', {
          enableTime:true, time_24hr:true, minuteIncrement:5,
          dateFormat:'Y-m-d H:i', altInput:true, altFormat:'d.m.Y H:i',
          minDate:'today'
        });
      }
    } catch(_) {}
  }

  // ====== Старт ======
  document.addEventListener('DOMContentLoaded', () => {
    // защита от дубля тостов
    try {
      if (!window.__toastDedup && typeof window.showToast === 'function') {
        const __orig = window.showToast;
        window.showToast = function(msg, ...rest) {
          const now = Date.now();
          if (msg && (String(msg).includes('Вы вышли') || String(msg).includes('Вход выполнен'))) {
            if (window.__toastLast === msg && (now - (window.__toastLastTs || 0)) < 1000) return;
            window.__toastLast = msg; window.__toastLastTs = now;
          }
          return __orig(msg, ...rest);
        };
        window.__toastDedup = true;
      }
    } catch(_) {}

    const ok = gate();
    try { if (ok) refreshDashboard(); } catch(_){}
    if (!ok) activateTab('auth');
  });
})();
