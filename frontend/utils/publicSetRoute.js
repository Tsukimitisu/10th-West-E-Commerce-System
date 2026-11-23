// Shared public URLs use clean paths; the deployed app still uses HashRouter.
// Normalize before React mounts so a recipient opens the intended set.
export function bridgePublicSetRoute(location, history) {
  if (location.hash || !/^\/sets\/[1-9]\d*\/?$/.test(location.pathname)) return;
  history.replaceState(history.state, '', `/#${location.pathname.replace(/\/$/, '')}${location.search || ''}`);
}
