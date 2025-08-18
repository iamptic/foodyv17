Foody merchant patch (final, no design changes)
1) Скопируй содержимое архива в папку merchant/ c заменой.
2) Подключи в своем merchant/index.html перед </body>:
   <link rel="stylesheet" href="./css/modal_center_fix.css">
   <script src="./js/offers_logic_patch_final.js"></script>
3) Никакие стили/разметку не меняем. Модалка центрируется локально, даты с flatpickr если он уже подключен.
4) Все запросы к /api/v1/merchant/offers* автоматически получают ?restaurant_id=... (берется из localStorage/meta/query).
