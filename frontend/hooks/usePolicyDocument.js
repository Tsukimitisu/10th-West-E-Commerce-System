import { useEffect, useState } from 'react';
import { getPolicy } from '../services/api';

export default function usePolicyDocument(type) {
  const [state, setState] = useState({ policy: null, loading: true, error: false });

  useEffect(() => {
    let active = true;
    setState({ policy: null, loading: true, error: false });
    getPolicy(type).then((policy) => {
      if (active) setState({ policy, loading: false, error: false });
    }).catch(() => {
      if (active) setState({ policy: null, loading: false, error: true });
    });
    return () => { active = false; };
  }, [type]);

  return state;
}
