// === DROP-IN FIXES ===
// 1) Use this instead of direct response.json() to avoid errors on 204.
async function fetchJSON(url, opts={}){
  const res = await fetch(url, opts);
  if(res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if(ct.includes('application/json')) return await res.json();
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return { ok: res.ok, status: res.status, text }; }
}

// 2) Replace your delete logic with this:
async function deleteOffer(id){
  const url = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/$/, '') + '/api/v1/merchant/offers/' + encodeURIComponent(id);
  const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
  // Accept 204 as success and DO NOT call res.json()
  if(!res.ok && res.status !== 204){
    const txt = await res.text().catch(()=>'');
    throw new Error('Ошибка удаления: ' + res.status + ' ' + txt);
  }
  return null;
}

// 3) Prefill helpers for edit modal (call inside your openEditModal(offer))
function setValue(form, name, value){ if(form && form.elements && form.elements[name]) form.elements[name].value = value ?? ''; }
function prefillOfferForm(form, offer){
  if(!form || !offer) return;
  setValue(form, 'id', offer.id);
  setValue(form, 'title', offer.title);
  setValue(form, 'price', offer.price);
  setValue(form, 'description', offer.description);
  setValue(form, 'stock', offer.stock ?? offer.quantity ?? '');
  setValue(form, 'photo_url', offer.photo_url || offer.image_url || '');
  if(offer.expires_at){
    const dt = new Date(offer.expires_at);
    const iso = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
    setValue(form, 'expires_at', iso);
  }
  if(offer.product_expire_date){
    const d = new Date(offer.product_expire_date);
    const isoDate = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    setValue(form, 'product_expire_date', isoDate);
  }
}

// 4) On submit: convert datetime-local to ISO and NULL empty strings
function normalizeOfferPayload(payload){
  if(payload.expires_at){
    const d = new Date(payload.expires_at);
    payload.expires_at = d.toISOString();
  }
  for(const k of Object.keys(payload)){
    if(payload[k] === '') payload[k] = null;
  }
  return payload;
}