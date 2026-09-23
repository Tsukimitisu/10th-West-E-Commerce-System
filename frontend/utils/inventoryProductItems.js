const php = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export const formatItemPrice = (price) => php.format(Number(price || 0));

export const formatItemLocation = (item) => {
  const box = String(item.boxNumber || '').trim();
  const location = String(item.storageLocation || '').trim();
  if (box && location && box.toLowerCase() !== location.toLowerCase()) return `${box} / ${location}`;
  return box || location || 'Not specified';
};

export const itemStockLabel = (item) => {
  const quantity = Number(item.stockQuantity || 0);
  if (quantity === 0) return 'Out of stock';
  if (quantity <= Number(item.lowStockThreshold || 0)) return 'Low stock';
  return 'In stock';
};
