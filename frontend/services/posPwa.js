let installPrompt;
export function registerPosPwa() {
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/pos-sw.js').catch(()=>{});
}
export async function promptPosInstall() {
  if (!installPrompt) return false;
  await installPrompt.prompt(); installPrompt=null;return true;
}
export async function requirePosShell() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) throw new Error('This browser cannot prepare the offline POS. Use a current secure browser.');
  await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline app files are not ready yet. Stay online and try again.')),20000))]);
}
