import { useState, useEffect } from "react";

function ConfirmModal({ isOpen, onClose, onConfirm, title = "Confirm Delete" }) {
  const [confirmText, setConfirmText] = useState("");
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    // Reset state when modal opens
    if (isOpen) {
      setConfirmText("");
      setIsValid(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleConfirmTextChange = (e) => {
    const value = e.target.value;
    setConfirmText(value);
    setIsValid(value.trim() === "CONFIRM");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isValid) {
      onConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button 
            className="modal-close" 
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
            This action cannot be undone. Please type{" "}
            <strong style={{ color: 'var(--text-primary)' }}>CONFIRM</strong> to proceed.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={confirmText}
              onChange={handleConfirmTextChange}
              placeholder="Type CONFIRM here"
              className="form-input"
              autoFocus
              style={{ marginBottom: '1.5rem' }}
            />
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-error"
                disabled={!isValid}
              >
                Delete
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
