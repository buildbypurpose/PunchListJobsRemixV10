import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Check } from "lucide-react";

/**
 * TradeSelect — grouped Category > Trade selector.
 *
 * Props:
 *   grouped    [{id, name, trades:[{id,name}]}]
 *   value      string (single) | string[] (multiple)
 *   onChange   (value) => void
 *   multiple   bool  (default false)
 *   placeholder string
 *   required   bool
 *   data-testid string
 *   className  string
 */
export default function TradeSelect({
  grouped = [],
  value,
  onChange,
  multiple = false,
  placeholder = "Select a trade",
  required = false,
  "data-testid": testId,
  className = "",
}) {
  // ── All hooks must be called unconditionally ──────────────────────────────
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!multiple) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [multiple]);

  // ── Single mode: native <select> with <optgroup> ──────────────────────────
  if (!multiple) {
    return (
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        required={required}
        data-testid={testId}
        className={`w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#0000FF] dark:bg-slate-800 dark:text-white ${className}`}
      >
        <option value="">{placeholder}</option>
        {grouped.map(cat => (
          <optgroup key={cat.id} label={cat.name}>
            {(cat.trades || []).map(t => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }

  // ── Multi mode: custom popover with grouped checkboxes ────────────────────
  const selected = Array.isArray(value) ? value : [];

  const toggle = (tradeName) => {
    if (selected.includes(tradeName)) {
      onChange(selected.filter(s => s !== tradeName));
    } else {
      onChange([...selected, tradeName]);
    }
  };

  const filtered = search.trim()
    ? grouped.map(cat => ({
        ...cat,
        trades: (cat.trades || []).filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
      })).filter(cat => cat.trades.length > 0)
    : grouped;

  return (
    <div ref={ref} className={`relative ${className}`} data-testid={testId}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-left focus:outline-none focus:border-[#0000FF]"
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span className={selected.length ? "text-slate-800 dark:text-white" : "text-slate-400"}>
          {selected.length === 0
            ? placeholder
            : selected.length === 1
            ? selected[0]
            : `${selected.length} trades selected`}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selected.map(s => (
            <span key={s}
              className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/50 text-[#0000FF] dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-semibold">
              {s}
              <button type="button" onClick={() => toggle(s)} className="hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-72 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search trades..."
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent dark:text-white focus:outline-none focus:border-[#0000FF]"
              data-testid={testId ? `${testId}-search` : undefined}
              autoFocus
            />
          </div>

          {/* Groups */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No trades found</p>
            )}
            {filtered.map(cat => (
              <div key={cat.id}>
                <div className="px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 sticky top-0">
                  {cat.name}
                </div>
                {cat.trades.map(t => {
                  const checked = selected.includes(t.name);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.name)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors ${checked ? "text-[#0000FF] dark:text-blue-300 font-semibold" : "text-slate-700 dark:text-slate-300"}`}
                      data-testid={testId ? `${testId}-option-${t.name.toLowerCase().replace(/\s+/g, "-")}` : undefined}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "bg-[#0000FF] border-[#0000FF]" : "border-slate-300 dark:border-slate-600"}`}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
