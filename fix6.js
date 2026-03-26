const fs = require('fs');
let code = fs.readFileSync('frontend/context/CartContext.jsx', 'utf8');

const loadBlock = \  // Load selection state once on mount / init
  useEffect(() => {
    if (initialized) {
      try {
        const saved = sessionStorage.getItem(getSelectedKey());
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && selectedItemIds.length === 0) {
            setSelectedItemIds(parsed);
          }
        }
      } catch (e) {
        console.error('Failed to load selected item ids', e);
      }
    }
  }, [initialized]);\;

const saveBlock = \  // Save to localStorage as backup
  useEffect(() => {
    if (initialized) {
      sessionStorage.setItem(getCartKey(), JSON.stringify(items));
      // cleanup removed items
      const itemIds = new Set(items.map(i => i.productId));
      const cleanSelected = selectedItemIds.filter(id => itemIds.has(id));
      if (cleanSelected.length !== selectedItemIds.length) {
        setSelectedItemIds(cleanSelected);
      }
      sessionStorage.setItem(getSelectedKey(), JSON.stringify(cleanSelected));
    }
  }, [items, selectedItemIds, initialized]);\;

code = code.replace(saveBlock + '\\n\\n' + loadBlock, loadBlock + '\\n\\n' + saveBlock);
fs.writeFileSync('frontend/context/CartContext.jsx', code);
