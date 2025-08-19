// Foody v17 — Delete offer fix (handles 204 No Content without JSON error)
async function deleteOffer(offerId) {
  if (!confirm("Удалить оффер?")) return;
  try {
    const res = await fetch(`${FOODY_API}/api/v1/merchant/offers/${offerId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (res.status === 204 || res.status === 200) {
      // Success — remove row from DOM without reload
      const row = document.querySelector(`#offerList .row[data-id='${offerId}']`)
                 || document.getElementById(`offer-${offerId}`);
      if (row) row.remove();
      showToast("Оффер удалён");
    } else {
      let msg;
      try { msg = await res.text(); } catch(e){ msg = res.statusText; }
      alert("Ошибка удаления: " + msg);
    }
  } catch(err) {
    console.error("Delete error", err);
    alert("Ошибка сети при удалении");
  }
}

// Optional toast helper (already in style.css there is #toast)
function showToast(text) {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}