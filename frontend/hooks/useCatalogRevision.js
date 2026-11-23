import { useEffect, useState } from 'react';

// Socket messages are invalidations only. Always re-read the public API rather
// than merging raw inventory prices/stock into customer cards or browser history.
export default function useCatalogRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => setRevision(value => value + 1), 100); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('catalog:updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('catalog:updated', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return revision;
}
