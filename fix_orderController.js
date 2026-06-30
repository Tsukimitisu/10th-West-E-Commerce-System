const fs = require('fs');
let code = fs.readFileSync('backend/src/controllers/orderController.js', 'utf8');

code = code.replace(
  /'DELETE FROM cart_items WHERE cart_id = \\\',/g,
  "\DELETE FROM cart_items WHERE cart_id = \\ AND product_id = ANY(\\::int[])\,"
).replace(
  /\[cartResult\.rows\[0\]\.id\]/g,
  "[cartResult.rows[0].id, uniqueProductIds]"
);

fs.writeFileSync('backend/src/controllers/orderController.js', code);
