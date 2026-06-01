import React from 'react';
import '../pages/Assembly.css'; // Contains the .asm-safety-overlay and .asm-buzzer-ring styles

/**
 * Shared safety interrupt overlay used across machine pages (Assembly, ASRS).
 */
export default function SafetyOverlay({ isVisible, title, message, badgeText }) {
  if (!isVisible) return null;

  return (
    <>
      <div className="asm-buzzer-ring" />
      <div className="asm-safety-overlay" style={{ background: "rgba(0,0,0,0.92)", borderRadius: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          flexWrap: "wrap",
          padding: "2rem"
        }}>
          <div className="asm-safety-overlay__icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" />
              <circle cx="12" cy="17" r="0.5" fill="#ef4444" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
            <div className="asm-safety-overlay__title">
              {title || (
                <>SAFETY<br />INTERRUPT</>
              )}
            </div>
            <div className="asm-safety-overlay__sub" style={{ maxWidth: "420px", fontSize: "0.85rem", margin: 0 }}>
              {message}
            </div>
            <div className="asm-safety-overlay__badge">
              {badgeText}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
