// Foody — Edit Modal Patch (load AFTER your current app.js)
(function(){
  function fmtLocalFromISO(iso){
    try{
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      const Y = d.getFullYear();
      const M = String(d.getMonth()+1).padStart(2,'0');
      const D = String(d.getDate()).padStart(2,'0');
      const h = String(d.getHours()).padStart(2,'0');
      const m = String(d.getMinutes()).padStart(2,'0');
      return `${Y}-${M}-${D} ${h}:${m}`;
    }catch(_){ return String(iso||''); }
  }

  // Force details->edit button to use correct function
  if (typeof window.openOfferDetails === 'function') {
    const __orig = window.openOfferDetails;
    window.openOfferDetails = function(o){
      __orig(o);
      try {
        const btn = document.getElementById('offerDetailsEdit');
        if (btn && !btn.dataset.__fixed){
          btn.dataset.__fixed = '1';
          btn.onclick = ()=>{ 
            const m = document.getElementById('offerDetailsModal'); 
            if (m) m.style.display='none'; 
            openOfferEdit(o); 
          };
        }
      } catch(_) {}
    };
  }

  // Robust open/close + submit for #offerEditForm
  window.openOfferEdit = function(o){
    const m = document.getElementById('offerEditModal'); if (!m) return;
    m.style.display = 'grid';
    const f = document.getElementById('offerEditForm'); if (!f) return;
    const set = (id,val)=>{ const el=document.getElementById(id); if (el!=null) el.value = val ?? ''; };
    (document.getElementById('editId')||{}).value = o.id || '';

    const get = (k, alt=[]) => (o && (o[k] ?? alt.map(a=>o[a]).find(v=>v!=null))) ?? '';
    set('editTitle',    get('title'));
    set('editOld',      get('original_price',['old_price','price_base']));
    set('editPrice',    get('price',['new_price','final_price']));
    set('editQty',      get('qty_total',['qty','qty_left','quantity']));
    set('editBest',     (v=>v?fmtLocalFromISO(v):'')(get('best_before',['bestBefore','best'])));
    set('editExpires',  (v=>v?fmtLocalFromISO(v):'')(get('expires_at',['expiresAt','until','expires'])));
    set('editCategory', get('category') || 'other');
    set('editDesc',     get('description',['desc']));
    set('editImageUrl', get('image_url',['image','photo']));

    const cancel = document.getElementById('offerEditCancel');
    if (cancel && !cancel.dataset.bound){ cancel.dataset.bound='1'; cancel.addEventListener('click', closeOfferEdit); }

    if (!f.dataset.bound){
      f.dataset.bound = '1';
      f.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const toNum = (v)=>{ const n = parseFloat(String(v||'').replace(',','.')); return isFinite(n)?n:0; };
        const toInt = (v)=>{ const n = parseInt(String(v||'').trim(),10); return isFinite(n)?n:0; };
        const trim  = (v)=>String(v||'').trim();
        const id = (document.getElementById('editId')?.value || o.id || '').toString();

        const payload = {
          title: trim(document.getElementById('editTitle')?.value),
          original_price: toNum(document.getElementById('editOld')?.value) || undefined,
          price: toNum(document.getElementById('editPrice')?.value),
          qty_total: toInt(document.getElementById('editQty')?.value),
          best_before: trim(document.getElementById('editBest')?.value),
          expires_at: trim(document.getElementById('editExpires')?.value),
          category: trim(document.getElementById('editCategory')?.value) || 'other',
          description: trim(document.getElementById('editDesc')?.value) || undefined,
          image_url: trim(document.getElementById('editImageUrl')?.value) || undefined,
        };

        function toIsoMaybe(s){ if (!s) return undefined; try{ 
            const [d,t] = s.split(' '); const [Y,M,D] = d.split('-').map(x=>parseInt(x,10));
            const [h,m] = (t||'00:00').split(':').map(x=>parseInt(x,10));
            const dt = new Date(Y, (M-1), D, h||0, m||0, 0, 0);
            return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16)+':00Z';
          }catch(_){ return s; } }
        if (payload.best_before) payload.best_before = toIsoMaybe(payload.best_before);
        if (payload.expires_at)  payload.expires_at  = toIsoMaybe(payload.expires_at);

        if (!payload.title) { return showToast('Укажите название'); }
        if (!(payload.qty_total > 0)) { return showToast('Количество должно быть больше 0'); }
        if (!(payload.price > 0)) { return showToast('Новая цена должна быть больше 0'); }
        if (payload.original_price && payload.price >= payload.original_price) { return showToast('Новая цена должна быть меньше обычной'); }

        try{
          const exL = new Date(payload.expires_at || 0); const bbL = new Date(payload.best_before || 0);
          if (isFinite(exL) && isFinite(bbL) && exL.getTime() > bbL.getTime()) return showToast('Срок действия не может превышать срок годности');
        }catch(_){}

        const btn = f.querySelector('button[type="submit"]');
        try{
          if (btn){ btn.disabled = true; btn.textContent = 'Сохранение…'; }
          if (window.api) {
            await window.api(`/api/v1/merchant/offers/${id}`, { method:'PATCH', body: JSON.stringify(payload) });
          } else {
            const base = ((window.__FOODY__&&__FOODY__.FOODY_API)||window.foodyApi||'').replace(/\/$/,''); 
            await fetch(`${base}/api/v1/merchant/offers/${id}`, {
              method:'PATCH',
              headers:{'Content-Type':'application/json', ...(localStorage.getItem('foody_key')?{'X-Foody-Key':localStorage.getItem('foody_key')}:{})},
              body: JSON.stringify(payload)
            });
          }
          showToast('Сохранено ✓');
          closeOfferEdit();
          try { await (window.loadOffers && window.loadOffers()); } catch(_){}
          try { window.refreshDashboard && window.refreshDashboard(); } catch(_) {}
        } catch(err){
          try{
            if (window.api) {
              await window.api(`/api/v1/merchant/offers/${id}`, { method:'PUT', body: JSON.stringify(payload) });
            } else {
              const base = ((window.__FOODY__&&__FOODY__.FOODY_API)||window.foodyApi||'').replace(/\/$/,''); 
              await fetch(`${base}/api/v1/merchant/offers/${id}`, {
                method:'PUT',
                headers:{'Content-Type':'application/json', ...(localStorage.getItem('foody_key')?{'X-Foody-Key':localStorage.getItem('foody_key')}:{})},
                body: JSON.stringify(payload)
              });
            }
            showToast('Сохранено ✓');
            closeOfferEdit();
            try { await (window.loadOffers && window.loadOffers()); } catch(_){}
            try { window.refreshDashboard && window.refreshDashboard(); } catch(_) {}
          } catch(e2){
            showToast('Ошибка сохранения: ' + (e2.message||e2));
          }
        } finally {
          if (btn){ btn.disabled = false; btn.textContent = 'Сохранить'; }
        }
      });
    }
  };

  window.closeOfferEdit = function(){
    const m = document.getElementById('offerEditModal'); if (!m) return;
    m.style.display = 'none';
  };
})();
