// Foody v17 — Delete offer fix V3 (uses X-Foody-Key header; safe, idempotent)
(function(){
  // If page already defines deleteOffer in app.js, keep it
  if (typeof window.deleteOffer === "function") return;

  function baseApi(){
    try { return ((window.__FOODY__ && window.__FOODY__.FOODY_API) || window.foodyApi || 'https://foodyback-production.up.railway.app').replace(/\/$/, ''); }
    catch(_){ return 'https://foodyback-production.up.railway.app'; }
  }
  window.deleteOffer = async function(offerId) {
    if (!offerId) return;
    if (!confirm("Удалить оффер?")) return;
    const key = (localStorage.getItem('foody_key') || '').trim();
    try {
      const res = await fetch(`${baseApi()}/api/v1/merchant/offers/${offerId}`, {
        method: "DELETE",
        headers: key ? { "X-Foody-Key": key } : {},
        mode: "cors"
      });
      if (res.status === 204 || res.status === 200) {
        const row = document.querySelector(`#offerList .row[data-id='${offerId}']`)
                  || document.getElementById(`offer-${offerId}`)
                  || document.querySelector(`[data-offer-id='${offerId}']`);
        if (row) row.remove();
        try { (window.loadOffers||window.refreshOffers)?.(); } catch(_) {}
        showToast("Оффер удалён");
        return;
      }
      let msg;
      try { msg = await res.text(); } catch(e) { msg = res.statusText; }
      alert("Ошибка удаления: " + msg);
    } catch (err) {
      console.error("Delete error", err);
      alert("Ошибка сети при удалении");
    }
  };
  function showToast(text) {
    let box = document.getElementById("toast");
    if (!box) { box = document.createElement("div"); box.id = "toast"; document.body.appendChild(box); }
    const el = document.createElement("div"); el.className = "toast"; el.textContent = text; box.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
})();
