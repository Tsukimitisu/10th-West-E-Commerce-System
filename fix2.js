const fs = require('fs');
let code = fs.readFileSync('frontend/context/CartContext.jsx', 'utf8');

// Fix initialization
code = code.replace(/const \[selectedItemIds, setSelectedItemIds\] = useState\(\(\) => \{[\s\S]*?\}\);/,
\const [selectedItemIds, setSelectedItemIds] = useState([]);\);

code = code.replace(/const getSelectedKey = \(\) => \\\\\\$\\{getCartKey\(\)\\}_selected\\\;/,
\const getSelectedKey = () => \\\\\\_selected\\\;\);

fs.writeFileSync('frontend/context/CartContext.jsx', code);
