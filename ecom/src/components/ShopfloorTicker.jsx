import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Cpu, Factory, Zap, ShieldCheck, Clock } from 'lucide-react';

export default function ShopfloorTicker() {
  const [plcOnline, setPlcOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    // Check PLC status
    fetch('/api/ecom/admin/plc-status')
      .then(r => r.json())
      .then(d => setPlcOnline(d.plc_connected))
      .catch(() => setPlcOnline(false));

    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      padding: '6px 16px',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: 'var(--text-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      fontFamily: 'var(--font-mono, monospace)'
    }}>
      {/* Left: Factory Live Machine Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontWeight: 700 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: plcOnline ? '#10b981' : '#f59e0b',
            boxShadow: plcOnline ? '0 0 6px #10b981' : 'none'
          }} />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>CoEDM SMART SHOPFLOOR</span>
        </div>

        <span style={{ color: 'var(--border)' }}>|</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>STN 1 [ASRS]:</span>
          <span style={{ color: plcOnline ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
            {plcOnline ? 'ONLINE (10.10.14.104)' : 'SIMULATION MODE'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>STN 2 [PRESS]:</span>
          <span style={{ color: 'var(--success)', fontWeight: 700 }}>READY (CODESYS AX-308)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>STN 3 [MIRAC LATHE]:</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>OPERATIONAL (EN8 SHAFTS)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>STN 4 [TRIAC MILL]:</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>ACTIVE (HOUSINGS 40MM)</span>
        </div>
      </div>

      {/* Right: Metrology Standard & Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
          <ShieldCheck size={13} /> ISO 9001:2015 METROLOGY CERTIFIED
        </span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
          <Clock size={12} /> {currentTime} IST
        </span>
      </div>
    </div>
  );
}
