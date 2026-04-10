/**
 * Lightweight WYSIWYG editor using native contentEditable + execCommand.
 * No external libraries. Toolbar: Bold, Italic, H2, H3, Bullet List, Link.
 */
import React, { useRef, useEffect, useCallback } from "react";
import { Bold, Italic, List, Link, Heading2 } from "lucide-react";

export default function WysiwygEditor({ value, onChange, placeholder = "Enter content...", minHeight = 240 }) {
  const editorRef = useRef(null);
  const isMounted = useRef(false);

  // Populate on mount only (avoid cursor jump)
  useEffect(() => {
    if (editorRef.current && !isMounted.current) {
      editorRef.current.innerHTML = value || "";
      isMounted.current = true;
    }
  }, []);

  // Re-sync when value changes externally (e.g. switching pages)
  useEffect(() => {
    if (editorRef.current && isMounted.current) {
      const current = editorRef.current.innerHTML;
      if (current !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
  }, [value]);

  const exec = useCallback((command, arg = null) => {
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    onChange(editorRef.current?.innerHTML || "");
  }, [onChange]);

  const handleInput = () => onChange(editorRef.current?.innerHTML || "");

  const handleLink = (e) => {
    e.preventDefault();
    const url = window.prompt("Enter URL (e.g. https://example.com):");
    if (url) exec("createLink", url);
  };

  const tools = [
    { icon: Bold,     cmd: "bold",                  title: "Bold" },
    { icon: Italic,   cmd: "italic",                title: "Italic" },
    { icon: Heading2, cmd: "formatBlock", arg: "h2",title: "Heading 2" },
    { icon: List,     cmd: "insertUnorderedList",   title: "Bullet list" },
  ];

  return (
    <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden focus-within:border-[#0000FF] transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        {tools.map(({ icon: Icon, cmd, arg, title }) => (
          <button
            key={cmd + (arg || "")}
            type="button"
            onMouseDown={e => { e.preventDefault(); exec(cmd, arg || null); }}
            title={title}
            className="p-1.5 rounded text-slate-500 hover:text-[#0000FF] hover:bg-white dark:hover:bg-slate-700 transition-colors"
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
        <button
          type="button"
          onMouseDown={handleLink}
          title="Insert link"
          className="p-1.5 rounded text-slate-500 hover:text-[#0000FF] hover:bg-white dark:hover:bg-slate-700 transition-colors"
        >
          <Link className="w-4 h-4" />
        </button>
        <div className="ml-auto text-xs text-slate-400 pr-1 select-none">WYSIWYG</div>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
        className="px-4 py-3 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none
                   prose prose-sm dark:prose-invert max-w-none
                   empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
        style={{ minHeight }}
      />
    </div>
  );
}
