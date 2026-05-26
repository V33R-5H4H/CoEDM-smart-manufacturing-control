import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

export default function DraggableHUD({ id, defaultPosition = { x: 32, y: 32 }, boundsRef, children }) {
  // Load saved position from localStorage
  const getSavedPosition = () => {
    try {
      const saved = localStorage.getItem(`hud_pos_${id}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error reading localStorage", e);
    }
    return defaultPosition;
  };

  const [position, setPosition] = useState(getSavedPosition);
  const [isDragging, setIsDragging] = useState(false);

  // Update localStorage when drag ends
  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    // info.point is absolute screen coordinate, info.offset is relative to start of drag
    // But since we are updating `position` manually, we just accumulate the offset.
    const newPos = { 
      x: position.x + info.offset.x, 
      y: position.y + info.offset.y 
    };
    setPosition(newPos);
    try {
      localStorage.setItem(`hud_pos_${id}`, JSON.stringify(newPos));
    } catch (e) {
      console.error("Error saving to localStorage", e);
    }
  };

  return (
    <motion.div
      drag
      dragConstraints={boundsRef}
      dragElastic={0}
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      initial={position}
      animate={position}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: isDragging ? 50 : 10,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none'
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* We add pointer-events: none to children while dragging so they don't interfere */}
      <div style={{ pointerEvents: isDragging ? 'none' : 'auto' }}>
        {children}
      </div>
    </motion.div>
  );
}
