How to apply (no design changes):
1) Replace your /web/web/merchant/ (or merchant/) with this folder OR copy inside these files:
   - css/modal_center_fix.css
   - js/offers_logic_patch_v5.js
2) In your existing merchant index page, include ONE script before </body>:
   <script src="./js/offers_logic_patch_v5.js"></script>
3) That's it. The script:
   - Centers "Редактировать" modal and prevents page scroll while open;
   - Adds Flatpickr calendars if available for "best_before" and "expires_at" (fallback to text);
   - Fixes DELETE Not Found by trying URLs with ?restaurant_id and graceful 404 handling;
   - Fixes PATCH Not Found by trying PATCH/PUT + URL variants;
   - Robust event delegation so "Редактировать" always opens.
