// web/web/merchant/js/offers_edit_delete.js
// Minimal, careful enhancements: center modal, open edit with auto-fill, save via PATCH, and no reloads.
// Assumes presence of #offerList, #offerEditModal, #offerEditForm and fields with ids used below.

(function () {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const FOODY_API = (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app';

  const state = {
    rid: localStorage.getItem('foody_restaurant_id') || localStorage.getItem('restaurant_id') || '',
    key: localStorage.getItem('foody_key') || localStorage.getItem('foody_api_key') || ''
  };

  const els = {
    list: $('#offerList'),
    modal: $('#offerEditModal'),
    form:  $('#offerEditForm'),
    btnCancel: $('#offerEditCancel'),
    fields: {
      id:    $('#editId'),
      title: $('#editTitle'),
      old:   $('#editOld'),
      price: $('#editPrice'),
      qty:   $('#editQty'),
      best:  $('#editBest'),
      exp:   $('#editExpires'),
      cat:   $('#editCategory'),
      desc:  $('#editDesc')
    }
  };

  function toast(msg){ try{ window.toast?.(msg); }catch(_) { try{ window.showToast?.(msg); }catch(_){ alert(msg); } } }

  // --- Modal helpers ---
  function showModal() {
    if (!els.modal) return;
    els.modal.classList.add('_open');
    // scroll lock
    document.documentElement.style.overflow = 'hidden';
  }
  function hideModal() {
    if (!els.modal) return;
    els.modal.classList.remove('_open');
    document.documentElement.style.overflow = '';
  }

  // --- Utilities ---
  function dtToLocalInput(iso){
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const p = (n)=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch(_) { return ''; }
  }
  function localToIso(str){
    if (!str) return null;
    const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) return null;
    const [_,Y,M,D,h,mn] = m.map(Number);
    const dt = new Date(Y, M-1, D, h, mn);
    return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().replace(/\.\d{3}Z$/,'Z');
  }

  async function api(path, opt={}){
    const url = `${FOODY_API}${path}`;
    const h = opt.headers ? {...opt.headers} : {};
    if (state.key) h['X-Foody-Key'] = state.key;
    if (opt.body && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const resp = await fetch(url, { ...opt, headers: h });
    if (resp.status === 204) return null;
    const ct = resp.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await resp.json().catch(()=>null) : await resp.text().catch(()=>'');
    if (!resp.ok) {
      const msg = (data && (data.detail || data.message)) || `${resp.status} ${resp.statusText}`;
      throw new Error(msg);
    }
    return data;
  }

  // Fetch offers and find by id (safe if no local cache)
  async function getOfferById(id){
    const list = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
    const arr = Array.isArray(list) ? list : (list?.items || list?.results || []);
    return arr.find(o => String(o.id) === String(id)) || { id };
  }

  function fillForm(o){
    els.fields.id && (els.fields.id.value = o.id ?? '');
    els.fields.title && (els.fields.title.value = o.title ?? '');
    els.fields.old && (els.fields.old.value = (o.original_price_cents!=null ? (o.original_price_cents/100) : (o.original_price ?? '')) || '');
    els.fields.price && (els.fields.price.value = (o.price_cents!=null ? (o.price_cents/100) : (o.price ?? '')) || '');
    els.fields.qty && (els.fields.qty.value = (o.qty_total ?? o.total_qty ?? ''));
    els.fields.exp && (els.fields.exp.value = o.expires_at ? dtToLocalInput(o.expires_at) : (o.expires ?? ''));
    els.fields.cat && (els.fields.cat.value = o.category || 'other');
    els.fields.desc && (els.fields.desc.value = o.description || '');
    // best_before (если присутствует в DOM и приходит от API)
    els.fields.best && (els.fields.best.value = o.best_before ? dtToLocalInput(o.best_before) : (o.best || ''));
  }

  async function openEdit(id){
    const data = await getOfferById(id);
    fillForm(data);
    showModal();
  }

  async function onSave(ev){
    ev.preventDefault();
    const id = els.fields.id?.value;
    if (!id) return;

    const payload = {
      title: (els.fields.title?.value || '').trim(),
      original_price: Number(els.fields.old?.value || 0) || undefined,
      price: Number(els.fields.price?.value || 0) || undefined,
      qty_total: Number(els.fields.qty?.value || 0) || undefined,
      expires_at: localToIso(els.fields.exp?.value || '') || undefined,
      category: els.fields.cat?.value || undefined,
      description: (els.fields.desc?.value || '').trim() || undefined,
      best_before: localToIso(els.fields.best?.value || '') || undefined
    };

    // remove undefineds
    Object.keys(payload).forEach(k => { if (payload[k] === undefined || payload[k] === null || payload[k] === '') delete payload[k]; });

    try {
      const updated = await api(`/api/v1/merchant/offers/${id}`, { method:'PATCH', body: JSON.stringify(payload) });
      // Patch row in DOM (no full reload)
      const row = els.list?.querySelector(`.row[data-offer-id="${id}"]`);
      if (row && updated) {
        const price = (updated.price_cents!=null) ? (updated.price_cents/100) : (updated.price ?? 0);
        const old   = (updated.original_price_cents!=null) ? (updated.original_price_cents/100) : (updated.original_price ?? 0);
        const disc  = old>0 ? Math.round((1 - price/old)*100) : 0;
        const fmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
        row.children[0].textContent = updated.title || '';
        row.children[1].textContent = Number(price).toFixed(2);
        row.children[2].textContent = disc ? `-${disc}%` : '—';
        row.children[3].textContent = `${updated.qty_left ?? '—'} / ${updated.qty_total ?? '—'}`;
        row.children[4].textContent = updated.expires_at ? fmt.format(new Date(updated.expires_at)) : '—';
      }
      hideModal();
      toast('Сохранено');
    } catch (e) {
      toast('Не удалось сохранить: ' + (e.message || e));
    }
  }

  function onCancel(ev){ ev?.preventDefault?.(); hideModal(); }

  function onBackdropClick(ev){
    if (!els.modal) return;
    if (ev.target && ev.target.classList && ev.target.classList.contains('modal-dim')) hideModal();
  }

  // Delegation: edit buttons
  function bindEdit(){
    if (!els.list || els.list._editBound) return;
    els.list._editBound = true;
    els.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="edit-offer"], .btn-edit-offer');
      if (!btn) return;
      const row = btn.closest('[data-offer-id], .row');
      const id = btn.dataset.id || row?.getAttribute('data-offer-id');
      if (!id) return;
      e.preventDefault();
      openEdit(id);
    });
  }

  function init(){
    bindEdit();
    els.form && els.form.addEventListener('submit', onSave);
    els.btnCancel && els.btnCancel.addEventListener('click', onCancel);
    els.modal && els.modal.addEventListener('click', onBackdropClick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
