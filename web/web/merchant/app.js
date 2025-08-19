(() => {
toast('Не удалось удалить: '+res.status);
}catch(e){ toast('Ошибка удаления'); }
}


function collectOfferBody(f){
const b = {
title: f.title.value.trim(),
category: f.category.value||'other',
price: Number(f.price.value||0),
old_price: f.old_price.value? Number(f.old_price.value): null,
quantity: Number(f.quantity.value||0),
description: f.description.value.trim()||null,
shelf_life: f.shelf_life.value? new Date(f.shelf_life.value).toISOString(): null,
expires_at: f.expires_at.value? new Date(f.expires_at.value).toISOString(): null,
image_url: f.image_url?.value || null,
};
return b;
}


// ===== Create
$('#createPhoto')?.addEventListener('change', async (e)=>{
const file = e.target.files?.[0]; if (!file) return;
const img = $('#createPreview'); img.src = URL.createObjectURL(file);
try{
// Пример: если на бэке есть аплоад — используй его. Если нет, оставь локальный preview и image_url пустым.
// const up = await uploadToR2(file); $('#createImageUrl').value = up.url;
}catch(_){ /* no-op */ }
});


$('#offerForm')?.addEventListener('submit', async (e)=>{
e.preventDefault();
const f = e.target; const body = collectOfferBody(f);
try{
await api('/api/v1/merchant/offers', { method:'POST', body: JSON.stringify(body) });
toast('Оффер создан'); f.reset(); $('#createPreview').src=''; activateTab('offers'); reloadOffers();
}catch(err){ toast('Ошибка создания оффера'); }
});


// ===== Profile / City modal =====
function openCity(){ $('#cityModal').setAttribute('aria-hidden','false'); $('#cityInput').focus(); }
function closeCity(){ $('#cityModal').setAttribute('aria-hidden','true'); }
$('#openCityFromReg')?.addEventListener('click', openCity);
$('#openCityFromProfile')?.addEventListener('click', openCity);
$('#closeCity')?.addEventListener('click', closeCity);
$('#cancelCity')?.addEventListener('click', closeCity);
$('#saveCity')?.addEventListener('click', ()=>{
const val = $('#cityInput').value.trim(); if (!val) { toast('Введите город'); return; }
$('#regCityHidden') && ($('#regCityHidden').value = val);
$('#profileCityHidden') && ($('#profileCityHidden').value = val);
closeCity(); toast('Город сохранён');
});


// ===== API helpers =====
function authHeaders(){ return { 'Content-Type':'application/json', 'Authorization': 'Bearer '+getToken() }; }
async function api(path, opts={}){
const res = await fetch(API+path, { headers: authHeaders(), ...opts });
const ct = res.headers.get('content-type')||''; const j = ct.includes('json')? await res.json().catch(()=>null) : null;
if (!res.ok) throw new Error(j?.detail || res.statusText || 'API error');
return j;
}


function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m])); }


// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
gate();
if (authed()) { activateTab('dashboard'); refreshDashboard(); reloadOffers(); }
});
})();
