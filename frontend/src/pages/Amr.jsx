import React from "react";
import PageHeader from "../components/PageHeader";

export default function Amr() {
  return (
    <div className="asm-page">
      <PageHeader
        title="Smart AMR"
        subtitle="Mobile Robot Telemetry & Path Dispatcher"
      />
      <div className="asm-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>
          AMR module placeholder.
        </div>
      </div>
    </div>
  );
}
