import React from 'react';

const AssemblyStatusRibbon = ({ plcConnected, wsConnected, plantData, smoothedPosition }) => {
  const plcStatus = plcConnected ? 'connected' : 'disconnected';
  const feedStatus = wsConnected ? 'live' : 'offline';

  // Press state
  const isSafetyFault = plantData?.safety?.curtain || plantData?.safety?.buzzer;
  const displacement = smoothedPosition != null ? Math.round(smoothedPosition - 43) : null;
  const isPressActive = displacement !== null && displacement > 7;

  let pressStatus = 'idle';
  if (isSafetyFault) {
    pressStatus = 'fault';
  } else if (isPressActive) {
    pressStatus = 'active';
  }

  // Colors & shadows for premium glowing cyber-industrial aesthetic
  const getStatusConfig = (type, val) => {
    if (type === 'plc') {
      return val === 'connected'
        ? {
            label: 'OPC-UA: ACTIVE',
            color: 'var(--status-ok)',
            bg: 'rgba(121, 218, 166, 0.06)',
            border: 'rgba(121, 218, 166, 0.25)',
            glow: 'rgba(121, 218, 166, 0.4)',
            pulse: false,
          }
        : {
            label: 'OPC-UA: OFFLINE',
            color: 'var(--status-error)',
            bg: 'rgba(255, 180, 171, 0.04)',
            border: 'rgba(255, 180, 171, 0.2)',
            glow: 'rgba(255, 180, 171, 0.3)',
            pulse: false,
          };
    }

    if (type === 'feed') {
      return val === 'live'
        ? {
            label: 'FEED: LIVE',
            color: 'var(--status-ok)',
            bg: 'rgba(121, 218, 166, 0.06)',
            border: 'rgba(121, 218, 166, 0.25)',
            glow: 'rgba(121, 218, 166, 0.4)',
            pulse: true,
          }
        : {
            label: 'FEED: OFFLINE',
            color: 'var(--status-error)',
            bg: 'rgba(255, 180, 171, 0.04)',
            border: 'rgba(255, 180, 171, 0.2)',
            glow: 'rgba(255, 180, 171, 0.3)',
            pulse: false,
          };
    }

    // Press status configurations
    if (val === 'active') {
      return {
        label: `PRESS: ACTIVE @ ${displacement}mm`,
        color: 'var(--status-warn)',
        bg: 'rgba(249, 188, 85, 0.06)',
        border: 'rgba(249, 188, 85, 0.25)',
        glow: 'rgba(249, 188, 85, 0.45)',
        pulse: true,
      };
    }
    if (val === 'fault') {
      return {
        label: 'PRESS: FAULT (SAFETY)',
        color: 'var(--status-error)',
        bg: 'rgba(255, 180, 171, 0.06)',
        border: 'rgba(255, 180, 171, 0.3)',
        glow: 'rgba(255, 180, 171, 0.5)',
        pulse: true,
      };
    }
    return {
      label: 'PRESS: IDLE',
      color: 'var(--status-active)',
      bg: 'rgba(188, 199, 221, 0.05)',
      border: 'rgba(188, 199, 221, 0.2)',
      glow: 'rgba(188, 199, 221, 0.3)',
      pulse: false,
    };
  };

  const plcConfig = getStatusConfig('plc', plcStatus);
  const feedConfig = getStatusConfig('feed', feedStatus);
  const pressConfig = getStatusConfig('press', pressStatus);

  const renderBadge = (config) => {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          background: config.bg,
          border: `1px solid ${config.border}`,
          borderRadius: '3px',
          boxShadow: `0 0 4px ${config.glow}`,
          transition: 'all 0.2s ease-out',
        }}
      >
        <span
          className={config.pulse ? 'ribbon-pulse' : ''}
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: config.color,
            boxShadow: `0 0 6px ${config.color}`,
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {config.label}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <style>
        {`
          @keyframes ribbon-pulse-glow {
            0% {
              transform: scale(1);
              opacity: 1;
              box-shadow: 0 0 6px currentColor;
            }
            50% {
              transform: scale(1.2);
              opacity: 0.8;
              box-shadow: 0 0 10px currentColor;
            }
            100% {
              transform: scale(1);
              opacity: 1;
              box-shadow: 0 0 6px currentColor;
            }
          }
          .ribbon-pulse {
            animation: ribbon-pulse-glow 2s infinite ease-in-out;
            color: inherit;
          }
        `}
      </style>
      {renderBadge(plcConfig)}
      {renderBadge(feedConfig)}
      {renderBadge(pressConfig)}
    </div>
  );
};

export default AssemblyStatusRibbon;
