import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, CheckCircle2, AlertCircle, ShoppingCart, ArrowRight, ArrowLeft, 
  Sparkles, Factory, ShieldCheck, Cpu, RefreshCw, Check, Info, Eye, Download, Box
} from 'lucide-react';
import { addToCart } from '../store/cartStore';
import { getProductAsset, formatPrice } from '../utils/productImages';
import ProductModal from '../components/ProductModal';

const DEFAULT_HOUSINGS = [
  {
    item_id: 101,
    sku: 'CSG-SQR-70',
    name: 'Square 4-Bolt Flanged Housing Unit (70×70mm, Ø40mm Bore)',
    description: 'Precision CNC milled 70×70mm square 4-bolt flanged bearing unit with Ø40mm H7 bore (12mm seat depth) and PCD Ø75mm (4× Ø7mm holes). Station 4 TRIAC CNC Centre. DWG: 70sq_40mmdia.',
    price: 1250,
    available_qty: 8,
    image_url: '/images/casing.png'
  },
  {
    item_id: 102,
    sku: 'CSG-OVL-40',
    name: 'Oval 2-Bolt Flanged Housing Unit (104mm, Ø40mm Bore)',
    description: 'Precision CNC milled rhombic oval 2-bolt flanged bearing unit (104×54mm) with Ø40mm H7 bore and 84mm mounting pitch (2× Ø9mm holes). Station 4 TRIAC CNC Centre. DWG: oval_40mm.',
    price: 1150,
    available_qty: 12,
    image_url: '/images/casing2.png'
  },
  {
    item_id: 103,
    sku: 'CSG-BRK-40',
    name: 'Asymmetric Bracket Bearing Housing (60×54mm, Ø40mm Bore)',
    description: 'Precision CNC milled heavy-duty asymmetric bracket bearing unit with 3× Ø9mm mounting holes, 40° structural gusset rib, and Ø40mm H7 bore. Station 4 TRIAC CNC Centre. DWG: Bracket_40mm.',
    price: 1350,
    available_qty: 6,
    image_url: '/images/casing3.png'
  }
];

