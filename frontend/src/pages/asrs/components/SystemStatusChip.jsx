
const SystemStatusChip = ({ plcConnected, ledConnected, shuttleState, onMouseEnter, onMouseLeave, isExpanded, safetyCurtainActive }) => {
  // Determine worst active state (priority: safety breach > disconnected > busy > idle > ok)
  const getWorstState = () => {
    if (safetyCurtainActive) return { color: '#dc2626', label: 'SYSTEM', text: 'Safety Breach' };
    if (!plcConnected) return { color: 'var(--status-error)', label: 'SYSTEM', text: 'Disconnected' };
    if (!ledConnected) return { color: 'var(--status-error)', label: 'SYSTEM', text: 'LED Offline' };
    if (shuttleState?.state === 'busy' || shuttleState?.state === 'moving') {
      return { color: 'var(--status-warn)', label: 'SYSTEM', text: 'Busy' };
    }
    return { color: 'var(--status-ok)', label: 'SYSTEM', text: 'OK' };
  };

  const status = getWorstState();

  return (
    <div
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.875rem',
        background: isExpanded ? 'var(--bg-700)' : 'var(--bg-800)',
        border: `1px solid ${isExpanded ? 'var(--border-light)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        cursor: 'default',
        transition: 'all var(--transition-fast)',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8125rem',
        fontWeight: '600',
        color: 'var(--text-primary)',
        boxShadow: isExpanded ? 'var(--shadow)' : 'var(--shadow-sm)',
      }}
    >
      <span style={{
        color: status.color,
        fontSize: '0.75rem',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
      }}>
        ●
      </span>
      <span>{status.label}</span>
      <span style={{
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        marginLeft: '0.25rem',
      }}>
        {isExpanded ? '▼' : '▶'}
      </span>
    </div>
  );
};

export default SystemStatusChip;
