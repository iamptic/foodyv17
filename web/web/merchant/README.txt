Foody merchant patch v7 (NO DESIGN CHANGES)
1) В вашем merchant/index.html подключите один скрипт перед </body>:
   <script src="./js/offers_logic_patch_v7.js"></script>

2) Никаких правок вёрстки/стилей не требуется.
   - Все запросы автоматически добавляют ?restaurant_id=… (берётся из localStorage/meta/JWT).
   - Удаление: 404 считается как «уже удалён», элемент убирается из DOM.
   - Редактирование: модалка по центру; поля: title, description, price, left_qty, best_before, expires_at.
   - Календарь: если подключён flatpickr, используем его; иначе нативный datetime-local.

3) Если у вас restaurant_id хранится под другим ключом — добавьте его в localStorage,
   или укажите <meta name="restaurant_id" content="20"> в index.html (необязательно).
