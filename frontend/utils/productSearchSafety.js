export const isUnsafeProductSearch = (value) => {
  const text = String(value ?? '');
  return /<\s*\/?\s*script\b|javascript\s*:|\b(?:or|and)\s+\d+\s*=\s*\d+\b|--|\/\*|\*\/|;|[\u0000-\u001f\u007f]/i.test(text);
};
