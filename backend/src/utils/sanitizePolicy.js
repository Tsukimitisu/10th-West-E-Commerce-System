import sanitizeHtml from 'sanitize-html';

const POLICY_HTML_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'ul', 'ol', 'li', 'hr', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

// Apply on write and on read so older rows receive the same protection.
export const sanitizePolicyContent = (value) => sanitizeHtml(String(value ?? ''), POLICY_HTML_OPTIONS);

export const sanitizePolicyRow = (row) => ({
  ...row,
  content: sanitizePolicyContent(row.content),
});
