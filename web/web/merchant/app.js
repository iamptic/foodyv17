// web/web/merchant/app.js
// Минимальный, безопасный файл. Если у тебя есть другие модули — оставь их подключёнными.
// Здесь: инициализация, список офферов, делегирование "Редактировать/Удалить", PATCH/DELETE без перезагрузки.

(() => {
  const FOODY_API = window.FOODY_API || (window.__FOODY_API__ ?? "https://foodyback-production.up.railway.app");
  const state = window.__STATE__ || (window.__STATE__ = {
    apiKey: localStorage.getItem("foody_api_key") || "",
    restaurantId: +(localStorage.getItem("foody_restaurant_id") || 0),
    offers: new Map(), // id -> offer
  });

  const els = {
    offerList: document.getElementById("offerList"),
    editModal: document.getElementById("offerEditModal"),
    editForm: document.getElementById("offerEditForm"),
    editSaveBtn: document.getElementById("offerEditSave"),
    editCloseBtn: document.getElementById("offerEditClose"),
  };

  function toast(msg){ try{ window.toast && window.toast(msg); }catch(_){} }

  async function fetchJSON(url, opts = {}) {
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      let data = {};
      try { data = await resp.json(); } catch {}
      const detail = data?.detail || `${resp.status} ${resp.statusText}`;
      throw new Error(detail);
    }
    // Если тело пустое (204) — просто возвращаем null
    if (resp.status === 204) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      // На всякий случай, если бек вернул текст
      return null;
    }
    return await resp.json();
  }

  // ---------- LIST ----------
  async function loadOffers() {
    if (!els.offerList) return;
    const url = `${FOODY_API}/api/v1/merchant/offers?restaurant_id=${state.restaurantId}`;
    const data = await fetchJSON(url, { headers: { "X-Foody-Key": state.apiKey } });
    els.offerList.innerHTML = "";
    (data || []).forEach(o => {
      state.offers.set(o.id, o);
      els.offerList.appendChild(renderOfferRow(o));
    });
  }

  function renderOfferRow(o) {
    const tr = document.createElement("tr");
    tr.dataset.id = o.id;

    const price = (o.price_cents != null) ? (o.price_cents/100).toFixed(0) : (o.price ?? "");
    const qty = `${o.qty_left ?? ""}/${o.qty_total ?? ""}`;
    const exp = o.expires_at ? new Date(o.expires_at).toLocaleString() : "";

    tr.innerHTML = `
      <td class="title">${escapeHtml(o.title || "")}</td>
      <td class="price">${price}</td>
      <td class="qty">${qty}</td>
      <td class="exp">${exp}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm" data-action="edit-offer" data-id="${o.id}">Редактировать</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete-offer" data-id="${o.id}">Удалить</button>
      </td>
    `;
    return tr;
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ---------- DELETE ----------
  async function handleDelete(id, rowEl){
    const url = `${FOODY_API}/api/v1/merchant/offers/${id}`;
    const resp = await fetch(url, { method: "DELETE", headers: { "X-Foody-Key": state.apiKey } });
    if (resp.status === 204) {
      rowEl?.remove();
      state.offers.delete(+id);
      toast("Оффер удалён");
      return;
    }
    // если не 204 — попробуем прочитать ошибку (если есть тело)
    let detail = "Не удалось удалить";
    try { const data = await resp.json(); detail = data?.detail || detail; } catch {}
    throw new Error(detail);
  }

  // ---------- EDIT ----------
  function openEditModal(id){
    const o = state.offers.get(+id);
    if (!o || !els.editModal || !els.editForm) return;

    els.editForm.dataset.id = id;
    els.editForm.querySelector('[name="title"]').value = o.title || "";
    els.editForm.querySelector('[name="price"]').value = (o.price_cents!=null) ? (o.price_cents/100) : (o.price ?? "");
    els.editForm.querySelector('[name="qty_total"]').value = o.qty_total ?? "";
    els.editForm.querySelector('[name="qty_left"]').value  = o.qty_left ?? "";
    els.editForm.querySelector('[name="expires_at"]').value = o.expires_at ? o.expires_at : ""; // ISO уже приходит
    els.editForm.querySelector('[name="image_url"]').value = o.image_url || "";
    els.editForm.querySelector('[name="category"]').value = o.category || "";
    els.editForm.querySelector('[name="description"]').value = o.description || "";

    els.editModal.classList.add("open");
  }
  function closeEditModal(){ els.editModal?.classList.remove("open"); }

  async function savePatchFromForm(form){
    const id = form.dataset.id;
    if (!id) return;
    const payload = {};
    const get = n => (form.querySelector(`[name="${n}"]`)?.value ?? "").trim();

    const title = get("title"); if (title) payload.title = title;
    const price = get("price"); if (price) payload.price = +price;
    const qty_total = get("qty_total"); if (qty_total) payload.qty_total = +qty_total;
    const qty_left  = get("qty_left");  if (qty_left)  payload.qty_left  = +qty_left;
    const expires_at = get("expires_at"); if (expires_at) payload.expires_at = expires_at;
    const image_url = get("image_url"); if (image_url) payload.image_url = image_url;
    const category = get("category"); if (category) payload.category = category;
    const description = get("description"); if (description) payload.description = description;

    const url = `${FOODY_API}/api/v1/merchant/offers/${id}`;
    const updated = await fetchJSON(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Foody-Key": state.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (updated) {
      state.offers.set(+id, updated);
      patchOfferRowInDom(updated);
    }
    closeEditModal();
    toast("Сохранено");
  }

  function patchOfferRowInDom(o){
    const row = els.offerList?.querySelector(`tr[data-id="${o.id}"]`);
    if (!row) return;
    const price = (o.price_cents!=null) ? (o.price_cents/100).toFixed(0) : (o.price ?? "");
    row.querySelector(".title").textContent = o.title || "";
    row.querySelector(".price").textContent = price;
    row.querySelector(".qty").textContent = `${o.qty_left ?? ""}/${o.qty_total ?? ""}`;
    row.querySelector(".exp").textContent = o.expires_at ? new Date(o.expires_at).toLocaleString() : "";
  }

  // ---------- EVENTS ----------
  document.addEventListener("DOMContentLoaded", () => {
    // делегирование кликов по таблице офферов
    els.offerList?.addEventListener("click", (e) => {
      const del = e.target.closest('[data-action="delete-offer"]');
      if (del) {
        const row = del.closest("tr");
        const id = del.dataset.id || row?.dataset.id;
        if (!id) return;
        handleDelete(id, row).catch(err => {
          console.error(err);
          alert(err.message || "Ошибка удаления");
        });
        return;
      }
      const edit = e.target.closest('[data-action="edit-offer"]');
      if (edit) {
        const row = edit.closest("tr");
        const id = edit.dataset.id || row?.dataset.id;
        if (!id) return;
        openEditModal(id);
      }
    });

    // сохранить изменения в модалке
    els.editForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      savePatchFromForm(els.editForm).catch(err => {
        console.error(err);
        alert(err.message || "Не удалось сохранить");
      });
    });
    els.editSaveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      els.editForm?.requestSubmit();
    });
    els.editCloseBtn?.addEventListener("click", (e) => { e.preventDefault(); closeEditModal(); });

    // первичная загрузка
    loadOffers().catch(err => console.error(err));
  });
})();
