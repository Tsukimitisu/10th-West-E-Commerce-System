export const getLoginSubmissionErrorMessage = (error) => {
  const code = String(error?.code || '').toUpperCase();
  if (code.startsWith('CSRF_') || /csrf/i.test(error?.message || '')) {
    return 'Your session expired. Please refresh and try again.';
  }
  if (code === 'DATABASE_UNAVAILABLE' || Number(error?.status) === 503) {
    return 'The service is temporarily unavailable. Please try again later.';
  }
  return error?.message || 'Invalid email or password';
};
