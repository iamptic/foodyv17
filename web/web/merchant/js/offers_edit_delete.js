// Foody v17 — Delete offer fix (handles 204 No Content without JSON error)
window.deleteOffer = async function(offerId) {
  if (!confirm("Удалить оффер?")) return;
  const api = (window.FOODY_API || 'https://foodyback-production.up.railway.app').replace(/\/$/, '');
  try {
    const res = await fetch(`${api}/api/v1/merchant/offers/${offerId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (res.status === 204 || res.status === 200) {
      const row = document.querySelector(`#offerList .row[data-id='${offerId}']`)
                 || document.getElementById(`offer-${offerId}`);
      if (row) row.remove();
      toastDeleteOk();
      const maybe = window.loadOffers || window.refreshOffers;
      if (typeof maybe === 'function') { try { maybe(); } catch(_){} }
    } else {
      let msg;
      try { msg = await res.text(); } catch(e){ msg = res.statusText; }
      alert("Ошибка удаления: " + msg);
    }
  } catch(err) {
    console.error("Delete error", err);
    alert("Ошибка сети при удалении");
  }
};

function toastDeleteOk() {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = "Оффер удалён";
  box.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}