import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRichText, richTextToPlainText, isRichTextHtml } from '../utils/richText.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('stored rich text keeps italic, bold, and heading structure', () => {
  assert.deepEqual(parseRichText('<h2>Fitment</h2><p>Fits <i>Mio</i> and <strong>Click</strong></p>'), [
    { tag: 'h2', children: ['Fitment'] },
    { tag: 'p', children: ['Fits ', { tag: 'i', children: ['Mio'] }, ' and ', { tag: 'strong', children: ['Click'] }] },
  ]);
  assert.deepEqual(parseRichText('<p><em>OEM</em><br>Line</p>'), [
    { tag: 'p', children: [{ tag: 'em', children: ['OEM'] }, { tag: 'br', children: [] }, 'Line'] },
  ]);
});

test('rich text parsing drops scripts, handlers, unknown tags, and unsafe links', () => {
  const nodes = parseRichText('<p onclick="x()">Safe<script>alert(1)</script><img src=x onerror=alert(1)><span>text</span></p><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>');
  assert.deepEqual(nodes, [
    { tag: 'p', children: ['Safe', 'text'] },
    { tag: 'a', href: null, children: ['bad'] },
    { tag: 'a', href: 'https://example.com', children: ['ok'] },
  ]);
  assert.deepEqual(parseRichText('<p>5 &lt; 6 &amp; &quot;OEM&quot;</p>'), [{ tag: 'p', children: ['5 < 6 & "OEM"'] }]);
});

test('plain-text previews never show raw HTML tags', () => {
  assert.equal(richTextToPlainText('<p>Brake <i>pad</i></p><ul><li>Front</li><li>Rear</li></ul>'), 'Brake pad Front Rear');
  assert.equal(richTextToPlainText('Plain &amp; simple'), 'Plain & simple');
  assert.equal(isRichTextHtml('5 < 6 and 7 > 3'), false);
});

test('product pages render descriptions as rich text instead of literal markup', async () => {
  const [detail, card, component] = await Promise.all([
    read('pages/ProductDetail.jsx'),
    read('components/ProductCard.jsx'),
    read('components/ui/RichText.jsx'),
  ]);
  assert.match(detail, /<RichText\s+value=\{product\.description\}/);
  assert.doesNotMatch(detail, /<p>\{product\.description \|\|/);
  assert.match(card, /richTextToPlainText\(product\.description\)/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
});

test('owner rich-text editor shows headings and italics on its light surface', async () => {
  const editor = await read('components/owner/RichTextEditor.jsx');
  assert.doesNotMatch(editor, /\[&_h2\]:text-white/);
  assert.match(editor, /\[&_h2\]:text-slate-900/);
  assert.match(editor, /\[&_em\]:italic/);
  assert.match(editor, /\[&_i\]:italic/);
  assert.match(editor, /execCommand\('styleWithCSS', false, false\)/);
  assert.match(editor, /aria-pressed=\{active\}/);
});
