export const reconcileCheckoutSelection = (currentIds, selectedIds, availableIds) => {
  const available = new Set(availableIds.map(Number));
  const filter = (ids) => ids.map(Number).filter((id) => Number.isInteger(id) && id > 0 && available.has(id));
  const selected = filter(selectedIds);
  return selected.length > 0 ? selected : filter(currentIds);
};
