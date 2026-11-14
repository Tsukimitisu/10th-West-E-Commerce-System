export const protectPrivateFiles = (req, res, next) => {
  let pathname = String(req.path || req.url || '').split('?')[0];
  try {
    for (let pass = 0; pass < 2; pass++) pathname = decodeURIComponent(pathname);
  } catch { return res.status(400).json({ message: 'Invalid request path.' }); }
  const parts = pathname.replaceAll('\\', '/').toLowerCase().split('/');
  const privatePath = parts.some(part => (part.startsWith('.') && part !== '.well-known')
    || /(?:^credentials|^package(?:-lock)?\.json$|\.(?:pem|key|p12|pfx|dump|enc|sql|bak|log|map)$)/.test(part))
    || /^\/(?:src|scripts|node_modules|backend|frontend)(?:\/|$)/.test(parts.join('/'))
    || (parts[1] === 'uploads' && /\.(?:html?|[cm]?js|svg)$/.test(parts.at(-1)));
  if (privatePath) return res.status(404).json({ message: 'Route not found' });
  return next();
};
