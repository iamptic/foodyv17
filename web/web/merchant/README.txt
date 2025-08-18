
Foody Merchant Hotfix v10 (2025-08-18)

1) Include files:
   - merchant/js/offers_logic_hotfix_v10.js
   - merchant/css/modal_center_fix.css

2) Add to your /web/merchant/index.html before </body>:
   <link rel="stylesheet" href="./css/modal_center_fix.css">
   <script src="./js/offers_logic_hotfix_v10.js"></script>

3) What this does:
   - Appends ?restaurant_id=... to ALL requests to /api/v1/merchant/offers* (fetch + XHR).
   - Centers existing edit modal (#offerEditModal) without changing design.
   - Hooks delete buttons; treats 404 as already deleted.
   - Initializes flatpickr if present for best_before/expires_at fields.

4) Notes:
   - restaurant_id is resolved from localStorage/meta/query and persisted to localStorage['restaurant_id'].
   - No changes to your existing CSS/HTML structure.
