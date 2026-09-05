// Read-only smoke checks. Never follow provider redirects or print their state.
const checks = [
  ['Frontend', 'http://localhost:5173/', 200],
  ['Backend', 'http://localhost:5000/', 200],
  ['Health', 'http://localhost:5000/api/health', 200],
  ['Database readiness', 'http://localhost:5000/api/ready', 200],
  ['Providers', 'http://localhost:5000/api/auth/providers', 200],
  ['Google start', 'http://localhost:5000/api/auth/google', 302],
  ['Facebook start', 'http://localhost:5000/api/auth/facebook', 302],
];
for (const [name, url, status] of checks) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status !== status) throw new Error();
    console.log(`PASS ${name}: HTTP ${status}`);
  } catch {
    console.error(`FAIL ${name}. Run npm run dev from the project root and check its terminal.`);
    process.exitCode = 1;
  }
}
