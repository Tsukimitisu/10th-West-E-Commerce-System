import { useCallback, useEffect, useState } from 'react';
import { getMotorcycleModels } from '../services/api.js';

export const INVENTORY_CHANGED = 'inventory:changed';
export const MODELS_CHANGED = 'motorcycle-models:changed';
const DEFAULTS = {q:'',stockStatus:'',model_id:'',sortBy:'itemName',sortDir:'asc',page:1,pageSize:20};

// A new filter immediately cancels the old request, including during debounce.
// Polling/socket refreshes always reuse the latest filters, never a bare list.
export function useInventoryBrowser(fetchPage, initial = {}, enabled = true) {
  const [query,setQuery] = useState(()=>({...DEFAULTS,...initial}));
  const [result,setResult] = useState({items:[],total:0});
  const [settled,setSettled] = useState('');
  const [loading,setLoading] = useState(enabled),[error,setError] = useState(''),[revision,setRevision] = useState(0);
  const refresh = useCallback(()=>setRevision(value=>value+1),[]);
  const update = useCallback(patch=>setQuery(current=>({...current,...patch,page:patch.page ?? 1})),[]);
  const signature = JSON.stringify(query);
  useEffect(()=>{
    if (!enabled) return;
    let active = true;
    const abort = new AbortController();setLoading(true);setError('');
    const timer = setTimeout(()=>{
      fetchPage(JSON.parse(signature),{signal:abort.signal}).then(data=>{
        if (!active) return;
        const normalized = Array.isArray(data) ? {items:data,total:data.length} : data;
        setResult(normalized);setSettled(signature);
      }).catch(failure=>{if(active) {setResult({items:[],total:0});setError(failure.message || 'Items could not be loaded.');setSettled(signature);}})
        .finally(()=>{if(active) setLoading(false);});
    },JSON.parse(signature).q ? 250 : 0);
    return ()=>{active=false;clearTimeout(timer);abort.abort();};
  },[fetchPage,signature,revision,enabled]);
  useEffect(()=>{
    if(!enabled)return;
    const events=[INVENTORY_CHANGED,MODELS_CHANGED,'catalog:updated','focus'];
    events.forEach(event=>window.addEventListener(event,refresh));
    return ()=>events.forEach(event=>window.removeEventListener(event,refresh));
  },[enabled,refresh]);
  return {query,update,result,loading:enabled && (loading || settled!==signature),error,refresh};
}

export function useInventoryModels(enabled = true) {
  const [models,setModels] = useState([]),[revision,setRevision] = useState(0);
  const refresh = useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;const abort=new AbortController();
    getMotorcycleModels({signal:abort.signal}).then(rows=>{if(active)setModels(rows.filter(row=>row.status==='active'));}).catch(()=>{});
    return ()=>{active=false;abort.abort();};
  },[enabled,revision]);
  useEffect(()=>{
    if(!enabled)return;
    const events=[MODELS_CHANGED,'catalog:updated','focus'];events.forEach(event=>window.addEventListener(event,refresh));
    return ()=>events.forEach(event=>window.removeEventListener(event,refresh));
  },[enabled,refresh]);
  return models;
}
