import React, { useRef, useCallback } from 'react';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Minus, Undo2, Redo2 } from 'lucide-react';

const ToolButton = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={`p-1.5 rounded-md transition-colors ${
      active ? 'bg-red-500/20 text-orange-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
    }`}
  >
    {children}
  </button>
);

const RichTextEditor = ({ value, onChange, placeholder, minHeight = '300px' }) => {
  const editorRef = useRef(null);

  const exec = useCallback((command, val = null) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    if (onChange) {
      onChange(editorRef.current?.innerHTML || '');
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (onChange) {
      onChange(editorRef.current?.innerHTML || '');
    }
  }, [onChange]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const formatBlock = useCallback((tag) => {
    document.execCommand('formatBlock', false, tag);
    editorRef.current?.focus();
    if (onChange) {
      onChange(editorRef.current?.innerHTML || '');
    }
  }, [onChange]);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-red-300">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-900 border-b border-gray-700 flex-wrap">
        <ToolButton onClick={() => exec('bold')} title="Bold">
          <Bold size={15} />
        </ToolButton>
        <ToolButton onClick={() => exec('italic')} title="Italic">
          <Italic size={15} />
        </ToolButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolButton onClick={() => formatBlock('h2')} title="Heading">
          <Heading1 size={15} />
        </ToolButton>
        <ToolButton onClick={() => formatBlock('h3')} title="Subheading">
          <Heading2 size={15} />
        </ToolButton>
        <ToolButton onClick={() => formatBlock('p')} title="Normal text">
          <span className="text-xs font-semibold px-0.5">P</span>
        </ToolButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolButton onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <List size={15} />
        </ToolButton>
        <ToolButton onClick={() => exec('insertOrderedList')} title="Numbered list">
          <ListOrdered size={15} />
        </ToolButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

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

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        dangerouslySetInnerHTML={{ __html: value || '' }}
        data-placeholder={placeholder}
        className="px-3 py-2 text-sm text-gray-800 outline-none overflow-y-auto prose prose-sm max-w-none
          [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-400
          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-2
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_h3]:mb-1
          [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
          [&_li]:mb-1 [&_strong]:font-semibold [&_hr]:my-3 [&_hr]:border-gray-700"
        style={{ minHeight }}
      />
    </div>
  );
};

export default RichTextEditor;


