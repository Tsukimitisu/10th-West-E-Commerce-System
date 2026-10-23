import { normalizeApiUrl, validateProductionApiUrl } from '../api-url.js';

const configuredApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);

const getDevelopmentApiUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:5000/api';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:5000/api`;
};

export const API_URL = import.meta.env.PROD
  ? validateProductionApiUrl(configuredApiUrl)
  : configuredApiUrl || getDevelopmentApiUrl();

export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');
