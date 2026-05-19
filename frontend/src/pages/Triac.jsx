import React from "react";
import { motion } from "framer-motion";

const Triac = () => {
  return (
    <div
      className="asrs-inventory"
      style={{
        height: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          flexShrink: 0,
          height: "44px",
          padding: "0 1.5rem",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span
            style={{
              fontSize: "0.9rem",
              fontWeight: "600",
              color: "var(--text-primary)",
              letterSpacing: "0.02em",
            }}
          >
            TRIAC
          </span>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              fontWeight: "500",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Placeholder
          </span>
        </div>
      </motion.header>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "2rem",
          color: "var(--text-primary)",
        }}
      >
        <div className="text-white">Smart TRIAC PC Placeholder Page</div>
      </div>
    </div>
  );
};

export default Triac;


