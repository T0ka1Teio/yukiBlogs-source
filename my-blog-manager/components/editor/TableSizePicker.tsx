"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Table2 } from 'lucide-react';
import {
  normalizeTableSize,
  TABLE_PICKER_LIMIT,
  type TableInsertChoice,
  type TableSize,
} from '../../lib/editorTable';
import EditorToolbarButton from './EditorToolbarButton';

type TableSizePickerProps = {
  active?: boolean;
  onInsert: (choice: TableInsertChoice) => void;
};

const DEFAULT_SIZE: TableSize = { rows: 3, cols: 3 };

export default function TableSizePicker({ active = false, onInsert }: TableSizePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<TableSize>(DEFAULT_SIZE);
  const [withHeaderRow, setWithHeaderRow] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const insert = (rows: number, cols: number) => {
    const size = normalizeTableSize(rows, cols);
    onInsert({ ...size, withHeaderRow });
    setPreview(DEFAULT_SIZE);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <EditorToolbarButton
        onClick={() => setIsOpen((value) => !value)}
        active={active || isOpen}
        title="插入表格"
        ariaLabel="选择表格行列数"
      >
        <Table2 size={16} />
      </EditorToolbarButton>

      {isOpen && (
        <div className="absolute left-0 top-full z-[120] mt-2 w-[292px] origin-top-left animate-in rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl fade-in zoom-in-95 dark:border-slate-700/70 dark:bg-slate-900/95">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-800 dark:text-slate-100">插入表格</p>
              <p className="mt-0.5 text-[10px] font-bold text-indigo-500">
                {preview.rows} × {preview.cols} 表格
              </p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-400 dark:bg-slate-800">
              最大 {TABLE_PICKER_LIMIT} × {TABLE_PICKER_LIMIT}
            </span>
          </div>

          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${TABLE_PICKER_LIMIT}, minmax(0, 1fr))` }}
            onMouseLeave={() => setPreview(DEFAULT_SIZE)}
          >
            {Array.from({ length: TABLE_PICKER_LIMIT * TABLE_PICKER_LIMIT }, (_, index) => {
              const row = Math.floor(index / TABLE_PICKER_LIMIT) + 1;
              const col = (index % TABLE_PICKER_LIMIT) + 1;
              const selected = row <= preview.rows && col <= preview.cols;

              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  aria-label={`插入 ${row} 行 ${col} 列表格`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setPreview({ rows: row, cols: col })}
                  onFocus={() => setPreview({ rows: row, cols: col })}
                  onClick={() => insert(row, col)}
                  className={`aspect-square rounded-[4px] border transition-colors duration-100 ${
                    selected
                      ? 'border-indigo-500 bg-indigo-500 shadow-sm shadow-indigo-500/20'
                      : 'border-slate-300 bg-white hover:border-indigo-300 dark:border-slate-600 dark:bg-slate-800'
                  }`}
                />
              );
            })}
          </div>

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setWithHeaderRow((value) => !value)}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-slate-100/80 px-3 py-2 text-[10px] font-black text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            首行作为标题
            <span className={`grid h-5 w-5 place-items-center rounded-md transition ${withHeaderRow ? 'bg-indigo-500 text-white' : 'bg-white text-transparent dark:bg-slate-900'}`}>
              <Check size={12} strokeWidth={3} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
