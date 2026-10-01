import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const credentialFile = path.resolve(directory, '..', '..', 'backend', '.test-credentials.local');
const credentialNamePattern = /^(?:TEST_FIXTURE_PASSWORD|E2E_[A-Z0-9_]+_(?:EMAIL|PASSWORD|TOTP))$/;
const fixtureRoles = Object.freeze([
  'CUSTOMER',
  'CUSTOMER_ALT',
  'CASHIER',
  'STAFF_NO_PERMS',
  'STAFF',
  'OWNER',
  'SUPERADMIN',
  'DISABLED',
]);

const decodeValue = (rawValue, lineNumber) => {
  const value = rawValue.trim();
  if (!value) return '';

  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Invalid quoted fixture credential on line ${lineNumber}.`);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
};

const readCredentialFile = () => {
  if (!fs.existsSync(credentialFile)) return {};

  const credentials = {};
  const lines = fs.readFileSync(credentialFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const match = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=(.*)$/);
    if (!match) throw new Error(`Invalid fixture credential declaration on line ${index + 1}.`);

    const [, name, rawValue] = match;
    if (!credentialNamePattern.test(name)) return;
    credentials[name] = decodeValue(rawValue, index + 1);
  });

  return credentials;
};

export const loadFixtureEnvironment = () => {
  const credentials = readCredentialFile();
  for (const [name, value] of Object.entries(credentials)) {
    if (process.env[name] === undefined) process.env[name] = value;
  }

  // Preserve compatibility with credential files created before the env name
  // was standardized to STAFF_NO_PERMS.
  if (!process.env.E2E_STAFF_NO_PERMS_EMAIL && process.env.E2E_STAFFNOPERMS_EMAIL) {
    process.env.E2E_STAFF_NO_PERMS_EMAIL = process.env.E2E_STAFFNOPERMS_EMAIL;
  }

  const sharedPassword = process.env.TEST_FIXTURE_PASSWORD;
  if (sharedPassword) {
    for (const role of fixtureRoles) {
      const passwordName = `E2E_${role}_PASSWORD`;
      if (!process.env[passwordName]) process.env[passwordName] = sharedPassword;
    }
  }
};
