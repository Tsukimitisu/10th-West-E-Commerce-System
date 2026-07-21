import sanitizeHtml from 'sanitize-html';

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;
const MULTI_SPACE_REGEX = /\s{2,}/g;
const MULTI_NEWLINE_REGEX = /\n{3,}/g;

const normalizeWhitespace = (value, { allowNewlines = false } = {}) => {
  const text = String(value || '').replace(CONTROL_CHARS_REGEX, '');
  if (allowNewlines) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, ' ')
      .replace(MULTI_SPACE_REGEX, ' ')
      .replace(MULTI_NEWLINE_REGEX, '\n\n')
      .trim();
  }

  return text
    .replace(/\s+/g, ' ')
    .trim();
};

export const sanitizePlainText = (value, { maxLength = 255, allowNewlines = false } = {}) => {
  if (value === undefined || value === null) return null;

  const cleaned = sanitizeHtml(String(value), {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });

  const normalized = normalizeWhitespace(cleaned, { allowNewlines });
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const RICH_TEXT_ALLOWED_TAGS = [
  'p', 'br',
  'strong', 'b',
  'em', 'i', 'u',
  'ul', 'ol', 'li',
  'blockquote',
  'h2', 'h3', 'h4',
  'a',
];

const RICH_TEXT_ALLOWED_ATTRIBUTES = {
  a: ['href', 'target', 'rel'],
};

export const sanitizeRichText = (value, { maxLength = 10000 } = {}) => {
  if (value === undefined || value === null) return null;

  const cleaned = sanitizeHtml(String(value), {
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
    allowedAttributes: RICH_TEXT_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => {
        const href = String(attribs?.href || '').trim();
        const isSafeHref = /^(https?:|mailto:)/i.test(href);

        if (!isSafeHref) {
          return { tagName: 'span', attribs: {} };
        }

        return {
          tagName,
          attribs: {
            href,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        };
      },
    },
  }).trim();

  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
};

export const sanitizeHttpUrlOrPath = (value, { maxLength = 500 } = {}) => {
  const text = sanitizePlainText(value, { maxLength, allowNewlines: false });
  if (!text) return null;

  if (text.startsWith('/')) {
    return text.slice(0, maxLength);
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString().slice(0, maxLength);
  } catch {
    return null;
  }
};

export const sanitizeUrlArray = (value, { maxItems = 9, maxLength = 500 } = {}) => {
  if (!Array.isArray(value)) return [];

  const deduped = new Set();
  const sanitized = [];

  for (const item of value) {
    const cleanUrl = sanitizeHttpUrlOrPath(item, { maxLength });
    if (!cleanUrl || deduped.has(cleanUrl)) continue;
    deduped.add(cleanUrl);
    sanitized.push(cleanUrl);
    if (sanitized.length >= maxItems) break;
  }

  return sanitized;
};
