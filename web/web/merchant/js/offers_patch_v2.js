(function(){
  const FOODY_API = window.FOODY_API || 'https://foodyback-production.up.railway.app';
  const ENDPOINTS = {
    list: `${FOODY_API}/api/v1/merchant/offers`,
    patch: (id) => `${FOODY_API}/api/v1/merchant/offers/${id}`,
    del:   (id) => `${FOODY_API}/api/v1/merchant/offers/${id}`
  };

  const state = { items: [], hasMore:false, page:1, pageSize:20, loading:false, loadToken:0 };

  const D = {
    grid: document.getElementById('offersGrid') || document.querySelector('.offers-grid') || document.querySelector('#my-offers .grid'),
    table: document.getElementById('offersTable') || null,
    empty: document.getElementById('offersEmpty') || null,
    loadMore: document.getElementById('offersLoadMore') || null,
    editModal: document.getElementById('offerEditModal'),
    editForm: document.getElementById('offerEditForm'),
    editSave: document.getElementById('offerEditSaveBtn'),
    filters: document.getElementById('offersFilters'),
    search: document.getElementById('offersSearch'),
    sort: document.getElementById('offersSort'),
  };

  if(!D.editModal){
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="modal" id="offerEditModal" hidden><div class="modal__backdrop" data-close></div><div class="modal__dialog"><header class="modal__header"><h3>Редактировать оффер</h3><button class="icon-btn" data-close aria-label="Закрыть">&times;</button></header><form id="offerEditForm" class="modal__body"><input type="hidden" name="id" /><label>Название<input name="title" required placeholder="Название оффера" /></label><label>Описание<textarea name="description" rows="3" placeholder="Короткое описание"></textarea></label><div class="row"><label>Цена<input type="number" name="price" min="0" step="1" required /></label><label>Остаток<input type="number" name="left_qty" min="0" step="1" required /></label></div><div class="row"><label>Срок действия<input name="expires_at" type="datetime-local" required /></label><label>Скидка (пресет)<select name="discount_percent"><option value="">—</option><option value="30">–30% (к закрытию)</option><option value="40">–40%</option><option value="50">–50%</option><option value="60">–60%</option><option value="70">–70%</option><option value="80">–80%</option><option value="90">–90%</option></select></label></div><div class="row"><label class="switch"><input type="checkbox" name="is_active" /><span>Активен</span></label><label>Фото (опционально)<input type="file" accept="image/*" name="photo" /></label></div><footer class="modal__footer"><button type="button" class="btn ghost" data-close>Отмена</button><button type="submit" class="btn primary" id="offerEditSaveBtn">Сохранить</button></footer></form></div></div>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  D.editModal = document.getElementById('offerEditModal');
  D.editForm = document.getElementById('offerEditForm');
  D.editSave = document.getElementById('offerEditSaveBtn');

  function token(){ return localStorage.getItem('authToken') || ''; }
  function auth(){ return { 'Authorization': `Bearer ${token()}` }; }
  function money(n){ return new Intl.NumberFormat('ru-RU').format(n||0) + ' ₽' }
  function leftTime(ts){ const end = new Date(ts).getTime(), diff=end - Date.now(); if(diff<=0) return 'истёк'; const m=Math.floor(diff/60000), h=Math.floor(m/60); return h>0?`${h} ч ${m%60} мин`:`${m} мин`; }
  function status(o){ if(o.is_active===false) return 'Скрыт'; if(new Date(o.expires_at).getTime()<=Date.now()) return 'Истёк'; return 'Активен'; }
  function esc(s){ return (s||'').replace(/[&<>\"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;' }[m])) }

  async function load({reset=true}={}){
    if(state.loading) return;
    state.loading = true; const my = ++state.loadToken;
    try{
      const params = new URLSearchParams({ page: state.page, page_size: state.pageSize });
      const res = await fetch(`${ENDPOINTS.list}?${params}`, { headers:{ ...auth() }});
      if(my !== state.loadToken) return;
      if(!res.ok) throw new Error('load_fail');
      const data = await res.json();
      const items = Array.isArray(data.items)?data.items:(Array.isArray(data)?data:[]);
      state.items = reset ? items : state.items.concat(items);
      state.hasMore = data.has_more === true || !!data.next_page;
      render();
    }catch(e){ console.error(e); toast('Не удалось загрузить офферы'); }
    finally{ state.loading=false; }
  }

  function render(){
    if (D.grid){
      if (!state.items.length){
        D.grid.innerHTML = '';
        const empty = document.getElementById('offersEmpty'); if (empty) empty.classList.remove('is-hidden');
      } else {
        const empty = document.getElementById('offersEmpty'); if (empty) empty.classList.add('is-hidden');
        D.grid.innerHTML = state.items.map(cardHTML).join('');
      }
      wire(D.grid);
    } else if (D.table){
      const tbody = D.table.tBodies[0] || D.table.createTBody();
      tbody.innerHTML = state.items.map(rowHTML).join('');
      wire(tbody);
    }
    if (D.loadMore) D.loadMore.hidden = !state.hasMore;
  }

  function cardHTML(o){
    const st = status(o);
    const img = o.photo_url || o.image_url || '';
    const discount = o.discount_percent ? `–${o.discount_percent}%` : '';
    return `<article class="card" data-id="${o.id}">
      <div class="media">${img?`<img src="${img}" alt="">`:''}</div>
      <div class="body">
        <div class="meta"><span class="status">${st}</span><span class="time">${leftTime(o.expires_at)}</span></div>
        <h4>${esc(o.title)}</h4>
        <div class="meta"><span class="price">${money(o.price)}</span><span class="disc">${discount}</span></div>
        <div class="meta"><span>Остаток: ${o.left_qty ?? 0}</span></div>
        <div class="offers-actions">
          <button class="btn ghost js-edit">Редактировать</button>
          <button class="btn js-toggle">${o.is_active===false?'Показать':'Скрыть'}</button>
          <button class="btn danger js-del">Удалить</button>
        </div>
      </div>
    </article>`;
  }
  function rowHTML(o){
    const st = status(o);
    return `<tr data-id="${o.id}">
      <td>${esc(o.title)}</td>
      <td>${money(o.price)}</td>
      <td>${o.left_qty ?? 0}</td>
      <td>${st}</td>
      <td class="offers-actions">
        <button class="btn ghost js-edit">Редактировать</button>
        <button class="btn js-toggle">${o.is_active===false?'Показать':'Скрыть'}</button>
        <button class="btn danger js-del">Удалить</button>
      </td>
    </tr>`;
  }

  function wire(root){
    root.querySelectorAll('.js-edit').forEach(b=>b.onclick=onEdit);
    root.querySelectorAll('.js-del').forEach(b=>b.onclick=onAskDelete);
    root.querySelectorAll('.js-toggle').forEach(b=>b.onclick=onToggle);
    if (D.filters){
      D.filters.addEventListener('click',(e)=>{
        const btn=e.target.closest('[data-filter]'); if(!btn) return;
        D.filters.querySelectorAll('.chip').forEach(c=>c.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.page=1; load({reset:true});
      });
    }
    if (D.search){
      let t; D.search.oninput=()=>{ clearTimeout(t); t=setTimeout(()=>{ state.page=1; load({reset:true}); },250); };
    }
    if (D.sort){
      D.sort.onchange=()=>{ state.page=1; load({reset:true}); };
    }
    if (D.loadMore){
      D.loadMore.onclick=()=>{ if(!state.loading){ state.page++; load({reset:false}); } };
    }
  }

  function onEdit(e){
    const id = getId(e.target);
    const o = state.items.find(x=>String(x.id)===String(id));
    if(!o) return;
    fill(o); openModal();
  }
  function fill(o){
    D.editForm.id.value = o.id;
    D.editForm.title.value = o.title || '';
    D.editForm.description.value = o.description || '';
    D.editForm.price.value = o.price ?? 0;
    D.editForm.left_qty.value = o.left_qty ?? 0;
    D.editForm.expires_at.value = toLocal(o.expires_at);
    if (D.editForm.discount_percent) D.editForm.discount_percent.value = o.discount_percent ?? '';
    if (D.editForm.is_active) D.editForm.is_active.checked = o.is_active !== false;
    if (D.editForm.photo) D.editForm.photo.value = '';
  }
  function toLocal(ts){ if(!ts) return ''; const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

  D.editForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); D.editSave.disabled=true; D.editSave.textContent='Сохранение…';
    const id = D.editForm.id.value; const hasPhoto = D.editForm.photo && D.editForm.photo.files && D.editForm.photo.files[0];
    try{
      let res;
      if (hasPhoto){
        const fd=new FormData();
        fd.append('title', D.editForm.title.value.trim());
        fd.append('description', D.editForm.description.value.trim());
        fd.append('price', Number(D.editForm.price.value));
        fd.append('left_qty', Number(D.editForm.left_qty.value));
        fd.append('expires_at', new Date(D.editForm.expires_at.value).toISOString());
        if (D.editForm.discount_percent && D.editForm.discount_percent.value) fd.append('discount_percent', Number(D.editForm.discount_percent.value));
        if (D.editForm.is_active) fd.append('is_active', D.editForm.is_active.checked ? 'true' : 'false');
        fd.append('photo', D.editForm.photo.files[0]);
        res = await fetch(ENDPOINTS.patch(id), { method:'PATCH', headers:{ ...auth() }, body: fd });
      } else {
        const payload={
          title:D.editForm.title.value.trim(),
          description:D.editForm.description.value.trim(),
          price:Number(D.editForm.price.value),
          left_qty:Number(D.editForm.left_qty.value),
          expires_at:new Date(D.editForm.expires_at.value).toISOString()
        };
        if (D.editForm.discount_percent && D.editForm.discount_percent.value) payload.discount_percent = Number(D.editForm.discount_percent.value);
        if (D.editForm.is_active) payload.is_active = !!D.editForm.is_active.checked;
        res = await fetch(ENDPOINTS.patch(id), { method:'PATCH', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(payload) });
      }
      if(!res.ok) throw new Error('save_fail');
      const updated = await res.json().catch(()=> ({}));
      const i = state.items.findIndex(x=>String(x.id)===String(id));
      if (i>-1){
        state.items[i] = { ...state.items[i], ...updated,
          title: D.editForm.title.value.trim(),
          description: D.editForm.description.value.trim(),
          price: Number(D.editForm.price.value),
          left_qty: Number(D.editForm.left_qty.value),
          expires_at: new Date(D.editForm.expires_at.value).toISOString(),
          discount_percent: D.editForm.discount_percent && D.editForm.discount_percent.value ? Number(D.editForm.discount_percent.value) : state.items[i].discount_percent,
          is_active: D.editForm.is_active ? !!D.editForm.is_active.checked : state.items[i].is_active
        };
      }
      render(); closeModal(); toast('Изменения сохранены');
    }catch(err){ console.error(err); toast('Не удалось сохранить оффер'); }
    finally{ D.editSave.disabled=false; D.editSave.textContent='Сохранить'; }
  });

  async function onToggle(e){
    const id=getId(e.target); const item=state.items.find(x=>String(x.id)===String(id)); if(!item) return;
    const next = item.is_active===false ? true : false; const btn=e.target; btn.disabled=true;
    try{
      const res = await fetch(ENDPOINTS.patch(id), { method:'PATCH', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify({ is_active: next }) });
      if(!res.ok) throw new Error('toggle_fail'); item.is_active=next; render();
    }catch(err){ console.error(err); toast('Не удалось изменить статус'); }
    finally{ btn.disabled=false; }
  }

  function onAskDelete(e){
    const id=getId(e.target); if(!confirm('Удалить оффер? Действие необратимо.')) return; doDelete(id);
  }
  async function doDelete(id){
    try{
      const res = await fetch(ENDPOINTS.del(id), { method:'DELETE', headers:{ ...auth() } });
      if(!res.ok && res.status!==404) throw new Error('delete_fail');
      state.items = state.items.filter(x=>String(x.id)!==String(id)); render(); toast('Оффер удалён');
    }catch(err){ console.error(err); toast('Не удалось удалить оффер'); }
  }

  function getId(el){ const host = el.closest('[data-id]') || el.closest('tr'); return host ? host.getAttribute('data-id') : null; }

  function openModal(){ if(!D.editModal) return; D.editModal.hidden=false; document.body.classList.add('_scroll-lock'); }
  function closeModal(){ if(!D.editModal) return; D.editModal.hidden=true; document.body.classList.remove('_scroll-lock'); }
  document.addEventListener('click',(e)=>{ if(e.target.closest('[data-close]')) closeModal(); });

  function toast(msg){ const n=document.createElement('div'); n.textContent=msg; n.style.cssText='position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:2000'; document.body.appendChild(n); setTimeout(()=>n.remove(),2400); }

  load({reset:true});
  setInterval(()=>{ if(!state.loading){ state.page=1; load({reset:true}); } }, 60000);
})();