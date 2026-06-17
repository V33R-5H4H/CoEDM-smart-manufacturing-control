/**
 * useModal — shared hook for modal state + Escape key dismissal.
 *
 * Usage:
 *   const { activeModal, openModal, closeModal } = useModal();
 *
 *   // Open:  openModal("spindle")  or  flushSync(() => openModal("spindle"))
 *   // Close: closeModal()
 *   // Read:  activeModal === "spindle"
 *
 * The Escape key automatically calls closeModal() whenever a modal is open.
 * The listener is registered once and cleaned up on unmount.
 */
import { useState, useEffect, useCallback } from 'react';

export function useModal(initial = null) {
  const [activeModal, setActiveModal] = useState(initial);

  const openModal = useCallback((id) => {
    setActiveModal(id);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  // Global Escape key handler — active only when a modal is open
  useEffect(() => {
    if (!activeModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal]);

  return { activeModal, openModal, closeModal, setActiveModal };
}
