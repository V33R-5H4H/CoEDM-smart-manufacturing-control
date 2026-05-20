import React from 'react';

const StatusPanel = ({ plcConnected, ledConnected, shuttleState, isExpanded, safetyCurtainActive }) => {
  if (!isExpanded) return null;

  const statusIcons = {
    connected: '●',
    disconnected: '●',
    live: '●',
    offline: '●',
    idle: '○',
    moving: '⇄',
    busy: '◼',
    fault: '⚠',
  };

  const getStatusColor = (status) => {
    const colorMap = {
      connected: 'var(--status-ok)',
      live: 'var(--status-ok)',
      disconnected: 'var(--status-error)',
      offline: 'var(--status-error)',
      idle: 'var(--status-idle)',
      moving: 'var(--status-active)',
      busy: 'var(--status-warn)',
      fault: 'var(--status-error)',
    };
    return colorMap[status] || 'var(--text-muted)';
  };

  const plcStatus = plcConnected ? 'connected' : 'disconnected';
  // LED status should reflect the WebSocket connection to the backend, independent of PLC
  const ledStatus = ledConnected ? 'live' : 'offline';
  const shuttleStatus = shuttleState?.state || 'idle';
  const hasShuttlePosition =
    shuttleState?.col !== undefined &&
    shuttleState?.row !== undefined &&
    shuttleState?.col !== null &&
    shuttleState?.row !== null;
  const shuttlePosition = hasShuttlePosition
    ? `${shuttleState.col}${shuttleState.row}`
    : null;

  const statusRows = [
    {
      label: 'OPC UA SERVER',
      icon: statusIcons[plcStatus],
      text: plcStatus.charAt(0).toUpperCase() + plcStatus.slice(1),
      color: getStatusColor(plcStatus),
    },
    {
      label: 'Real time communication',
      icon: statusIcons[ledStatus],
      text: ledStatus.charAt(0).toUpperCase() + ledStatus.slice(1),
      color: getStatusColor(ledStatus),
    },
    {
      label: 'Shuttle State',
      icon: statusIcons[shuttleStatus],
      text: shuttlePosition
        ? `${shuttleStatus.charAt(0).toUpperCase() + shuttleStatus.slice(1)} @ ${shuttlePosition}`
        : shuttleStatus.charAt(0).toUpperCase() + shuttleStatus.slice(1),
      color: getStatusColor(shuttleStatus),
    },
    {
      label: 'SAFETY CURTAIN',
      icon: safetyCurtainActive ? '⚠' : '●',
      text: safetyCurtainActive ? 'BREACHED' : 'CLEAR',
      color: safetyCurtainActive ? '#dc2626' : 'var(--status-ok)',
    },
  ];

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 0.5rem)',
      right: 0,
      background: 'var(--bg-800)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.75rem 1rem',
      minWidth: '220px',
      boxShadow: 'var(--shadow-lg)',
      zIndex: 1000,
      animation: 'slideDown 0.2s ease-out',
    }}>
      <style>
        {`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
      <div style={{
        fontSize: '0.625rem',
        fontWeight: '700',
        letterSpacing: '0.05em',
        color: 'var(--text-muted)',
        marginBottom: '0.5rem',
        textTransform: 'uppercase',
      }}>
        System Status
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }}>
        {statusRows.map((row, index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
            }}
          >
            <span style={{
              color: 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: '600',
              minWidth: '50px',
            }}>
              {row.label}
            </span>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              color: 'var(--text-primary)',
              fontWeight: '500',
            }}>
              <span style={{
                color: row.color,
                fontSize: '0.625rem',
                lineHeight: 1,
              }}>
                {row.icon}
              </span>
              <span>{row.text}</span>
            </span>
          </div>
        ))}
      </div>


    </div>
  );
};

export default StatusPanel;
