'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ENV_PATH = path.join(BACKEND_ROOT, '.env');
const BACKEND_ENV_LABEL = 'backend/.env';
const PROCESS_ENV_SOURCE = 'process.env';
const BACKEND_ENV_SOURCE = 'backend/.env';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

class BackendEnvironmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackendEnvironmentError';
    this.code = code;
  }
}

const parseBackendEnvironmentFile = (envPath = BACKEND_ENV_PATH) => {
  try {
    return dotenv.parse(fs.readFileSync(envPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw new BackendEnvironmentError(
      'BACKEND_ENV_READ_FAILED',
      'Unable to read the backend environment file.'
    );
  }
};

const mergeBackendEnvironment = ({ processEnv, fileEnv = {} }) => {
  const target = processEnv || {};
  const sources = Object.create(null);

  for (const key of Object.keys(target)) {
    if (target[key] !== undefined) sources[key] = PROCESS_ENV_SOURCE;
  }

  for (const [key, value] of Object.entries(fileEnv)) {
    if (target[key] === undefined) {
      target[key] = value;
      sources[key] = BACKEND_ENV_SOURCE;
    } else if (!hasOwn(sources, key)) {
      sources[key] = PROCESS_ENV_SOURCE;
    }
  }

  return {
    env: target,
    sources,
  };
};

const loadBackendEnvironment = ({
  processEnv = process.env,
  envPath = BACKEND_ENV_PATH,
} = {}) => {
  const fileEnv = parseBackendEnvironmentFile(envPath);
  const merged = mergeBackendEnvironment({ processEnv, fileEnv });

  return {
    ...merged,
    envPath,
    envFilePresent: fs.existsSync(envPath),
  };
};

const loadedBackendEnvironment = loadBackendEnvironment();

module.exports = {
  BACKEND_ROOT,
  BACKEND_ENV_PATH,
  BACKEND_ENV_LABEL,
  BACKEND_ENV_SOURCE,
  PROCESS_ENV_SOURCE,
  BackendEnvironmentError,
  parseBackendEnvironmentFile,
  mergeBackendEnvironment,
  loadBackendEnvironment,
  loadedBackendEnvironment,
};
