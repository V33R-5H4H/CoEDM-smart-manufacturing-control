import React, { useEffect, useRef, useState } from 'react';

/**
 * Custom tutorial overlay — no third-party library.
 * Renders a dark backdrop with a spotlight cutout over the target element,
 * and a tooltip positioned relative to that element.
 *
 * Steps shape: Array<{ targetId, title, content, placement?, waitForClick? }>
 *   placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
 *   waitForClick: if true, hides Next and shows a "click to continue" prompt.
 *                 Parent advances via advanceRef.current().
 */
function TutorialOverlay({ steps, onFinish, advanceRef }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Measure the target element; re-measure on resize / scroll
  useEffect(() => {
    if (!step) return;

    const measure = () => {
      const el = document.getElementById(step.targetId);
      if (el) setRect(el.getBoundingClientRect());
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [stepIndex, step]);

  // Expose advance() to parent so it can push past waitForClick steps
  useEffect(() => {
    if (!advanceRef) return;
    advanceRef.current = () => {
      setStepIndex(prev => {
        const next = prev + 1;
        if (next >= steps.length) { onFinish(); return prev; }
        return next;
      });
    };
  }, [advanceRef, steps.length, onFinish]);

  const handleNext = () => { isLast ? onFinish() : setStepIndex(i => i + 1); };
  const handleSkip = () => onFinish();

  if (!step || !rect) return null;

  const PAD = 8;
  const spotX = rect.left - PAD;
  const spotY = rect.top - PAD;
  const spotW = rect.width + PAD * 2;
  const spotH = rect.height + PAD * 2;

  const TOOLTIP_W = 340;
  const OFFSET = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Determine if the spotlight is so wide/tall that side placement won't fit.
  // In that case fall back to a fixed top-center position so the tooltip is
  // always visible regardless of how large the target element is.
  const placement = step.placement || 'bottom';
  const tooWideForRight = spotX + spotW + OFFSET + TOOLTIP_W > vw - 8;
  const tooWideForLeft  = spotX - OFFSET - TOOLTIP_W < 8;
  const useCenterFallback =
    placement === 'right' && tooWideForRight && tooWideForLeft;

  let top, left;

  if (useCenterFallback) {
    // Pin tooltip to top-center of viewport, above the spotlight
    top  = Math.max(8, spotY - OFFSET - 200);
    left = Math.max(8, Math.min(vw / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 8));
    // If spotlight starts near the top, put tooltip below instead
    if (top < 60) top = spotY + spotH + OFFSET;
  } else if (placement === 'bottom') {
    top  = spotY + spotH + OFFSET;
    left = Math.max(8, Math.min(spotX + spotW / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 8));
  } else if (placement === 'top') {
    top  = Math.max(8, spotY - OFFSET - 200);
    left = Math.max(8, Math.min(spotX + spotW / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 8));
  } else if (placement === 'right') {
    top  = Math.max(8, Math.min(spotY + spotH / 2 - 100, vh - 220));
    left = spotX + spotW + OFFSET;
  } else if (placement === 'left') {
    top  = Math.max(8, Math.min(spotY + spotH / 2 - 100, vh - 220));
    left = spotX - TOOLTIP_W - OFFSET;
    if (left < 8) left = spotX + spotW + OFFSET; // flip right if no room
  } else {
    // 'center' — fixed center of screen
    top  = vh / 2 - 100;
    left = vw / 2 - TOOLTIP_W / 2;
  }

  // Final clamp so tooltip never goes off-screen
  top  = Math.max(8, Math.min(top,  vh - 240));
  left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));

  const tooltipStyle = {
    position: 'fixed',
    top,
    left,
    width: `${TOOLTIP_W}px`,
    zIndex: 1000001,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--primary)',
    borderRadius: '10px',
    padding: '18px 20px',
    boxShadow: 'var(--shadow-xl)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans, sans-serif)',
  };

  return (
    <>
      {/* Pulse keyframe for the touch_app icon */}
      <style>{`
        @keyframes tut-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.55; transform: scale(1.18); }
        }
      `}</style>

      {/* Dark overlay with spotlight hole */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1000000,
          pointerEvents: 'none',
        }}
      >
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect x={spotX} y={spotY} width={spotW} height={spotH} rx="6" fill="black" />
          </mask>
        </defs>
        {/* Dimmed backdrop */}
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="var(--overlay)"
          mask="url(#tutorial-spotlight-mask)"
        />
        {/* Spotlight border glow */}
        <rect
          x={spotX} y={spotY} width={spotW} height={spotH}
          rx="6" fill="none"
          stroke="var(--primary)" strokeWidth="2"
        />
      </svg>

      {/* Tooltip card */}
      <div ref={tooltipRef} style={tooltipStyle}>

        {/* Header row: step counter + skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--primary)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            STEP {stepIndex + 1} / {steps.length}
          </span>
          <button
            onClick={handleSkip}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontWeight: 600, padding: '2px 6px', borderRadius: '3px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            SKIP
          </button>
        </div>

        {/* Title */}
        {step.title && (
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {step.title}
          </div>
        )}

        {/* Body */}
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '14px' }}>
          {step.content}
        </div>

        {/* Footer */}
        {step.waitForClick ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--bg-hover)', border: '1px solid var(--primary)',
            borderRadius: '6px', padding: '8px 12px',
          }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '18px', color: 'var(--primary)', animation: 'tut-pulse 1.4s ease-in-out infinite' }}
            >
              touch_app
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>
              CLICK ANY BOX TO CONTINUE
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleNext}
              style={{
                background: 'var(--primary)', color: 'var(--bg-elevated)', border: 'none',
                borderRadius: '5px', padding: '8px 20px',
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
            >
              {isLast ? 'FINISH ✓' : 'NEXT →'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default TutorialOverlay;
