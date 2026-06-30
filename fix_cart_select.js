const fs = require('fs');
let code = fs.readFileSync('frontend/context/CartContext.jsx', 'utf8');

// Replace state definition
code = code.replace(
  /const \[selectedItemIds, setSelectedItemIds\] = useState\(\[\]\);/,
  \const [selectedItemIds, setSelectedItemIds] = useState(() => {
    try {
      const saved = sessionStorage.getItem('shopCoreGuestCart_selected');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });\
);

code = code.replace(
  /const getCartKey = \(\) => \{[\s\S]*?\};/,
  \const getCartKey = () => {
    const user = getCurrentUserFromToken();
    return user?.id ? \\\shopCoreCart_\\\\\\ : 'shopCoreGuestCart';
  };
  
  const getSelectedKey = () => \\\\\\_selected\\\;\
);

fs.writeFileSync('frontend/context/CartContext.jsx', code);
