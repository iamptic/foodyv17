Foody merchant patch v6 (no design changes)
1) Подключи один скрипт в merchant/index.html (перед </body>):
   <script src="./js/offers_logic_patch_v6.js"></script>

2) (Необязательно) Можно добавить локальный стиль центровки модалки:
   <link rel="stylesheet" href="./css/modal_center_fix.css">

3) Скрипт сам будет добавлять ?restaurant_id=... ко всем запросам (берётся из localStorage: restaurant_id / restaurantId / current_restaurant_id / merchant_restaurant_id).

4) Редактирование открывается по кнопке «Редактировать» (или data-action="edit-offer"), удаление работает даже если сервер отвечает 404 — элемент удаляется локально.

5) Для дат поддерживается flatpickr при наличии; иначе используется input type="datetime-local".
