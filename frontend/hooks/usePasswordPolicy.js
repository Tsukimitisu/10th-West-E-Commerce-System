import { useCallback, useEffect, useState } from 'react';
import { getPasswordPolicy } from '../services/api.js';
import { DEFAULT_PASSWORD_POLICY } from '../utils/passwordPolicy.js';

export function usePasswordPolicy() {
  const [policy, setPolicy] = useState(DEFAULT_PASSWORD_POLICY);
  const refreshPolicy = useCallback(async () => {
    const current = await getPasswordPolicy();
    setPolicy(current);
    return current;
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => { void getPasswordPolicy().then(current => { if (active) setPolicy(current); }); };
    load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, []);
  return { policy, refreshPolicy };
}
