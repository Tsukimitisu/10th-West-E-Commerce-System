let installPrompt;
let registration;
export function registerPosPwa() {
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  if (import.meta.env?.PROD && 'serviceWorker' in navigator) {
    // Keep a handled result so a failed registration is visible at preparation,
    // rather than leaving serviceWorker.ready pending indefinitely.
    registration = navigator.serviceWorker.register('/pos-sw.js').then(value => ({ value }), () => ({ error: true }));
  }
}
export async function promptPosInstall() {
  if (!installPrompt) return false;
  await installPrompt.prompt(); installPrompt=null;return true;
}
export async function waitForPosShell({ serviceWorker, secure, registered, timeoutMs = 20000 }) {
  if (!secure || !serviceWorker) throw new Error('Offline POS requires HTTPS and a current browser with offline app support.');
  let timer;
  try {
    await Promise.race([
      (async () => {
        const result = await registered;
        if (result?.error) throw new Error('Offline app registration failed. Stay online, reload this page and try again.');
        await serviceWorker.ready;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Offline app files are not ready yet. Stay online, reload this page and try again.')), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
export async function requirePosShell() {
  if (!import.meta.env?.PROD) return;
  await waitForPosShell({ serviceWorker: navigator.serviceWorker, secure: window.isSecureContext, registered: registration });
}
