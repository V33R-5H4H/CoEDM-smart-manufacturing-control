import React from 'react';

const TriacStatusRibbon = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {/* OPC-UA Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          background: 'rgba(255, 180, 171, 0.04)',
          border: '1px solid rgba(255, 180, 171, 0.2)',
          borderRadius: '3px',
          boxShadow: '0 0 4px rgba(255, 180, 171, 0.3)',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-error)',
            boxShadow: '0 0 6px var(--status-error)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          OPC-UA: OFFLINE
        </span>
      </div>

      {/* Feed Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          background: 'rgba(255, 180, 171, 0.04)',
          border: '1px solid rgba(255, 180, 171, 0.2)',
          borderRadius: '3px',
          boxShadow: '0 0 4px rgba(255, 180, 171, 0.3)',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-error)',
            boxShadow: '0 0 6px var(--status-error)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          FEED: OFFLINE
        </span>
      </div>

      {/* Process Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          background: 'rgba(188, 199, 221, 0.05)',
          border: '1px solid rgba(188, 199, 221, 0.2)',
          borderRadius: '3px',
          boxShadow: '0 0 4px rgba(188, 199, 221, 0.3)',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-active)',
            boxShadow: '0 0 6px var(--status-active)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          PROCESS: IDLE
        </span>
      </div>
    </div>
  );
};

export default TriacStatusRibbon;
