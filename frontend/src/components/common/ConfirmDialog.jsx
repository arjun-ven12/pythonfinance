import { useEffect } from "react";
import "./confirmDialog.css";

export default function ConfirmDialog({
  open = false,
  title = "Confirm action",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="confirm-dialog-layer" role="presentation">
      <button
        aria-label="Close dialog"
        className="confirm-dialog-backdrop"
        onClick={onCancel}
        type="button"
      />
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className={`confirm-dialog confirm-dialog--${tone}`}
        role="dialog"
      >
        <div className="confirm-dialog__header">
          <p className="eyebrow">Confirmation</p>
          <h3 id="confirm-dialog-title">{title}</h3>
        </div>
        <div className="confirm-dialog__body">
          {String(message || "")
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((block, index) => (
              <p key={`${index}-${block.slice(0, 24)}`}>{block}</p>
            ))}
        </div>
        <div className="confirm-dialog__footer">
          <button className="confirm-dialog__button is-secondary" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="confirm-dialog__button is-primary" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
