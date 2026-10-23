import React, { useMemo } from 'react';
import { isRichTextHtml, parseRichText } from '../../utils/richText.js';

const renderNodes = (nodes, keyPrefix = 'n') => nodes.map((node, index) => {
  const key = `${keyPrefix}-${index}`;
  if (typeof node === 'string') return node;
  if (node.tag === 'br') return <br key={key} />;
  const children = renderNodes(node.children, key);
  if (node.tag === 'a') {
    return node.href
      ? <a key={key} href={node.href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
      : <span key={key}>{children}</span>;
  }
  return React.createElement(node.tag, { key }, children);
});

// Renders owner-authored rich text (bold, italic, headings, lists) as React elements,
// never as injected markup. Plain-text values keep their paragraph breaks.
const RichText = ({ value, fallback = null, className = '' }) => {
  const content = useMemo(() => {
    const text = String(value || '').trim();
    if (!text) return null;
    if (isRichTextHtml(text)) return renderNodes(parseRichText(text));
    return text.split(/\n{2,}/).map((paragraph, index) => (
      <p key={index} className="whitespace-pre-line">{paragraph}</p>
    ));
  }, [value]);

  if (!content || (Array.isArray(content) && content.length === 0)) return fallback;
  return <div className={`rich-text ${className}`}>{content}</div>;
};

export default RichText;
