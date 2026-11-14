export const checkPosBackend = async ({ fetcher=fetch,online=navigator.onLine,url }={}) => {
  if (!online) return false;
  try {
    const response=await fetcher(url,{ credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000) });
    return response.ok && (await response.json()).status?.toUpperCase()==='OK';
  } catch { return false; }
};
