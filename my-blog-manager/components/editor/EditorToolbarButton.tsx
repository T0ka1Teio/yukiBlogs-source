"use client";

import type { MouseEventHandler, ReactNode } from 'react';

type EditorToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
};

export default function EditorToolbarButton({
  onClick,
  active = false,
  children,
  title,
  ariaLabel,
}: EditorToolbarButtonProps) {
  const preserveEditorSelection: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (event.button === 0) event.preventDefault();
  };

  return (
    <button
      type="button"
      onMouseDown={preserveEditorSelection}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      aria-pressed={active}
      className={`flex items-center justify-center rounded-xl p-2.5 transition-all duration-300 ease-out ${
        active
          ? 'scale-110 bg-indigo-500 text-white shadow-md shadow-indigo-500/40'
          : 'text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
      }`}
    >
      {children}
    </button>
  );
}
