import React from "react";
import PageHeader from "../components/PageHeader";

export default function Inspection() {
  return (
    <div className="asm-page">
      <PageHeader
        title="Inspection"
        subtitle="Visual Defect Inspection"
      />
      <div className="asm-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '1.4rem', fontFamily: 'var(--font-mono)' }}>
          Inspection module placeholder.
        </div>
      </div>
    </div>
  );
}
