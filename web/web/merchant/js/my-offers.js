(function(){
  const FOODY_API = window.FOODY_API || 'https://foodyback-production.up.railway.app';
  const ENDPOINTS = {
    list: `${FOODY_API}/api/v1/merchant/offers`,
    patch: (id) => `${FOODY_API}/api/v1/merchant/offers/${id}`,
    del:   (id) => `${FOODY_API}/api/v1/merchant/offers/${id}`
  };

  const state = {
    items: [], page: 1, pageSize: 12, hasMore: false,
    filter: 'all', sort: 'expires_at', q: '', deletingId: null, editing: null
  };

  const els = {
    grid: document.getElementById('offersGrid'),
    empty: document.getElementById('offersEmpty'),
    loadMoreWrap: document.getElementById('offersLoadMoreWrap'),
    loadMore: document.getElementById('offersLoadMore'),
    filters: document.getElementById('offersFilters'),
    search: document.getElementById('offersSearch'),
    sort: document.getElementById('offersSort'),
    editModal: document.getElementById('editOfferModal'),
    editForm: document.getElementById('editOfferForm'),
    editSave: document.getElementById('editOfferSaveBtn'),
    delModal: document.getElementById('deleteOfferModal'),
    delConfirm: document.getElementById('confirmDeleteBtn'),
  };

  function token(){ return localStorage.getItem('authToken') || ''; }
  function auth(){ return { 'Authorization': `Bearer ${token()}` }; }
  function fmtMoney(n){ return new Intl.NumberFormat('ru-RU').format(n||0) + ' ₽' }
  function leftTime(ts){
    const end = new Date(ts).getTime(), diff = end - Date.now();
    if (diff <= 0) return 'истёк';
    const m = Math.floor(diff/60000), h = Math.floor(m/60);
    return h>0 ? `${h} ч ${m%60} мин` : `${m} мин`;
  }
  function status(o){
    if (o.is_active === false) return 'Скрыт';
    if (new Date(o.expires_at).getTime() <= Date.now()) return 'Истёк';
    return 'Активен';
  }

  async function load(reset=false){
    if (reset){ state.page=1; state.items=[]; }
    showSkeletons();
    try{
      const params = new URLSearchParams({
        page: state.page, page_size: state.pageSize,
        q: state.q, filter: state.filter, sort: state.sort
      });
      const res = await fetch(`${ENDPOINTS.list}?`+params.toString(), { headers: { ...auth() } });
      if(!res.ok) throw new Error('Не удалось получить офферы');
      const data = await res.json();
      state.items = reset ? data.items : state.items.concat(data.items);
      state.hasMore = !!data.has_more;
      render();
    }catch(e){
      toast('Ошибка загрузки офферов');
      console.error(e);
      hideSkeletons();
    }
  }

  function showSkeletons(){
    els.grid.innerHTML = `
      <div class="card skeleton"></div>
      <div class="card skeleton"></div>
      <div class="card skeleton"></div>`;
    els.empty.classList.add('is-hidden');
  }
  function hideSkeletons(){}

  function render(){
    if (!state.items.length){
      els.grid.innerHTML = '';
      els.empty.classList.remove('is-hidden');
      els.loadMoreWrap.hidden = true;
      return;
    }
    els.empty.classList.add('is-hidden');
    els.grid.innerHTML = state.items.map(cardHTML).join('');
    els.loadMoreWrap.hidden = !state.hasMore;
    wireCardActions();
  }

  function cardHTML(o){
    const st = status(o);
    const img = o.photo_url || o.image_url || '';
    const discount = o.discount_percent ? `–${o.discount_percent}%` : '';
    return `
    <article class="card" data-id="${o.id}">
      <div class="media">${img ? `<img src="${img}" alt="">` : ''}</div>
      <div class="body">
        <div class="meta">
          <span class="status">${st}</span>
          <span class="time">${leftTime(o.expires_at)}</span>
        </div>
        <h4>${escapeHTML(o.title || '')}</h4>
        <div class="meta">
          <span class="price">${fmtMoney(o.price)}</span>
          <span class="disc">${discount}</span>
        </div>
        <div class="meta">
          <span>Остаток: ${o.left_qty ?? 0}</span>
        </div>
        <div class="actions">
          <button class="btn ghost js-edit">Редактировать</button>
          <button class="btn js-toggle">${o.is_active===false?'Показать':'Скрыть'}</button>
          <button class="btn danger js-del">Удалить</button>
        </div>
      </div>
    </article>`;
  }

  function wireCardActions(){
    els.grid.querySelectorAll('.js-edit').forEach(b => b.onclick = onEdit);
    els.grid.querySelectorAll('.js-del').forEach(b => b.onclick = onAskDelete);
    els.grid.querySelectorAll('.js-toggle').forEach(b => b.onclick = onToggleActive);
  }

  // Search/filters/sort
  els.search && (els.search.oninput = debounce(() => { state.q = els.search.value.trim(); load(true); }, 250));
  els.sort && (els.sort.onchange = () => { state.sort = els.sort.value; load(true); });
  els.filters && els.filters.addEventListener('click',(e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    els.filters.querySelectorAll('.chip').forEach(c=>c.classList.remove('is-active'));
    b.classList.add('is-active');
    state.filter = b.dataset.filter || 'all';
    load(true);
  });
  els.loadMore && (els.loadMore.onclick = () => { state.page++; load(false); });

  // Edit
  function onEdit(e){
    const id = e.target.closest('.card').dataset.id;
    const o = state.items.find(x=> String(x.id)===String(id));
    if(!o) return;
    state.editing = o;
    fillEditForm(o);
    openModal(els.editModal);
  }
  function fillEditForm(o){
    const f = els.editForm;
    f.id.value = o.id;
    f.title.value = o.title || '';
    f.description.value = o.description || '';
    f.price.value = o.price || 0;
    f.left_qty.value = o.left_qty ?? 0;
    f.expires_at.value = toLocalInput(o.expires_at);
  }
  function toLocalInput(ts){
    const d = new Date(ts);
    const pad=(n)=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  els.editForm && els.editForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = els.editSave; btn.disabled = true; btn.textContent = 'Сохранение…';
    const id = els.editForm.id.value;
    const payload = {
      title: els.editForm.title.value.trim(),
      description: els.editForm.description.value.trim(),
      price: Number(els.editForm.price.value),
      left_qty: Number(els.editForm.left_qty.value),
      expires_at: new Date(els.editForm.expires_at.value).toISOString()
    };
    try{
      const res = await fetch(ENDPOINTS.patch(id), {
        method:'PATCH',
        headers: { 'Content-Type':'application/json', ...auth() },
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('Ошибка сохранения');
      const updated = await res.json();
      const idx = state.items.findIndex(x=> String(x.id)===String(id));
      if (idx>-1){ state.items[idx] = {...state.items[idx], ...updated}; }
      render();
      closeModal(els.editModal);
      toast('Изменения сохранены');
    }catch(err){
      console.error(err);
      toast('Не удалось сохранить оффер');
    }finally{
      btn.disabled = false; btn.textContent = 'Сохранить';
    }
  });

  // Toggle active
  async function onToggleActive(e){
    const id = e.target.closest('.card').dataset.id;
    const o = state.items.find(x=> String(x.id)===String(id));
    if(!o) return;
    const next = !(o.is_active!==false ? true : false);
    e.target.disabled = true;
    try{
      const res = await fetch(ENDPOINTS.patch(id), {
        method:'PATCH', headers:{'Content-Type':'application/json', ...auth()},
        body: JSON.stringify({ is_active: next })
      });
      if(!res.ok) throw new Error();
      o.is_active = next;
      render();
    }catch{
      toast('Не удалось изменить статус');
    }
  }

  // Delete
  function onAskDelete(e){
    const id = e.target.closest('.card').dataset.id;
    state.deletingId = id;
    openModal(els.delModal);
  }
  els.delConfirm && (els.delConfirm.onclick = async ()=>{
    if(!state.deletingId) return;
    const id = state.deletingId;
    els.delConfirm.disabled = true; els.delConfirm.textContent = 'Удаление…';
    try{
      const res = await fetch(ENDPOINTS.del(id), { method:'DELETE', headers: { ...auth() } });
      if (res.status === 404){
        toast('Оффер уже удалён');
      } else if(!res.ok){ throw new Error('delete_fail'); }
      state.items = state.items.filter(x=> String(x.id)!==String(id));
      render();
      closeModal(els.delModal);
      toast('Оффер удалён');
    }catch(err){
      console.error(err);
      toast('Не удалось удалить оффер');
    }finally{
      els.delConfirm.disabled = false; els.delConfirm.textContent = 'Удалить';
      state.deletingId = null;
    }
  });

  // Utils
  function openModal(m){ m && (m.hidden=false); }
  function closeModal(m){ m && (m.hidden=true); }
  document.querySelectorAll('[data-close]').forEach(el=> el.addEventListener('click', e=>{
    const modal = e.target.closest('.modal'); if(modal) closeModal(modal);
  }));
  function debounce(fn,ms){ let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms)}}
  function escapeHTML(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]))}
  function toast(msg){
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:2000';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2500);
  }

  // Start
  load(true);
})();
