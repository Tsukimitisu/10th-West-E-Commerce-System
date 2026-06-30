const fs = require('fs');
let code = fs.readFileSync('frontend/context/CartContext.jsx', 'utf8');
code = code.replace(/headers: \{/g, "credentials: 'include',\n        headers: {");
fs.writeFileSync('frontend/context/CartContext.jsx', code);
