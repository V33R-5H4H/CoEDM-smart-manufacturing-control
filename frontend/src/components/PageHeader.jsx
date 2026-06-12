export default function PageHeader({ title, subtitle, status, actions, children }) {
  const isActive = status && status.toLowerCase().includes('active');

  return (
    <header className="page-header" style={{
      height: '44px',
      padding: '0 16px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'var(--bg-tertiary)',
      flexShrink: 0,
    }}>
      {/* Left: Brand + Context breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>CoEDM Control System</span>

        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>{title}</span>
          {subtitle && (
            <>
              <span style={{ color: 'var(--text-disabled)', fontSize: '14px' }}>/</span>
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>{subtitle}</span>
            </>
          )}
        </div>

        {/* Status pill */}
        {status && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '2px',
            border: `1px solid ${isActive ? 'rgba(121,218,166,0.3)' : 'var(--border)'}`,
            background: isActive ? 'rgba(121,218,166,0.08)' : 'transparent',
          }}>
            <div style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: isActive ? 'var(--status-ok)' : 'var(--status-idle)',
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 500,
              color: isActive ? 'var(--status-ok)' : 'var(--text-muted)',
              textTransform: 'uppercase',
            }}>{status}</span>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      {(actions || children) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actions}
          {children}
        </div>
      )}
    </header>
  );
}
