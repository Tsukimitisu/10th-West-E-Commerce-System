// Search text is data. Reject unmistakable script and SQL control syntax before
// the catalog's token normalization can turn it into an unrelated broad query.
export const isUnsafeProductSearch = (value) => {
  const text = String(value ?? '');
  return /<\s*\/?\s*script\b|javascript\s*:|\b(?:or|and)\s+\d+\s*=\s*\d+\b|--|\/\*|\*\/|;|[\u0000-\u001f\u007f]/i.test(text);
};

export const hasSearchableProductText = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]+/g, ' ')
  .split(/\s+/)
  .some((term) => term.length >= 2 && /[a-z0-9]/.test(term));
