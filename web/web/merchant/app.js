(function(){
  const FOODY_API = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/$/, '');
  const els = {
    offersList: document.getElementById('offersList'),
    kpiActive: document.getElementById('kpiActive'),
    kpiTotal: document.getElementById('kpiTotal'),
    kpiReservations: document.getElementById('kpiReservations'),
    kpiRedemptions: document.getElementById('kpiRedemptions'),
    search: document.getElementById('search'),
    btnCreateOffer: document.getElementById('btnCreateOffer'),
    modal: document.getElementById('offerModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalClose: document.getElementById('modalClose'),
    form: document.getElementById('offerForm'),
    btnDelete: document.getElementById('btnDelete'),
    formHint: document.getElementById('formHint'),
  };

  const fmt = {
    money: (n) => new Intl.NumberFormat('ru-RU').format(Number(n||0)),
    dt: (s) => { if(!s) return '—'; const d = new Date(s); return d.toLocaleString('ru-RU', { dateStyle:'short', timeStyle:'short' }); },
    date: (s) => { if(!s) return '—'; const d = new Date(s); return d.toLocaleDateString('ru-RU', { dateStyle:'medium' }); }
  };

  function toast(msg, ok=true){
    els.formHint.textContent = msg;
    els.formHint.style.color = ok ? '#97e69b' : '#ffb4b4';
    setTimeout(()=>{ els.formHint.textContent=''; }, 3500);
  }

  async function fetchJSON(url, opts={}){
    const res = await fetch(url, opts);
    if(res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    if(ct.includes('application/json')) return await res.json();
    const text = await res.text();
    try { return JSON.parse(text); } catch(e) { return { ok: res.ok, status: res.status, text }; }
  }

  function openModal(data=null){
    els.modal.classList.add('open');
    els.modal.setAttribute('aria-hidden', 'false');
    els.form.reset();
    if(data){
      els.modalTitle.textContent = 'Редактировать оффер';
      setValue('id', data.id);
      setValue('title', data.title);
      setValue('price', data.price);
      setValue('description', data.description);
      setValue('stock', data.stock ?? data.quantity ?? '');
      setValue('photo_url', data.photo_url || data.image_url || '');
      if(data.expires_at){
        const dt = new Date(data.expires_at);
        const iso = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
        setValue('expires_at', iso);
      }
      if(data.product_expire_date){
        const d = new Date(data.product_expire_date);
        const isoDate = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
        setValue('product_expire_date', isoDate);
      }
    } else {
      els.modalTitle.textContent = 'Создать оффер';
      setValue('id', '');
    }
  }
  function closeModal(){ els.modal.classList.remove('open'); els.modal.setAttribute('aria-hidden', 'true'); }
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e)=>{ if(e.target === els.modal) closeModal(); });

  function getValue(name){ return els.form.elements[name] && els.form.elements[name].value; }
  function setValue(name, value){ if(els.form.elements[name]) els.form.elements[name].value = value ?? ''; }

  let allOffers = [];
  function renderOffers(list){
    const q = (els.search.value || '').trim().toLowerCase();
    const filtered = list.filter(o => (o.title||'').toLowerCase().includes(q));
    els.offersList.innerHTML = filtered.map(o => offerCard(o)).join('') || emptyState();
  }
  function emptyState(){ return `<div class="panel" style="text-align:center">Офферы не найдены. Нажмите «Создать оффер», чтобы добавить первый.</div>`; }
  function offerCard(o){
    const img = o.photo_url || o.image_url || '';
    const price = fmt.money(o.price);
    const exp = fmt.dt(o.expires_at);
    const prodExp = o.product_expire_date ? fmt.date(o.product_expire_date) : '—';
    return `
    <article class="offer">
      <div class="media">${img ? `<img src="${img}" alt="">` : `<span>Нет фото</span>`}</div>
      <div class="body">
        <h3>${o.title || 'Без названия'}</h3>
        <div class="meta"><span>Цена: ${price} ₽</span><span>До: ${exp}</span></div>
        <div class="meta"><span>Срок годн.: ${prodExp}</span><span>Остаток: ${o.stock ?? o.quantity ?? '—'}</span></div>
        <div class="actions">
          <button class="btn btn-primary" data-edit="${o.id}">Редактировать</button>
          <button class="btn btn-ghost" data-delete="${o.id}">Удалить</button>
        </div>
      </div>
    </article>`;
  }
  function updateKPI(list){
    const total = list.length;
    const now = Date.now();
    const active = list.filter(o => o.expires_at && new Date(o.expires_at).getTime() > now).length;
    const reservations = list.reduce((acc, o) => acc + (Number(o.reservations_count || 0)), 0);
    const redemptions = list.reduce((acc, o) => acc + (Number(o.redemptions_count || 0)), 0);
    els.kpiActive.textContent = active;
    els.kpiTotal.textContent = total;
    els.kpiReservations.textContent = reservations;
    els.kpiRedemptions.textContent = redemptions;
  }

  async function loadOffers(){
    try{
      const data = await fetchJSON(FOODY_API + '/api/v1/merchant/offers', { credentials: 'include' });
      allOffers = Array.isArray(data) ? data : (data?.items || []);
      updateKPI(allOffers);
      renderOffers(allOffers);
    }catch(e){
      console.error('loadOffers', e);
      els.offersList.innerHTML = '<div class="panel">Ошибка загрузки офферов</div>';
    }
  }

  async function saveOffer(payload, isEdit){
    const url = isEdit ? FOODY_API + '/api/v1/merchant/offers/' + encodeURIComponent(payload.id)
                       : FOODY_API + '/api/v1/merchant/offers';
    const method = isEdit ? 'PATCH' : 'POST';
    if(!isEdit) delete payload.id;

    if(payload.expires_at){
      const d = new Date(payload.expires_at);
      payload.expires_at = d.toISOString();
    }
    for(const k of Object.keys(payload)){ if(payload[k] === '') payload[k] = null; }

    let res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const txt = await res.text().catch(()=>'');
      if(res.status === 422 && /product_expire_date/i.test(txt)){
        try{
          const retryPayload = JSON.parse(JSON.stringify(payload));
          delete retryPayload.product_expire_date;
          res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(retryPayload)
          });
        }catch(_e){}
      }
      if(!res.ok){ throw new Error('Ошибка сохранения: ' + res.status + ' ' + txt); }
    }
    return await (res.status === 204 ? null : res.json().catch(()=>null));
  }

  async function deleteOffer(id){
    const url = FOODY_API + '/api/v1/merchant/offers/' + encodeURIComponent(id);
    const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if(!res.ok && res.status !== 204){
      const txt = await res.text().catch(()=>'');
      throw new Error('Ошибка удаления: ' + res.status + ' ' + txt);
    }
    return null;
  }

  els.btnCreateOffer.addEventListener('click', ()=> openModal(null));
  els.search.addEventListener('input', ()=> renderOffers(allOffers));
  els.offersList.addEventListener('click', (e)=>{
    const editId = e.target?.dataset?.edit;
    const delId = e.target?.dataset?.delete;
    if(editId){
      const found = allOffers.find(o => String(o.id) === String(editId));
      if(found) openModal(found);
    } else if(delId){
      if(confirm('Удалить оффер #' + delId + '?')){
        deleteOffer(delId).then(()=>{ toast('Удалено'); loadOffers(); })
                          .catch(err=>{ console.error(err); toast('Не удалось удалить: ' + err.message, false); });
      }
    }
  });
  els.form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const payload = {
      id: getValue('id'),
      title: getValue('title'),
      price: Number(getValue('price')),
      description: getValue('description'),
      stock: Number(getValue('stock')),
      expires_at: getValue('expires_at'),
      product_expire_date: getValue('product_expire_date'),
      photo_url: getValue('photo_url')
    };
    const isEdit = Boolean(payload.id);
    saveOffer(payload, isEdit).then(()=>{ toast('Сохранено'); closeModal(); loadOffers(); })
                              .catch(err => { console.error(err); toast(err.message || 'Ошибка сохранения', false); });
  });

  loadOffers();
})();