export class ProviderError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', status = 502, provider = null, missing = [] } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.provider = provider;
    this.missing = missing;
  }
}

export const notConfigured = (provider, missing = []) => new ProviderError(
  `${provider} is not configured.`,
  { code: 'PROVIDER_NOT_CONFIGURED', status: 503, provider, missing }
);

export const notImplemented = (provider, operation) => new ProviderError(
  `${provider} ${operation} is not implemented because a verified provider API contract is not available.`,
  { code: 'PROVIDER_NOT_IMPLEMENTED', status: 501, provider }
);

export const mockBlocked = (provider) => new ProviderError(
  `${provider} cannot run in production.`,
  { code: 'MOCK_PROVIDER_BLOCKED', status: 503, provider }
);

export const upstreamFailure = (provider, operation, status = 502) => new ProviderError(
  `${provider} ${operation} failed.`,
  { code: 'PROVIDER_UPSTREAM_ERROR', status, provider }
);

export const publicProviderError = (error) => ({
  message: error?.message || 'Shipping provider request failed.',
  code: error?.code || 'PROVIDER_ERROR',
  provider: error?.provider || undefined,
});
