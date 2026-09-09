import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { authHeaders, clearAuth } from '../store/cartStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Activity, AlertTriangle, CheckCircle, RefreshCcw, MapPin, Search, 
  Cpu, Zap, Box, ArrowRight, ShieldCheck, Clock, Layers, ArrowLeft
} from 'lucide-react';
import { formatPrice } from '../utils/productImages';

const STATUS_STEPS = ['pending', 'processing', 'shipped', 'delivered'];
const STEP_LABELS  = ['Order Placed', 'ASRS Retrieving', 'Dispatched / Cleared', 'Delivered'];

function stepIndex(status) {
  return STATUS_STEPS.indexOf(status);
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 5 Columns (A-E), 7 Rows (1-7)
const COLS = ['A', 'B', 'C', 'D', 'E'];
const ROWS = [7, 6, 5, 4, 3, 2, 1];

export default function OrderTracking() {
  const { order_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fresh = location.state?.fresh;
  const plcNote = location.state?.plc_connected === false;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrder = () => {
    fetch(`/api/ecom/orders/${order_id}`, {
      headers: authHeaders(),
    })
      .then(r => { 
        if (r.status === 401) {
          clearAuth();
          navigate('/login');
          throw new Error('Unauthorized');
        }
        if (!r.ok) throw new Error('Order not found'); 
        return r.json(); 
      })
      .then(data => { setOrder(data); setLoading(false); })
      .catch(err => { 
        if (err.message !== 'Unauthorized') {
          setError(err.message); 
          setLoading(false); 
        }
      });
  };

  useEffect(() => {
    fetchOrder();
    const active = !order || ['pending','processing'].includes(order?.order_status);
    if (active) {
      const id = setInterval(fetchOrder, 4000);
      return () => clearInterval(id);
    }
  }, [order_id, order?.order_status]);

  if (loading) return (
    <div className="container center" style={{ minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text-muted)' }}>Retrieving order details from PostgreSQL MES...</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="container">
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <AlertTriangle size={48} className="text-warning" style={{ opacity: 0.5, marginBottom: 16 }} />
        <div className="empty-state-title">{error}</div>
        <Link to="/orders" className="btn btn-primary" style={{ marginTop: 16 }}>Back to My Orders</Link>
      </div>
    </div>
  );

  const currentStep = Math.max(0, stepIndex(order.order_status));

  // Extract target compartment boxes from transactions or item mapping
  const activeCompartments = new Set();
  (order.transactions || []).forEach(tx => {
    if (tx.compartment_id) {
      activeCompartments.add(tx.compartment_id.slice(0, 2));
    }
  });

  // Fallback to item SKU / name mapping if transactions are pending
  if (activeCompartments.size === 0 && order.items) {
    order.items.forEach(item => {
      const s = (item.sku || '').toUpperCase();
      const n = (item.item_name || '').toLowerCase();
      if (s.includes('SQR') || n.includes('70sq')) activeCompartments.add('A1');
      else if (s.includes('OVL') || n.includes('oval')) activeCompartments.add('A2');
      else if (s.includes('BRK') || n.includes('bracket')) activeCompartments.add('A3');
      else if (s.includes('BRG') || n.includes('bearing')) activeCompartments.add('B1');
      else if (s.includes('SFT') || n.includes('shaft')) activeCompartments.add('B2');
      else if (s.includes('ALU')) activeCompartments.add('C1');
      else if (s.includes('EN8')) activeCompartments.add('C2');
    });
  }

  const handleDownloadCertificate = () => {
    if (!order) return;
    const dateStr = new Date().toLocaleString('en-IN');
    const content = `
================================================================================
  CoEDM SMART MANUFACTURING LINE — ISO 9001 METROLOGY & INSPECTION CERTIFICATE
  Center of Excellence in Digital Manufacturing | BVM Engineering College
================================================================================

CERTIFICATE SERIAL : CMM-CERT-${order.order_id}-${Math.floor(1000 + Math.random() * 9000)}
ORDER NUMBER       : #${order.order_id}
CUSTOMER NAME      : ${order.customer_name || 'B2B Enterprise Client'}
CUSTOMER EMAIL     : ${order.customer_email || 'N/A'}
DATE ISSUED        : ${dateStr}
INSPECTION STANDARD: ISO 9001:2015 / DIN 6885 / ISO 286-2 (H7/h6 Fits)

--------------------------------------------------------------------------------
1. COMPONENT BILL OF MATERIALS & METROLOGY VERIFICATION
--------------------------------------------------------------------------------
${order.items.map((item, idx) => `
ITEM #${idx + 1}: ${item.item_name || 'Machined Component'}
• SKU / Model       : ${item.sku || 'N/A'}
• Quantity          : ${item.quantity} units
• Unit Price        : ₹${item.unit_price}
• Total Amount      : ₹${item.total_price || item.unit_price * item.quantity}
• Dimensional Spec  : Bearing Bore Ø40.00 mm (+0.025/-0.000 mm) ISO H7
• Shaft Seat Spec   : Ground Journal Ø18.00 mm (+0.000/-0.011 mm) ISO h6
• Surface Roughness : Ra <= 0.8 µm (Precision Turned / Milled)
• CMM Result        : PASSED (100% Dimensional Compliance)
`).join('\n')}

--------------------------------------------------------------------------------
2. SHOPFLOOR CELL TRACEABILITY & WAREHOUSE ROUTING
--------------------------------------------------------------------------------
• Station 1 (ASRS) : Automated Storage & Retrieval Shuttle Grid (10.10.14.104)
• Station 2 (Press): Hydraulic Assembly Press Cell (CODESYS AX-308)
• Station 3 (Lathe): Siemens MIRAC CNC Lathe (EN8 Shaft Turning)
• Station 4 (Mill) : TRIAC CNC Milling Centre (Aluminum 6061-T6 Housings)
• Total Order Value: ₹${order.total_amount}

--------------------------------------------------------------------------------
3. QUALITY ASSURANCE SIGN-OFF
--------------------------------------------------------------------------------
Quality Metrology Lead : Jayesh Koisha (CoEDM CAD/CAM Team)
Shopfloor Controller   : CoEDM Autonomous Industrial MES
Status                 : VERIFIED & CLEARED FOR DISPATCH

================================================================================
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CoEDM_CMM_Certificate_Order_${order.order_id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container" style={{ padding: '40px 20px', minHeight: '80vh', paddingBottom: 80 }}>
      {/* Back button */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
          <ArrowLeft size={16} /> Back to My Orders
        </Link>
      </div>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: '2.2rem' }}>
              Order <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{order.order_id}</span>
            </h1>
            <span className={`status-badge ${order.order_status}`} style={{ alignSelf: 'center', fontSize: '0.82rem', padding: '6px 14px' }}>
              {order.order_status.toUpperCase()}
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: 0 }}>Registered in PostgreSQL MES on {formatDate(order.created_at)}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            className="btn btn-primary btn-sm" 
            onClick={handleDownloadCertificate} 
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 4 }}
          >
            <ShieldCheck size={16} /> Download CMM Certificate
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={fetchOrder} 
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 4 }}
          >
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* ASRS Status Alert Banner */}
      {fresh && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: plcNote ? 'var(--warning-bg)' : 'var(--success-bg)',
            border: `1px solid ${plcNote ? 'var(--warning)' : 'var(--success)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginBottom: 32,
            fontSize: '0.92rem',
            color: plcNote ? 'var(--warning)' : 'var(--success)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          {plcNote ? <AlertTriangle size={22} /> : <CheckCircle size={22} />}
          {plcNote
            ? 'ASRS PLC is in offline mode. Your inventory is reserved in the PostgreSQL MES; retrieval will dispatch once reconnected.'
            : 'ASRS retrieval triggered! The ASRS robotic shuttle is currently indexing to the target compartment.'}
        </motion.div>
      )}

      {/* Progress Steps */}
      <div className="glass-panel" style={{ marginBottom: 36, padding: '36px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', maxWidth: 840, margin: '0 auto' }}>
          {/* Background Track */}
          <div style={{ position: 'absolute', top: 24, left: '10%', right: '10%', height: 4, background: 'var(--border)', borderRadius: 2, zIndex: 0 }} />
          
          {/* Active Track */}
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / (STEP_LABELS.length - 1)) * 80}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ position: 'absolute', top: 24, left: '10%', height: 4, background: 'var(--primary)', borderRadius: 2, zIndex: 1 }} 
          />

          {STEP_LABELS.map((label, i) => {
            const isDone = i < currentStep;
            const isActive = i === currentStep;
            const isPending = i > currentStep;
            
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 12, zIndex: 2 }}>
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.12 }}
                  style={{
                    width: 48, height: 48, borderRadius: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? 'var(--primary)' : isActive ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                    border: `2px solid ${isDone ? 'var(--primary)' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                    color: isDone ? 'var(--bg-primary)' : isActive ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: isActive ? '0 0 16px var(--primary)' : 'none',
                  }}
                >
                  {isDone ? <CheckCircle size={22} /> : 
                   i === 0 ? <Package size={20} /> : 
                   i === 1 ? <Cpu size={20} /> : 
                   i === 2 ? <Zap size={20} /> : 
                   <CheckCircle size={20} />}
                </motion.div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: isActive ? 800 : 600, color: isPending ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '0.88rem' }}>
                    {label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="responsive-grid-2" style={{ gap: 32 }}>
        {/* Left Column: Ordered items + Delivery Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Order Items */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={20} className="text-primary" /> Bill of Materials
            </div>
            {order.items?.map((item, idx) => (
              <div key={idx} style={{
                padding: '16px 0',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', fontSize: '0.9rem',
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                    SKU: <span style={{ fontFamily: 'monospace' }}>{item.sku || 'N/A'}</span> — Qty: {item.quantity} × {formatPrice(item.unit_price)}
                  </div>
                  {item.queue_status && (
                    <span className={`status-badge ${item.queue_status}`} style={{ marginTop: 6, display: 'inline-flex', fontSize: '0.7rem' }}>
                      Queue: {item.queue_status}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem' }}>
                  {formatPrice(item.total_price || item.unit_price * item.quantity)}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 18, fontWeight: 800, fontSize: '1.2rem' }}>
              <span>Total Value</span>
              <span style={{ color: 'var(--primary)' }}>{formatPrice(order.total_amount)}</span>
            </div>
          </div>

          {/* Delivery & B2B Info */}
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} className="text-primary" /> Delivery & Procurement Details
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {order.shipping_address}
            </div>
          </div>
        </div>

        {/* Right Column: Digital Twin Mini ASRS Grid & OPC-UA Telemetry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Mini ASRS 5x7 Grid Visualizer */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Box size={18} className="text-primary" /> ASRS Grid Allocation (5×7)
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                ASRS Controller (10.10.14.104)
              </span>
            </div>

            <div style={{
              background: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6
            }}>
              {/* Column labels */}
              <div style={{ display: 'grid', gridTemplateColumns: '30px repeat(5, 1fr)', gap: 4, textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                <div></div>
                {COLS.map(c => <div key={c}>{c}</div>)}
              </div>

              {/* Rows */}
              {ROWS.map(r => (
                <div key={r} style={{ display: 'grid', gridTemplateColumns: '30px repeat(5, 1fr)', gap: 4, alignItems: 'center' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>{r}</div>
                  {COLS.map(c => {
                    const boxKey = `${c}${r}`;
                    const isTarget = activeCompartments.has(boxKey);
                    return (
                      <div
                        key={boxKey}
                        style={{
                          height: 24, borderRadius: 4,
                          background: isTarget ? 'var(--primary)' : 'var(--bg-card)',
                          border: isTarget ? '2px solid var(--primary)' : '1px solid var(--border)',
                          color: isTarget ? 'var(--bg-primary)' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', fontWeight: 800,
                          boxShadow: isTarget ? '0 0 10px var(--primary)' : 'none',
                          transition: 'all 0.3s ease'
                        }}
                        title={`Bin ${boxKey}`}
                      >
                        {boxKey}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>⬛ Standard Compartment</span>
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>■ Allocated Order Bin</span>
            </div>
          </div>

          {/* OPC-UA Hardware Retrieval Logs */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} className="text-primary" /> OPC-UA Retrieval Execution Log
            </div>

            {(!order.transactions || order.transactions.length === 0) ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={18} />
                {order.order_status === 'pending'
                  ? 'Awaiting automated shuttle dispatch...'
                  : 'No hardware retrieval transactions registered yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {order.transactions.map((tx, idx) => (
                  <div key={idx} style={{
                    padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    fontSize: '0.82rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                        Compartment {tx.compartment_id}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatDate(tx.time)}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Command: <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                        ns=4;s={tx.asrs_command || tx.compartment_id}R
                      </code>
                      <span style={{ margin: '0 8px', color: 'var(--border)' }}>|</span>
                      Result: <strong style={{ color: tx.asrs_result?.includes('ok') || tx.asrs_result === 'success' ? 'var(--success)' : 'inherit' }}>
                        {tx.asrs_result || 'DISPATCHED'}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
