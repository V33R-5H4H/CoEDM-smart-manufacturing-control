import React from "react";
import PageHeader from "../components/PageHeader";

export default function TestingStation() {
  return (
    <div className="asm-page">
      <PageHeader
        title="Testing Station"
        subtitle="Dimensional & Weight Verification"
      />
      <div className="asm-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>
          Testing Station module placeholder.
        </div>
      </div>
    </div>
  );
}
