Foody merchant final (RID enforced)
1) Copy folder `merchant/` over your project.
2) In your existing merchant/index.html add before </body>:
   <link rel="stylesheet" href="./css/modal_center_fix.css">
   <script src="./js/offers_logic_patch_final_rid.js"></script>
3) Assumes restaurant_id stored in localStorage under 'restaurant_id' (fallback keys supported).
4) All offers API calls are made with ?restaurant_id=... . Delete soft-handles 404; edit modal centered.
