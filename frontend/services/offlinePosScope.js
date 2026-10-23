let restricted=false;
export const offlinePosRestricted = () => restricted;
export const setOfflinePosRestricted = value => {
  if (restricted===value) return;
  restricted=value;
  window.dispatchEvent(new Event('offline-pos:scope'));
};
