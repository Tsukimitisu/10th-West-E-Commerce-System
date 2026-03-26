const fs = require('fs');
let code = fs.readFileSync('frontend/context/CartContext.jsx', 'utf8');

// Replace the bad arguments.callee code
code = code.replace(/return \(arguments\.callee\.name ===.*?\);/g, 'throw new Error("Guest Supabase fallback");');

fs.writeFileSync('frontend/context/CartContext.jsx', code);