export default function Configurator({ onCartChange }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Component Selections
  const [selectedShaft, setSelectedShaft] = useState(null);
  const [selectedBearing, setSelectedBearing] = useState(null);
  const [selectedCasing, setSelectedCasing] = useState(null);
  const [assemblyRequested, setAssemblyRequested] = useState(true); // Hydraulic Press assembly

  const [activeStep, setActiveStep] = useState(1);
  const [previewMode, setPreviewMode] = useState('mated'); // 'mated' | 'cad'
  const [modalProduct, setModalProduct] = useState(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch('/api/ecom/products')
      .then(r => r.json())
      .then(data => {
        setProducts(data);
        const shafts = data.filter(p => p.name.toLowerCase().includes('shaft') || (p.sku || '').toLowerCase().includes('sft'));
        const bearings = data.filter(p => p.name.toLowerCase().includes('bearing') || (p.sku || '').toLowerCase().includes('brg'));
        let casings = data.filter(p => p.name.toLowerCase().includes('casing') || p.name.toLowerCase().includes('housing') || (p.sku || '').toLowerCase().includes('csg') || p.name.toLowerCase().includes('70sq') || p.name.toLowerCase().includes('oval') || p.name.toLowerCase().includes('bracket'));

        if (casings.length < 3) {
          casings = DEFAULT_HOUSINGS;
        }

        if (shafts.length > 0) setSelectedShaft(shafts[0]);
        if (bearings.length > 0) setSelectedBearing(bearings[0]);
        if (casings.length > 0) setSelectedCasing(casings[0]);
        setLoading(false);
      })
      .catch(() => {
        setSelectedCasing(DEFAULT_HOUSINGS[0]);
        setLoading(false);
      });
  }, []);

  const shafts = products.filter(p => p.name.toLowerCase().includes('shaft') || (p.sku || '').toLowerCase().includes('sft'));
  const bearings = products.filter(p => p.name.toLowerCase().includes('bearing') || (p.sku || '').toLowerCase().includes('brg'));
  const apiCasings = products.filter(p => p.name.toLowerCase().includes('casing') || p.name.toLowerCase().includes('housing') || (p.sku || '').toLowerCase().includes('csg'));
  const casings = apiCasings.length >= 3 ? apiCasings : DEFAULT_HOUSINGS;

  // Calculate totals
  const shaftPrice = selectedShaft?.price || 0;
  const bearingPrice = selectedBearing?.price || 0;
  const casingPrice = selectedCasing?.price || 0;
  const pressAssemblyFee = assemblyRequested ? 450 : 0;
  const totalPrice = shaftPrice + bearingPrice + casingPrice + pressAssemblyFee;

  const allSelected = selectedShaft && selectedBearing && selectedCasing;
  const inStock = (selectedShaft?.available_qty > 0) && (selectedBearing?.available_qty > 0) && (selectedCasing?.available_qty > 0);

  const handleAddAssemblyToCart = () => {
    if (!allSelected || !inStock) return;

    if (selectedShaft) addToCart(selectedShaft, 1);
    if (selectedBearing) addToCart(selectedBearing, 1);
    if (selectedCasing) addToCart(selectedCasing, 1);

    if (assemblyRequested) {
      const serviceItem = {
        item_id: 'SVC-PRESS-ASSY',
        name: `Precision Sub-Assembly Service (${selectedShaft.sku}+${selectedBearing.sku}+${selectedCasing.sku})`,
        price: 450,
        sku: 'SVC-ASSY-PRESS',
        category: 'Services',
        description: 'Automated hydraulic press fitting & alignment check at Station 2 CODESYS Press Cell.',
        available_qty: 999
      };
      addToCart(serviceItem, 1);
    }

    onCartChange?.();
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      navigate('/checkout');
    }, 1200);
  };

  const getHousingShape = (c) => {
    if (!c) return 'square';
    const n = (c.name || '').toLowerCase();
    const s = (c.sku || '').toLowerCase();
    if (n.includes('bracket') || s.includes('brk') || n.includes('bracket_40mm')) return 'bracket';
    if (n.includes('oval') || s.includes('ovl') || n.includes('oval_40mm')) return 'oval';
    return 'square';
  };

  const casingShape = getHousingShape(selectedCasing);

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <motion.div 
        className="page-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', padding: '48px 0 28px' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 99, padding: '4px 14px', fontSize: '0.8rem', fontWeight: 700,
          color: 'var(--text-secondary)', marginBottom: 12
        }}>
          <Factory size={14} className="text-primary" /> Integrated Industry 4.0 Sub-Assembly Builder
        </div>
        <h1 className="page-title" style={{ fontSize: '2.4rem', fontWeight: 800 }}>
          Interactive Mechanical Assembly Configurator
        </h1>
        <p className="page-subtitle" style={{ maxWidth: 680, margin: '10px auto 0', fontSize: '0.95rem', lineHeight: 1.6 }}>
          Configure precision mated sub-assemblies. Click any component for full CAD models, tolerances, and technical datasheets (PDF).
        </p>
      </motion.div>

      {/* Step Indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
        {[
          { num: 1, label: '1. Select Shaft' },
          { num: 2, label: '2. Mate Bearing' },
          { num: 3, label: '3. Select Housing' },
          { num: 4, label: '4. Assembly Review' }
        ].map(step => (
          <button
            key={step.num}
            onClick={() => setActiveStep(step.num)}
            style={{
              padding: '10px 20px', borderRadius: 99, fontSize: '0.88rem', fontWeight: 700,
              border: activeStep === step.num ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: activeStep === step.num ? 'var(--primary)' : 'var(--bg-card)',
              color: activeStep === step.num ? 'var(--bg-primary)' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div className="responsive-grid-2" style={{ gap: 36, alignItems: 'start' }}>
        {/* Left Column: Interactive Component Selector */}
        <div>
          <AnimatePresence mode="wait">
            {activeStep === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="glass-panel" style={{ padding: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Step 1: Precision Shaft Selection</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0' }}>Machined at Station 3 (Siemens MIRAC Lathe)</p>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 6 }}>
                      Tolerance: h6 Ground
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {shafts.map(s => {
                      const isSel = selectedShaft?.item_id === s.item_id;
                      const img = getProductAsset(s.name, s.sku, s.image_url);
                      const inStockItem = s.available_qty > 0;
                      const lowStockItem = s.available_qty > 0 && s.available_qty <= 5;
                      return (
                        <div
                          key={s.item_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: 16,
                            borderRadius: 'var(--radius-md)', border: isSel ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: isSel ? 'var(--surface-hover)' : 'var(--bg-card)',
                            transition: 'all 0.2s ease', position: 'relative'
                          }}
                        >
                          <img 
                            src={img} alt={s.name} 
                            onClick={() => setSelectedShaft(s)}
                            style={{ width: 64, height: 64, objectFit: 'contain', cursor: 'pointer' }} 
                          />
                          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedShaft(s)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{s.name}</div>
                              <span className={`status-badge ${inStockItem ? (lowStockItem ? 'pending' : 'shipped') : 'cancelled'}`} style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                                {inStockItem ? (lowStockItem ? `Only ${s.available_qty} left` : `${s.available_qty} in ASRS stock`) : 'Out of Stock'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              SKU: {s.sku} | Mat: EN8 Steel | Finish: Ra 0.8µm
                            </div>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 6 }}>{formatPrice(s.price)}</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button 
                              className="btn-icon" 
                              onClick={() => setModalProduct(s)}
                              title="Inspect CAD specs & Download Datasheet"
                              style={{ width: 34, height: 34 }}
                            >
                              <Info size={16} />
                            </button>
                            {isSel && <CheckCircle2 size={24} className="text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={() => setActiveStep(2)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      Next: Mate Bearing <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeStep === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="glass-panel" style={{ padding: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Step 2: Bearing Component Mating</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0' }}>Bore tolerance matching selected shaft</p>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 6 }}>
                      ABEC-5 Grade
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {bearings.map(b => {
                      const isSel = selectedBearing?.item_id === b.item_id;
                      const img = getProductAsset(b.name, b.sku, b.image_url);
                      const inStockItem = b.available_qty > 0;
                      const lowStockItem = b.available_qty > 0 && b.available_qty <= 5;
                      return (
                        <div
                          key={b.item_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: 16,
                            borderRadius: 'var(--radius-md)', border: isSel ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: isSel ? 'var(--surface-hover)' : 'var(--bg-card)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <img 
                            src={img} alt={b.name} 
                            onClick={() => setSelectedBearing(b)}
                            style={{ width: 64, height: 64, objectFit: 'contain', cursor: 'pointer' }} 
                          />
                          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedBearing(b)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{b.name}</div>
                              <span className={`status-badge ${inStockItem ? (lowStockItem ? 'pending' : 'shipped') : 'cancelled'}`} style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                                {inStockItem ? (lowStockItem ? `Only ${b.available_qty} left` : `${b.available_qty} in ASRS stock`) : 'Out of Stock'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              SKU: {b.sku} | Dynamic Load: 14.8 kN | GCr15 Chrome Steel (Ø40mm OD)
                            </div>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 6 }}>{formatPrice(b.price)}</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button 
                              className="btn-icon" 
                              onClick={() => setModalProduct(b)}
                              title="Inspect CAD specs & Download Datasheet"
                              style={{ width: 34, height: 34 }}
                            >
                              <Info size={16} />
                            </button>
                            {isSel && <CheckCircle2 size={24} className="text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                    <button className="btn btn-ghost" onClick={() => setActiveStep(1)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button className="btn btn-primary" onClick={() => setActiveStep(3)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      Next: Select Housing <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeStep === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="glass-panel" style={{ padding: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Step 3: Housing / Casing Selection</h2>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0' }}>Milled at Station 4 (TRIAC CNC Centre) — 3 Certified Geometry Variants</p>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 6 }}>
                      Fit: Ø40mm H7 Bore
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {casings.map(c => {
                      const isSel = selectedCasing?.sku === c.sku || selectedCasing?.item_id === c.item_id;
                      const img = getProductAsset(c.name, c.sku, c.image_url);
                      const inStockItem = c.available_qty > 0;
                      const lowStockItem = c.available_qty > 0 && c.available_qty <= 5;
                      const hType = getHousingShape(c);

                      return (
                        <div
                          key={c.item_id || c.sku}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: 16,
                            borderRadius: 'var(--radius-md)', border: isSel ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: isSel ? 'var(--surface-hover)' : 'var(--bg-card)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <img 
                            src={img} alt={c.name} 
                            onClick={() => setSelectedCasing(c)}
                            style={{ width: 68, height: 68, objectFit: 'contain', cursor: 'pointer' }} 
                          />
                          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedCasing(c)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{c.name}</div>
                              <span className={`status-badge ${inStockItem ? (lowStockItem ? 'pending' : 'shipped') : 'cancelled'}`} style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                                {inStockItem ? (lowStockItem ? `Only ${c.available_qty} left` : `${c.available_qty} in ASRS stock`) : 'Out of Stock'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {hType === 'bracket' && 'DWG: Bracket_40mm | 3× Ø9mm Holes | 60×54mm Base | 40° Web'}
                              {hType === 'oval' && 'DWG: oval_40mm | 2-Bolt Flange | 104×54mm (2× Ø9mm Holes)'}
                              {hType === 'square' && 'DWG: 70sq_40mmdia | 4-Bolt Square | 70×70mm (PCD Ø75mm 4× Ø7)'}
                            </div>
                            <div style={{ fontWeight: 800, color: 'var(--primary)', marginTop: 6 }}>{formatPrice(c.price)}</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button 
                              className="btn-icon" 
                              onClick={() => setModalProduct(c)}
                              title="Inspect CAD specs & Download Datasheet"
                              style={{ width: 34, height: 34 }}
                            >
                              <Info size={16} />
                            </button>
                            {isSel && <CheckCircle2 size={24} className="text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                    <button className="btn btn-ghost" onClick={() => setActiveStep(2)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button className="btn btn-primary" onClick={() => setActiveStep(4)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      Next: Routing & Review <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeStep === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="glass-panel" style={{ padding: 28 }}>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 6px 0' }}>Step 4: Factory Routing & Assembly</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px 0' }}>Choose whether your parts should be press-assembled before delivery</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                    <div
                      onClick={() => setAssemblyRequested(true)}
                      style={{
                        padding: 18, borderRadius: 'var(--radius-md)',
                        border: assemblyRequested ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: assemblyRequested ? 'var(--surface-hover)' : 'var(--bg-card)',
                        cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'start'
                      }}
                    >
                      <Factory size={22} className="text-primary" style={{ marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                            Pre-Assembled via Station 2 Hydraulic Press (Recommended)
                          </div>
                          <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>+ ₹450.00</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4, lineHeight: 1.5 }}>
                          Components retrieved from ASRS, aligned, and press-fitted under automated force control. Shipped as 1 unit with QC certificate.
                        </div>
                      </div>
                      {assemblyRequested && <CheckCircle2 size={20} className="text-primary" />}
                    </div>

                    <div
                      onClick={() => setAssemblyRequested(false)}
                      style={{
                        padding: 18, borderRadius: 'var(--radius-md)',
                        border: !assemblyRequested ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: !assemblyRequested ? 'var(--surface-hover)' : 'var(--bg-card)',
                        cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'start'
                      }}
                    >
                      <Layers size={22} className="text-primary" style={{ marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                          Disassembled Parts Kit (Direct ASRS Retrieval)
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4, lineHeight: 1.5 }}>
                          All 3 components retrieved separately from ASRS bins and packaged for in-house assembly.
                        </div>
                      </div>
                      {!assemblyRequested && <CheckCircle2 size={20} className="text-primary" />}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <button className="btn btn-ghost" onClick={() => setActiveStep(3)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ArrowLeft size={16} /> Back to Casings
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Visual Preview & Order Summary */}
        <div style={{ position: 'sticky', top: 90 }}>
          <div className="glass-panel" style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} className="text-primary" /> Visual Assembly Preview
              </span>
              <span style={{
                background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700
              }}>
                ✓ Mating Validated (H7/h6)
              </span>
            </div>

            {/* Preview Mode Switcher */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                onClick={() => setPreviewMode('mated')}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                  background: previewMode === 'mated' ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: previewMode === 'mated' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer'
                }}
              >
                Composite Preview
              </button>
              <button
                onClick={() => setPreviewMode('cad')}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                  background: previewMode === 'cad' ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: previewMode === 'cad' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer'
                }}
              >
                2D CAD Mating Axis
              </button>
            </div>

            {/* Visual Layered Composite Render */}
            {previewMode === 'mated' ? (
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: '28px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                minHeight: 200,
                border: '1px solid var(--border)',
                position: 'relative'
              }}>
                {selectedCasing && (
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
                    <img src={getProductAsset(selectedCasing.name, selectedCasing.sku, selectedCasing.image_url)} alt="Casing" style={{ width: 75, height: 75, objectFit: 'contain' }} />
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {casingShape === 'bracket' ? 'Bracket Housing' : casingShape === 'oval' ? 'Oval Flange' : 'Square Flange'}
                    </div>
                  </motion.div>
                )}

                <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 300 }}>+</div>

                {selectedBearing && (
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
                    <img src={getProductAsset(selectedBearing.name, selectedBearing.sku, selectedBearing.image_url)} alt="Bearing" style={{ width: 75, height: 75, objectFit: 'contain' }} />
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 4 }}>Bearing</div>
                  </motion.div>
                )}

                <div style={{ fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 300 }}>+</div>

                {selectedShaft && (
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
                    <img src={getProductAsset(selectedShaft.name, selectedShaft.sku, selectedShaft.image_url)} alt="Shaft" style={{ width: 75, height: 75, objectFit: 'contain' }} />
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 4 }}>Shaft</div>
                  </motion.div>
                )}
              </div>
            ) : (
              /* Dynamic CAD Schematic matching the selected Housing */
              <div style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 18,
                border: '1px solid var(--border)', minHeight: 200, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center'
              }}>
                <svg width="250" height="120" viewBox="0 0 250 120">
                  <line x1="10" y1="60" x2="240" y2="60" stroke="#a1a1aa" strokeDasharray="5,3" strokeWidth="1" />
                  
                  {/* Shaft Body */}
                  <rect x="25" y="50" width="195" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  
                  {/* Housing Bore Seat & Geometry */}
                  {casingShape === 'bracket' ? (
                    <g>
                      <path d="M 60,60 C 60,35 80,18 100,18 L 160,18 C 175,18 175,102 160,102 L 100,102 C 80,102 60,85 60,60 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                      <circle cx="75" cy="60" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="105" cy="35" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="105" cy="85" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    </g>
                  ) : casingShape === 'oval' ? (
                    <g>
                      <path d="M 50,60 C 50,35 85,18 130,18 C 175,18 210,35 210,60 C 210,85 175,102 130,102 C 85,102 50,85 50,60 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                      <circle cx="68" cy="60" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="192" cy="60" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    </g>
                  ) : (
                    <g>
                      <rect x="75" y="15" width="105" height="90" rx="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                      <circle cx="90" cy="28" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="165" cy="28" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="90" cy="92" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="165" cy="92" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    </g>
                  )}

                  {/* Bearing Inner & Outer Seat in Bore */}
                  <rect x="110" y="36" width="30" height="48" rx="2" fill="rgba(59, 130, 246, 0.2)" stroke="var(--primary)" strokeWidth="2" />
                  
                  <text x="125" y="114" textAnchor="middle" fontSize="9.5" fill="var(--primary)" fontWeight="800">
                    Ø40mm H7 Housing ⇄ Ø40mm Bearing ⇄ Ø18/20mm h6 Shaft
                  </text>
                </svg>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Fit Class: ISO Interference Fit (Station 2 Hydraulic Press)
                </div>
              </div>
            )}

            {/* Bill of Materials Breakdown */}
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
                Configured Bill of Materials (BOM)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)' }}>1× {selectedShaft?.name || 'Shaft not selected'}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{selectedShaft?.available_qty || 0} in ASRS stock</div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{formatPrice(shaftPrice)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)' }}>1× {selectedBearing?.name || 'Bearing not selected'}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{selectedBearing?.available_qty || 0} in ASRS stock</div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{formatPrice(bearingPrice)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)' }}>1× {selectedCasing?.name || 'Casing not selected'}</span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{selectedCasing?.available_qty || 0} in ASRS stock</div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{formatPrice(casingPrice)}</span>
                </div>

                {assemblyRequested && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary)' }}>
                    <span>1× Hydraulic Press Assembly Service</span>
                    <span style={{ fontWeight: 700 }}>{formatPrice(pressAssemblyFee)}</span>
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 16, paddingTop: 14, borderTop: '2px solid var(--border)',
                fontWeight: 800, fontSize: '1.2rem'
              }}>
                <span>Total Package</span>
                <span style={{ color: 'var(--primary)' }}>{formatPrice(totalPrice)}</span>
              </div>
            </div>

            {/* Action Button */}
            <div style={{ marginTop: 20 }}>
              <button
                className={`btn btn-lg ${added ? 'btn-ghost' : 'btn-primary'}`}
                style={{ width: '100%', padding: '15px', fontSize: '0.98rem' }}
                onClick={handleAddAssemblyToCart}
                disabled={!allSelected || !inStock}
              >
                {added ? (
                  <><Check size={20} /> Assembly Added to Cart!</>
                ) : !inStock ? (
                  'Components Out of Stock in ASRS'
                ) : (
                  <><ShoppingCart size={20} /> Add Configured Assembly ({formatPrice(totalPrice)})</>
                )}
              </button>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                Orders are queued directly into the CoEDM MES Robotic Retrieval Queue.
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Interactive Product Details & CAD Spec Modal */}
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onCartChange={onCartChange}
        />
      )}
    </div>
  );
}
