// web/web/merchant/js/offers_logic_hotfix_v10.js
// Хотфикс: доклеивает restaurant_id при запросах списка, мягко обрабатывает 404 при повторном удалении,
// и главное — НЕ делает resp.json() на 204.

(() => {
  const FOODY_API = window.FOODY_API || (window.__FOODY_API__ ?? "https://foodyback-production.up.railway.app");
  const state = window.__STATE__ || (window.__STATE__ = {
    apiKey: localStorage.getItem("foody_api_key") || "",
    restaurantId: +(localStorage.getItem("foody_restaurant_id") || 0),
  });

  // Патчим fetch только точечно для списка офферов (если где-то написано без параметра)
  const _fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      let url = (typeof input === "string") ? input : (input?.url || "");
      // если это наш список офферов и в нём нет restaurant_id — добавим
      if (typeof url === "string" &&
          url.startsWith(`${FOODY_API}/api/v1/merchant/offers`) &&
          url.indexOf("/offers/") === -1 && // не одиночный оффер
          !/[?&]restaurant_id=/.test(url)) {
        const sep = url.includes("?") ? "&" : "?";
        url = `${url}${sep}restaurant_id=${state.restaurantId}`;
        if (typeof input !== "string") {
          input = new Request(url, input);
        } else {
          input = url;
        }
      }

      const resp = await _fetch(input, init);

      // Если DELETE вернул 204 — возвращаем как есть, не трогаем тело
      if (init?.method === "DELETE" && resp.status === 204) {
        return resp;
      }

      // Для 404 на DELETE — позволяем коду выше обработать это как "уже удалён"
      return resp;
    } catch (e) {
      console.error("fetch hotfix error:", e);
      throw e;
    }
  };
})();
