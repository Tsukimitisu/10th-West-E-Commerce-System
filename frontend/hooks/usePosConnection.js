import { useCallback,useEffect,useRef,useState } from 'react';
import { API_URL } from '../services/apiConfig.js';
import { checkPosBackend } from '../services/posReachability.js';
export default function usePosConnection() {
  const [online,setOnline]=useState(null);
  const checking=useRef(null);
  const mounted=useRef(false);
  const check=useCallback(()=>{
    if (!checking.current) checking.current=checkPosBackend({url:`${API_URL}/health`}).then(value=>{ if (mounted.current) setOnline(value); return value; }).finally(()=>{ checking.current=null; });
    return checking.current;
  },[]);
  useEffect(()=>{
    mounted.current=true;
    const disconnected=()=>setOnline(false);
    void check();
    const interval=setInterval(check,20000);
    window.addEventListener('online',check); window.addEventListener('focus',check); window.addEventListener('offline',disconnected);
    return ()=>{ mounted.current=false; clearInterval(interval); window.removeEventListener('online',check);window.removeEventListener('focus',check);window.removeEventListener('offline',disconnected); };
  },[check]);
  return { online,check };
}
