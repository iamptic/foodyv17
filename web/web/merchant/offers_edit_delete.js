
/*! Foody Offers v17 — stable list + Edit/Delete (PATCH/DELETE) without flicker */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  const qs = (s,r=document)=>r.querySelector(s);
  const qsa = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const apiBase = ()=> (window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || '';
  const rid = ()=> { try{ return localStorage.getItem('foody_restaurant_id') || ''; }catch(_){ return ''; } };
  const key = ()=> { try{ return localStorage.getItem('foody_key') || ''; }catch(_){ return ''; } };
  const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const state = { items: [], abort: null, loading:false };

  function moneyRub(v){
    const n = Number(v||0);
    return fmt.format(Math.round(n)) + ' ₽';
  }
  function asNumberPrice(oField, fallback){
    const n = Number(oField);
    return Number.isFinite(n) ? n : (Number(fallback)||0);
  }
  function toLocalView(iso){
    if(!iso) return '';
    try{
      const d = new Date(iso);
      const pad = n=> String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }catch(_){ return ''; }
  }
  function toIsoFromLocal(str){
    if(!str) return null;
    // Expect "YYYY-MM-DD HH:MM"
    const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if(!m) return null;
    const [_,Y,M,D,h,mn] = m.map(Number);
    const dt = new Date(Y, M-1, D, h, mn);
    // Convert to UTC ISO, keep minutes, seconds = 00
    return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().replace(/\.\d{3}Z$/,'Z');
  }

  function skeleton(show=true){
    const root = qs('#offerList'); if(!root) return;
    if(show){
      root.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    }
  }

  async function fetchOffers(){
    const base = apiBase().replace(/\/+$/,'');
    const rID = rid(), k = key();
    if(!base || !rID || !k) return [];
    const url = `${base}/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(rID)}`;
    const ctl = new AbortController();
    if (state.abort) { try{ state.abort.abort(); }catch(_){ } }
    state.abort = ctl;
    const res = await fetch(url, { headers:{ 'X-Foody-Key': k }, signal: ctl.signal });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items || []);
  }

  function computeDiscount(price, original){
    const p = Number(price||0), o = Number(original||0);
    if (p>0 && o>0 && p<o) return Math.round((1 - p/o)*100);
    return 0;
  }

  function render(items){
    const root = qs('#offerList'); if(!root) return;
    if(!Array.isArray(items) || items.length===0){
      root.innerHTML = '<div class="hint">Пока нет офферов</div>';
      return;
    }
    // header
    let html = `<div class="row head">
      <div>Название</div><div>Цена</div><div>Скидка</div><div>Остаток</div><div>Истекает</div><div></div>
    </div>`;
    html += items.map(o=>{
      const price = o.price_cents!=null ? o.price_cents/100 : (o.price!=null ? Number(o.price) : 0);
      const old   = o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price!=null ? Number(o.original_price) : 0);
      const disc  = computeDiscount(price, old);
      const qtyL  = (o.qty_left!=null ? o.qty_left : (o.left_qty!=null ? o.left_qty : '—'));
      const qtyT  = (o.qty_total!=null ? o.qty_total : (o.total_qty!=null ? o.total_qty : '—'));
      const expires = o.expires_at || o.expires || null;
      return `<div class="row" data-offer-id="${o.id}">
        <div>${escapeHTML(o.title || '—')}</div>
        <div>${price? moneyRub(price):'—'}</div>
        <div>${disc? '−'+disc+'%':'—'}</div>
        <div>${qtyL} / ${qtyT}</div>
        <div>${expires ? escapeHTML(toLocalView(expires)) : '—'}</div>
        <div class="actions" role="group" aria-label="Действия по офферу">
          <button class="btn btn-ghost" data-action="edit-offer">Редактировать</button>
          <button class="btn btn-danger" data-action="delete-offer">Удалить</button>
        </div>
      </div>`;
    }).join('');
    root.innerHTML = html;
  }

  function bindActions(){
    const root = qs('#offerList'); if(!root) return;
    root.addEventListener('click', onAction, false);
  }

  async function onAction(e){
    const btn = e.target.closest('[data-action]'); if(!btn) return;
    e.preventDefault(); e.stopPropagation();
    const row = btn.closest('.row'); if(!row) return;
    const id = row.getAttribute('data-offer-id'); if(!id) return;
    const act = btn.getAttribute('data-action');
    const item = state.items.find(x => String(x.id)===String(id));
    if(act==='edit-offer'){
      openEdit(item);
    } else if(act==='delete-offer'){
      confirmDelete(id);
    }
  }

  function openEdit(o){
    if(!o) return;
    const m = qs('#offerEditModal'); if(!m) return;
    // Fill fields
    setVal('#editId', o.id);
    setVal('#editTitle', o.title || '');
    setVal('#editOld',  Number(o.original_price_cents!=null ? o.original_price_cents/100 : (o.original_price||0)) || '');
    setVal('#editPrice',Number(o.price_cents!=null ? o.price_cents/100 : (o.price||0)) || '');
    setVal('#editQty',  o.qty_total!=null ? o.qty_total : (o.total_qty!=null ? o.total_qty : ''));
    setVal('#editExpires', toLocalView(o.expires_at || o.expires || ''));
    setVal('#editCategory', o.category || 'other');
    setVal('#editDesc', o.description || '');
    m.style.display='';
  }
  function closeEdit(){ const m = qs('#offerEditModal'); if(m) m.style.display='none'; }
  function setVal(sel, val){ const el = qs(sel); if(el){ el.value = val==null?'':val; } }

  function bindEditForm(){
    const form = qs('#offerEditForm'); if(!form) return;
    const cancel = qs('#offerEditCancel'); if(cancel) cancel.addEventListener('click', function(ev){ ev.preventDefault(); closeEdit(); });
    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      const id = String(qs('#editId')?.value||'').trim();
      const payload = {
        title: String(qs('#editTitle')?.value||'').trim(),
        original_price: asNumberPrice(qs('#editOld')?.value, 0),
        price: asNumberPrice(qs('#editPrice')?.value, 0),
        qty_total: Number(qs('#editQty')?.value||0) || 0,
        expires_at: toIsoFromLocal(qs('#editExpires')?.value||'') || null,
        category: String(qs('#editCategory')?.value||'other'),
        description: String(qs('#editDesc')?.value||'').trim()
      };
      try{
        const base = apiBase().replace(/\/+$/,'');
        const url = `${base}/api/v1/merchant/offers/${encodeURIComponent(id)}`;
        const res = await fetch(url, {
          method:'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Foody-Key': key() },
          body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error('HTTP '+res.status);
        // Update local item and re-render without flicker
        const u = await res.json().catch(()=>null);
        const idx = state.items.findIndex(x=> String(x.id)===String(id));
        if(idx>-1){
          state.items[idx] = Object.assign({}, state.items[idx], payload, u||{});
        }
        render(state.items);
        closeEdit();
        toast('Сохранено');
      }catch(err){
        console.error(err);
        toast('Не удалось сохранить: '+err.message);
      }
    });
  }

  function confirmDelete(id){
    // Simple confirm modal reuse: use existing delete modal if present, else native confirm
    const m = qs('#deleteOfferModal');
    if(!m){
      if(confirm('Удалить оффер?')) doDelete(id);
      return;
    }
    m.querySelector('[data-close]')?.addEventListener('click', ()=> m.style.display='none', { once:true });
    const btn = qs('#confirmDeleteBtn');
    const onClick = async ()=> { btn.disabled = true; btn.textContent = 'Удаление…'; try{ await doDelete(id); m.style.display='none'; } finally { btn.disabled=false; btn.textContent='Удалить'; btn.removeEventListener('click', onClick); } };
    btn.addEventListener('click', onClick);
    m.style.display='';
  }

  async function doDelete(id){
    try{
      const base = apiBase().replace(/\/+$/,'');
      const url1 = `${base}/api/v1/merchant/offers/${encodeURIComponent(id)}`;
      const url2 = `${base}/api/v1/merchant/offers/${encodeURIComponent(id)}?restaurant_id=${encodeURIComponent(rid())}`;
      let ok = false, lastErr = null;
      for (const url of [url1, url2]){
        try{
          const res = await fetch(url, { method:'DELETE', headers: { 'X-Foody-Key': key() } });
          if (res.ok){ ok = true; break; }
          if (res.status===404){ ok = true; break; } // мягкая обработка 404
          lastErr = new Error('HTTP '+res.status);
        }catch(e){ lastErr = e; }
      }
      if(!ok && lastErr) throw lastErr;
      // remove locally
      state.items = state.items.filter(x=> String(x.id)!==String(id));
      render(state.items);
      toast('Оффер удалён');
    }catch(err){
      console.error(err);
      toast('Не удалось удалить: '+err.message);
    }
  }

  async function load(){
    // Avoid flashing: keep current DOM until new data arrives
    if(state.loading) return;
    state.loading = true;
    try{
      skeleton(state.items.length===0);
      const items = await fetchOffers();
      state.items = items;
      render(items);
    }catch(err){
      console.error(err);
      if(!state.items.length){
        const root = qs('#offerList'); if(root) root.innerHTML = '<div class="hint">Не удалось загрузить</div>';
      }
    }finally{
      state.loading = false;
    }
  }

  function hookTab(){
    document.addEventListener('click', function(e){
      const t = e.target.closest('[data-tab="offers"]'); if(!t) return;
      setTimeout(load, 80);
    }, true);
  }

  function toast(msg){
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText='position:fixed;right:16px;bottom:16px;background:#111;padding:10px 14px;border-radius:10px;color:#fff;z-index:3000';
    document.body.appendChild(n); setTimeout(()=>n.remove(),2400);
  }
  function escapeHTML(s){ return String(s||'').replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;' }[c])); }

  ready(function(){
    bindActions();
    bindEditForm();
    hookTab();
    load();
  });
})();
