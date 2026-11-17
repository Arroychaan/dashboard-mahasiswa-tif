"use client";

import { useEffect, useId } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isPending?: boolean;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  variant = "danger",
  isPending = false,
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const checkboxId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isPending, onCancel]);

  if (!open) return null;

  const isConfirmDisabled =
    isPending || Boolean(checkboxLabel && !checkboxChecked);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
        <h3 id={titleId} className="text-lg font-bold text-slate-900">
          {title}
        </h3>
        <p id={descId} className="mt-2 text-sm text-slate-700">
          {description}
        </p>

        {checkboxLabel && onCheckboxChange && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <label
              htmlFor={checkboxId}
              className="flex items-start gap-2.5 text-sm font-medium text-amber-950"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={checkboxChecked}
                onChange={(e) => onCheckboxChange(e.target.checked)}
                disabled={isPending}
                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-blue-800 focus:ring-blue-800"
              />
              <span>{checkboxLabel}</span>
            </label>
          </div>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-950"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={`inline-flex min-h-[44px] items-center rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-50 ${
              variant === "danger"
                ? "bg-red-700 hover:bg-red-800"
                : "bg-blue-800 hover:bg-blue-900"
            }`}
          >
            {isPending ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

