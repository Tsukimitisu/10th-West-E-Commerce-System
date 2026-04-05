const fs = require('fs');
let code = fs.readFileSync('frontend/context/CartContext.jsx', 'utf8');

// For addToCart
code = code.replace(
  /const token = getToken\(\);\s+if \(token\) \{/g,
  'const token = getToken();\n    if (USE_SUPABASE && !token) {\n      return (arguments.callee.name === \"addToCart\" || arguments[0] && typeof arguments[0] === \"object\" && typeof arguments[1] === \"number\") ? addToCartLocal(arguments[0], arguments[1]) : (setItems([]), true);\n    }\n    if (true) {'
);

fs.writeFileSync('frontend/context/CartContext.jsx', code);
