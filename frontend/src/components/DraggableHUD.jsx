import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function DraggableHUD({ id, defaultPosition = { x: 32, y: 32 }, boundsRef, children }) {
  const hudRef = useRef(null);

  const getSavedPosition = useCallback(() => {
    try {
      const saved = localStorage.getItem(`hud_pos_${id}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error reading HUD position', e);
    }
    return defaultPosition;
  }, [id, defaultPosition]);

  const [position, setPosition] = useState(getSavedPosition);
  const [isDragging, setIsDragging] = useState(false);

  // Clamp position so the HUD never goes outside the bounds container
  const clampToBounds = useCallback((pos) => {
    if (!boundsRef?.current || !hudRef?.current) return pos;
    const parent = boundsRef.current.getBoundingClientRect();
    const hud    = hudRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max(pos.x, 0), parent.width  - hud.width),
      y: Math.min(Math.max(pos.y, 0), parent.height - hud.height),
    };
  }, [boundsRef]);

  // After mount / on resize, snap back inside if the saved position is out of bounds
  useEffect(() => {
    const snap = () => {
      setPosition(prev => clampToBounds(prev));
    };
    // Small delay so the DOM has rendered and getBoundingClientRect is accurate
    const timer = setTimeout(snap, 50);
    window.addEventListener('resize', snap);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', snap);
    };
  }, [clampToBounds]);

  const handleDragEnd = useCallback((_event, info) => {
    setIsDragging(false);
    const raw = { x: position.x + info.offset.x, y: position.y + info.offset.y };
    const clamped = clampToBounds(raw);
    setPosition(clamped);
    try {
      localStorage.setItem(`hud_pos_${id}`, JSON.stringify(clamped));
    } catch (e) {
      console.error('Error saving HUD position', e);
    }
  }, [id, position, clampToBounds]);

  return (
    <motion.div
      ref={hudRef}
      drag
      // Let framer-motion also enforce the same boundary
      dragConstraints={boundsRef}
      dragElastic={0}
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      animate={position}
      transition={{ type: 'tween', duration: 0 }}
      style={{
        position: 'absolute',   // stays inside the machine-view box
        top: 0,
        left: 0,
        zIndex: isDragging ? 50 : 10,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div style={{ pointerEvents: isDragging ? 'none' : 'auto' }}>
        {children}
      </div>
    </motion.div>
  );
}
