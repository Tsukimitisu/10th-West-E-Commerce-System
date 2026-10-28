// Parses owner-authored rich text (sanitized server-side with the same allow-list)
// into a plain tree that React renders as elements. Nothing is ever injected as raw
// HTML: unknown tags are unwrapped to their text, attributes are dropped except a
// validated href on links, and text is entity-decoded and escaped by React.

export const RICH_TEXT_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'a',
]);
const VOID_TAGS = new Set(['br']);
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript']);
const SAFE_HREF = /^(https?:|mailto:)/i;
const TOKEN = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const HAS_TAG = /<\/?[a-zA-Z][^>]*>/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'" };

export const decodeEntities = (value = '') => String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, code) => {
  const key = code.toLowerCase();
  if (ENTITIES[key] !== undefined) return ENTITIES[key];
  if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16) || 0xfffd);
  if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)) || 0xfffd);
  return match;
});

const readHref = (attributes) => {
  const match = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes || '');
  const href = decodeEntities(match ? (match[2] ?? match[3] ?? match[4] ?? '') : '').trim();
  return SAFE_HREF.test(href) ? href : null;
};

export const isRichTextHtml = (value) => HAS_TAG.test(String(value || ''));

export const parseRichText = (html = '') => {
  const source = String(html || '');
  const root = { tag: 'root', children: [] };
  const stack = [root];
  let dropDepth = 0;
  let cursor = 0;

  const pushText = (text) => {
    if (!text || dropDepth > 0) return;
    const decoded = decodeEntities(text);
    if (decoded) stack[stack.length - 1].children.push(decoded);
  };

  for (const match of source.matchAll(TOKEN)) {
    pushText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const tag = match[1]?.toLowerCase();
    if (!tag) continue;
    const closing = match[0].startsWith('</');

    if (DROP_CONTENT_TAGS.has(tag)) {
      dropDepth = Math.max(0, dropDepth + (closing ? -1 : 1));
      continue;
    }
    if (dropDepth > 0 || !RICH_TEXT_TAGS.has(tag)) continue;

    if (closing) {
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }

    const node = { tag, children: [] };
    if (tag === 'a') node.href = readHref(match[2]);
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(tag) && !match[0].endsWith('/>')) stack.push(node);
  }
  pushText(source.slice(cursor));
  return root.children;
};

const BLOCK_TAGS = new Set(['p', 'li', 'blockquote', 'h2', 'h3', 'h4', 'br']);

export const richTextToPlainText = (html = '') => {
  if (!isRichTextHtml(html)) return decodeEntities(html).trim();
  const walk = (nodes) => nodes.map((node) => {
    if (typeof node === 'string') return node;
    const inner = walk(node.children);
    return BLOCK_TAGS.has(node.tag) ? ` ${inner} ` : inner;
  }).join('');
  return walk(parseRichText(html)).replace(/\s+/g, ' ').trim();
};
