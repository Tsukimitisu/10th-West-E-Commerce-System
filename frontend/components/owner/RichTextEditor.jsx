import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Minus, Undo2, Redo2 } from 'lucide-react';

const ToolButton = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
      active ? 'bg-orange-100 text-orange-800' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden="true" />;

const RichTextEditor = ({ value, onChange, placeholder, minHeight = '300px' }) => {
  const editorRef = useRef(null);
  const lastEmittedHtmlRef = useRef('');
  const [formats, setFormats] = useState({ bold: false, italic: false });

  // Do not reapply innerHTML for parent updates caused by this editor. Doing so
  // resets the browser selection and its native undo/redo history.
  React.useEffect(() => {
    const nextHtml = value || '';
    if (!editorRef.current || nextHtml === lastEmittedHtmlRef.current) return;
    if (editorRef.current.innerHTML !== nextHtml) editorRef.current.innerHTML = nextHtml;
    lastEmittedHtmlRef.current = nextHtml;
  }, [value]);

  useEffect(() => {
    const syncFormats = () => {
      const anchor = document.getSelection()?.anchorNode;
      if (!anchor || !editorRef.current?.contains(anchor)) return;
      setFormats({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic') });
    };
    document.addEventListener('selectionchange', syncFormats);
    return () => document.removeEventListener('selectionchange', syncFormats);
  }, []);

  const emitChange = useCallback(() => {
    const html = editorRef.current?.innerHTML || '';
    lastEmittedHtmlRef.current = html;
    onChange?.(html);
  }, [onChange]);

  const exec = useCallback((command, val = null) => {
    // Emit semantic <b>/<i> tags rather than inline styles: the server's rich-text
    // allow-list strips `style`, so CSS-based italics would not persist after saving.
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    emitChange();
  }, [emitChange]);

  const handleInput = useCallback(() => emitChange(), [emitChange]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitChange();
  }, [emitChange]);

  const formatBlock = useCallback((tag) => {
    document.execCommand('formatBlock', false, tag);
    editorRef.current?.focus();
    emitChange();
  }, [emitChange]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1" role="toolbar" aria-label="Formatting">
        <ToolButton onClick={() => exec('bold')} active={formats.bold} title="Bold">
          <Bold size={15} />
        </ToolButton>
        <ToolButton onClick={() => exec('italic')} active={formats.italic} title="Italic">
          <Italic size={15} />
        </ToolButton>

        <Divider />

        <ToolButton onClick={() => formatBlock('h2')} title="Heading">
          <Heading1 size={15} />
        </ToolButton>
        <ToolButton onClick={() => formatBlock('h3')} title="Subheading">
          <Heading2 size={15} />
        </ToolButton>
        <ToolButton onClick={() => formatBlock('p')} title="Normal text">
          <span className="px-0.5 text-xs font-semibold">P</span>
        </ToolButton>

        <Divider />

        <ToolButton onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <List size={15} />
        </ToolButton>
        <ToolButton onClick={() => exec('insertOrderedList')} title="Numbered list">
          <ListOrdered size={15} />
        </ToolButton>

        <Divider />

        <ToolButton onClick={() => exec('insertHorizontalRule')} title="Divider">
          <Minus size={15} />
        </ToolButton>
        <ToolButton onClick={() => exec('undo')} title="Undo">
          <Undo2 size={15} />
        </ToolButton>
        <ToolButton onClick={() => exec('redo')} title="Redo">
          <Redo2 size={15} />
        </ToolButton>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || 'Rich text editor'}
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className="max-w-none overflow-y-auto px-3 py-2 text-sm leading-6 text-slate-800 outline-none
          [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)]
          [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900
          [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900
          [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1
          [&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic [&_hr]:my-3 [&_hr]:border-slate-200"
        style={{ minHeight }}
      />
    </div>
  );
};

export default RichTextEditor;
