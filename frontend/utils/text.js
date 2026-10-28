const MOJIBAKE_REPLACEMENTS = [
  ['\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d', '—'],
  ['\u00e2\u20ac\u201d', '—'],
  ['\u00e2\u20ac\u201c', '–'],
  ['\u00e2\u20ac\u02dc', '‘'],
  ['\u00e2\u20ac\u2122', '’'],
  ['\u00e2\u20ac\u0153', '“'],
  ['\u00e2\u20ac\u009d', '”'],
  ['\u00e2\u201a\u00b1', '₱'],
  ['\u00c2\u00b7', '·'],
  ['\u00e2\u2020\u2019', '→'],
  ['\u00e2\u20ac\u00a6', '…'],
];

export const repairMojibake = (value) => {
  let text = String(value ?? '');
  for (const [broken, replacement] of MOJIBAKE_REPLACEMENTS) {
    text = text.replaceAll(broken, replacement);
  }
  return text.replaceAll('\uFFFD', '');
};
