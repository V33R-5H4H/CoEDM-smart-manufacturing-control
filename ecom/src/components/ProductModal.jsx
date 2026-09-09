import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ShoppingCart, PackageOpen, Check, Layers, ShieldCheck, Factory, Cpu, 
  FileText, Download, Box, Eye, Sparkles, Sliders
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { addToCart } from '../store/cartStore';
import { getProductAsset, formatPrice } from '../utils/productImages';

function getHousingType(name = '', sku = '') {
  const n = (name || '').toLowerCase();
  const s = (sku || '').toLowerCase();
  if (n.includes('bracket') || s.includes('brk') || n.includes('bracket_40mm')) return 'bracket';
  if (n.includes('oval') || s.includes('ovl') || n.includes('oval_40mm')) return 'oval';
  if (n.includes('70sq') || n.includes('square') || s.includes('sqr') || n.includes('70sq_40mmdia')) return 'square';
  return null;
}

function getSpecs(name = '', sku = '') {
  const n = name.toLowerCase();
  const s = sku.toLowerCase();
  const hType = getHousingType(name, sku);

  if (hType === 'bracket') {
    return [
      { label: 'DWG Reference', value: 'Bracket_40mm (Rev 1/1, Jayesh Koisha)' },
      { label: 'Component Type', value: '3-Hole Asymmetric Bracket Bearing Housing' },
      { label: 'Bearing Bore (Seat)', value: 'Ø40.00 mm (H7 Tolerance Fit, Depth 12 mm)' },
      { label: 'Shaft Through-Hole', value: 'Ø18.00 mm' },
      { label: 'Outer Hub Dimensions', value: 'Ø54.00 mm / Ø28.00 mm Boss' },
      { label: 'Overall Dimensions', value: '60.00 mm × 54.00 mm × 27.00 mm Height' },
      { label: 'Mounting Holes', value: '3× Ø9.00 mm (40 mm pitch, 60 mm base)' },
      { label: 'Gusset / Web Support', value: '40° High-Stiffness Structural Rib' },
      { label: 'Origin Manufacturing Cell', value: 'Station 4 — TRIAC CNC Milling Centre' },
      { label: 'Storage Machine', value: 'ASRS Robotic Shuttle Grid (A1-E7)' },
    ];
  }

  if (hType === 'oval') {
    return [
      { label: 'DWG Reference', value: 'oval_40mm (Rev 1/1, Jayesh Koisha)' },
      { label: 'Component Type', value: '2-Bolt Oval Rhombic Flanged Housing Unit' },
      { label: 'Bearing Bore (Seat)', value: 'Ø40.00 mm (H7 Tolerance Fit, Depth 12 mm)' },
      { label: 'Shaft Through-Hole', value: 'Ø18.00 mm' },
      { label: 'Outer Hub Dimensions', value: 'Ø54.00 mm (Overall Height 30.00 mm)' },
      { label: 'Flange Dimensions', value: '104.00 mm Length × 54.00 mm Width (R31 Oval, R10 Tips)' },
      { label: 'Mounting Holes', value: '2× Ø9.00 mm (84.00 mm Center Pitch)' },
      { label: 'Flange Thickness', value: '10.00 mm Precision Milled Base' },
      { label: 'Origin Manufacturing Cell', value: 'Station 4 — TRIAC CNC Milling Centre' },
      { label: 'Storage Machine', value: 'ASRS Robotic Shuttle Grid (A1-E7)' },
    ];
  }

  if (hType === 'square' || n.includes('casing') || n.includes('housing')) {
    return [
      { label: 'DWG Reference', value: '70sq_40mmdia (Rev 1/1, Jayesh Koisha)' },
      { label: 'Component Type', value: '4-Bolt Square Flanged Housing Unit (70×70)' },
      { label: 'Bearing Bore (Seat)', value: 'Ø40.00 mm (H7 Tolerance Fit, Depth 12 mm)' },
      { label: 'Shaft Through-Hole', value: 'Ø18.00 mm' },
      { label: 'Flange Dimensions', value: '70.00 mm × 70.00 mm Square (R7.00 mm Corners)' },
      { label: 'Overall Height', value: '30.00 mm (10.00 mm Flange Thickness)' },
      { label: 'Mounting Holes', value: '4× Ø7.00 mm on 35.00 × 35.00 mm Pitch (PCD Ø75 mm)' },
      { label: 'Lubrication Port', value: 'Ø2.00 mm Grease Nipple Port' },
      { label: 'Origin Manufacturing Cell', value: 'Station 4 — TRIAC CNC Milling Centre' },
      { label: 'Storage Machine', value: 'ASRS Robotic Shuttle Grid (A1-E7)' },
    ];
  }

  if (n.includes('bearing')) {
    return [
      { label: 'Component Type', value: 'Deep Groove Radial Ball Bearing' },
      { label: 'Material', value: 'High-Carbon Chrome Steel (GCr15)' },
      { label: 'Tolerance Class', value: 'ABEC-5 / ISO Normal (P5)' },
      { label: 'Outer Diameter (D)', value: '40.00 mm (Matches Housing Bore H7)' },
      { label: 'Inner Bore Diameter (d)', value: '18.00 mm / 20.00 mm' },
      { label: 'Width (B)', value: '12.00 mm (Flush Fit in 12mm Housing Seat)' },
      { label: 'Dynamic Load Rating (Cr)', value: '14.8 kN' },
      { label: 'Static Load Rating (Cor)', value: '7.88 kN' },
      { label: 'Factory Assembly Station', value: 'Station 2 — CODESYS Hydraulic Press' },
      { label: 'Storage Machine', value: 'ASRS Robotic Shuttle Grid' },
    ];
  }

  if (n.includes('shaft')) {
    return [
      { label: 'Component Type', value: 'Precision Ground Stepped Machined Shaft' },
      { label: 'Material', value: 'EN8 / AISI 1045 Carbon Steel' },
      { label: 'Surface Finish', value: 'Ra 0.8 µm (Precision Turned)' },
      { label: 'Bearing Seat Diameter', value: 'Ø18.00 mm / Ø20.00 mm (h6 Precision Ground)' },
      { label: 'Total Length (L)', value: '120.00 mm' },
      { label: 'Origin Manufacturing Cell', value: 'Station 3 — Siemens MIRAC CNC Lathe' },
      { label: 'Storage Machine', value: 'ASRS Robotic Shuttle Grid' },
    ];
  }

  return [
    { label: 'Component Type', value: 'Industrial Precision Machined Sub-Component' },
    { label: 'Standard', value: 'ISO 9001:2015 Industrial Specification' },
    { label: 'Origin Station', value: 'CoEDM Smart Manufacturing Shopfloor' },
    { label: 'Storage Location', value: 'ASRS Automated Storage & Retrieval Shuttle Grid' },
  ];
}

export default function ProductModal({ product, onClose, onCartChange }) {
  const [added, setAdded] = useState(false);
  const [activeTab, setActiveTab] = useState('specs'); // 'specs' | 'cad'

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (product && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);
  
  if (!product) return null;
  
  const inStock = product.available_qty > 0;
  const lowStock = product.available_qty > 0 && product.available_qty <= 5;
  const imageSrc = getProductAsset(product.name, product.sku, product.image_url);
  const specs = getSpecs(product.name, product.sku);
  const housingType = getHousingType(product.name, product.sku);

  const handleAdd = () => {
    if (!inStock) return;
    addToCart(product, 1);
    onCartChange?.();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const handleDownloadPDF = () => {
    const content = `
======================================================================
  CoEDM SMART MANUFACTURING LINE — TECHNICAL COMPONENT DATASHEET
  Center of Excellence in Digital Manufacturing | BVM Engineering College
======================================================================

PRODUCT NAME: ${product.name}
SKU:          ${product.sku || 'N/A'}
ITEM ID:      ${product.item_id}
PRICE:        ${formatPrice(product.price)}
ASRS STOCK:   ${product.available_qty} units available in ASRS grid

----------------------------------------------------------------------
TECHNICAL SPECIFICATIONS & DIMENSIONS
----------------------------------------------------------------------
${specs.map(s => `• ${s.label.padEnd(28)} : ${s.value}`).join('\n')}

----------------------------------------------------------------------
MANUFACTURING & WAREHOUSE ROUTING
----------------------------------------------------------------------
Origin Station    : CNC Machining Cell (TRIAC Station 4 / MIRAC Station 3)
Storage Location  : ASRS Automated Storage & Retrieval Shuttle Grid (A1-E7)
Assembly Station  : CODESYS AX-308 Hydraulic Assembly Press (Station 2)
Quality Assurance : 100% Dimensional Inspection & Metrology Validated (ISO 9001)

----------------------------------------------------------------------
DATE GENERATED: ${new Date().toLocaleString('en-IN')}
======================================================================
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CoEDM_SpecSheet_${product.sku || product.item_id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            background: 'var(--bg-elevated)',
            borderRadius: 24,
            width: '100%',
            maxWidth: 900,
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="btn-icon"
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: 'var(--bg-secondary)' }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {/* Left: Image / 3D CAD Preview Panel */}
            <div style={{ 
              flex: '1 1 340px', 
              background: 'var(--bg-secondary)', 
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 400, padding: 36,
              borderRight: '1px solid var(--border)',
              position: 'relative'
            }}>
              {imageSrc ? (
                <motion.img 
                  initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                  src={imageSrc} alt={product.name} 
                  style={{ width: '100%', maxWidth: 260, objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.15))' }} 
                />
              ) : (
                /* Industrial Schematic Placeholder */
                <div style={{
                  width: '100%', maxWidth: 260, height: 200,
                  border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-card)', padding: 20, textAlign: 'center'
                }}>
                  <Cpu size={40} className="text-primary" style={{ marginBottom: 10 }} />
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>CAD Model Placeholder</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    ISO 10303 STEP / DWG Ready
                  </div>
                </div>
              )}

              {/* Quality Badges */}
              <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck size={14} className="text-primary" /> 100% Quality Inspected
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Factory size={14} className="text-primary" /> ASRS Cell Storage
                </span>
              </div>

              {/* Download Spec Sheet Button */}
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadPDF}
                style={{ marginTop: 18, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.82rem' }}
              >
                <Download size={14} /> Download Spec Sheet (.txt/PDF)
              </button>
            </div>

            {/* Right: Technical Details & CAD Tabs */}
            <div style={{ flex: '2 1 440px', padding: '32px' }}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {product.sku && (
                  <span style={{ 
                    background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 6,
                    fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace'
                  }}>
                    SKU: {product.sku}
                  </span>
                )}
                <span className={`status-badge ${inStock ? (lowStock ? 'pending' : 'shipped') : 'cancelled'}`} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  {inStock
                    ? (lowStock ? `Only ${product.available_qty} left in ASRS` : `${product.available_qty} units in ASRS Stock`)
                    : 'Out of stock in ASRS'}
                </span>
              </div>
              
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.2 }}>
                {product.name}
              </h2>
              
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 18 }}>
                {formatPrice(product.price)}
              </div>

              {/* Navigation Tabs (Specs vs 2D/3D CAD Drawing) */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <button
                  onClick={() => setActiveTab('specs')}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700,
                    background: activeTab === 'specs' ? 'var(--primary)' : 'transparent',
                    color: activeTab === 'specs' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <Layers size={14} /> Specifications
                </button>
                <button
                  onClick={() => setActiveTab('cad')}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700,
                    background: activeTab === 'cad' ? 'var(--primary)' : 'transparent',
                    color: activeTab === 'cad' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <Eye size={14} /> 2D Engineering DWG
                </button>
              </div>

              {/* Tab 1: Specifications */}
              {activeTab === 'specs' && (
                <div>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, fontSize: '0.9rem', marginBottom: 16 }}>
                    {product.description || 'Precision-machined industrial sub-component manufactured and stored in the CoEDM automated smart factory.'}
                  </p>

                  <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: 24 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                      {specs.map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', borderBottom: idx === specs.length - 1 ? 'none' : '1px solid var(--border)', paddingBottom: 4 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: 2D CAD Engineering DWG Drawing & Dimensions */}
              {activeTab === 'cad' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16,
                    border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      <span>📐 {housingType === 'bracket' ? 'DWG: Bracket_40mm' : housingType === 'oval' ? 'DWG: oval_40mm' : housingType === 'square' ? 'DWG: 70sq_40mmdia' : 'Orthographic Engineering Projection'}</span>
                      <span>Scale: 1:1 (ISO 5456)</span>
                    </div>

                    {/* SVG Technical Blueprint Illustration for specific housing */}
                    <div style={{
                      height: 150, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden'
                    }}>
                      {housingType === 'bracket' ? (
                        /* Bracket_40mm Drawing: Asymmetric 3-hole bracket with R10 nose and 40mm bore */
                        <svg width="250" height="130" viewBox="0 0 250 130">
                          <line x1="10" y1="65" x2="240" y2="65" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          <line x1="155" y1="10" x2="155" y2="120" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          {/* Bracket outline */}
                          <path d="M 30,65 C 30,45 50,25 70,25 L 180,25 C 205,25 205,105 180,105 L 70,105 C 50,105 30,85 30,65 Z" fill="none" stroke="currentColor" strokeWidth="2" />
                          {/* 3x Ø9 Mounting Holes */}
                          <circle cx="45" cy="65" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="85" cy="40" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="85" cy="90" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          {/* Center 40mm Bore & 18mm through hole */}
                          <circle cx="155" cy="65" r="28" fill="var(--warning-bg, rgba(245, 203, 92, 0.18))" stroke="var(--primary)" strokeWidth="2" />
                          <circle cx="155" cy="65" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4,2" />
                          {/* Dimension labels */}
                          <text x="155" y="70" textAnchor="middle" fontSize="10" fill="var(--primary)" fontWeight="800">Ø40 H7</text>
                          <text x="50" y="20" fontSize="8.5" fill="currentColor" fontWeight="700">3x Ø9 Holes</text>
                        </svg>
                      ) : housingType === 'oval' ? (
                        /* oval_40mm Drawing: Symmetrical 2-bolt rhombic oval with 104mm length */
                        <svg width="250" height="130" viewBox="0 0 250 130">
                          <line x1="10" y1="65" x2="240" y2="65" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          <line x1="125" y1="10" x2="125" y2="120" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          {/* Symmetrical Oval outline (104mm length, R31 body, R10 ends) */}
                          <path d="M 25,65 C 25,45 65,25 125,25 C 185,25 225,45 225,65 C 225,85 185,105 125,105 C 65,105 25,85 25,65 Z" fill="none" stroke="currentColor" strokeWidth="2" />
                          {/* 2x Ø9 Mounting Holes on 84mm centers */}
                          <circle cx="45" cy="65" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="205" cy="65" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          {/* Center 40mm Bore & 18mm through hole */}
                          <circle cx="125" cy="65" r="28" fill="var(--warning-bg, rgba(245, 203, 92, 0.18))" stroke="var(--primary)" strokeWidth="2" />
                          <circle cx="125" cy="65" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4,2" />
                          {/* Dimension labels */}
                          <text x="125" y="70" textAnchor="middle" fontSize="10" fill="var(--primary)" fontWeight="800">Ø40 H7</text>
                          <text x="125" y="120" textAnchor="middle" fontSize="8.5" fill="currentColor" fontWeight="700">L = 104 mm | 2x Ø9</text>
                        </svg>
                      ) : housingType === 'square' || product.name.toLowerCase().includes('casing') || product.name.toLowerCase().includes('housing') ? (
                        /* 70sq_40mmdia Drawing: 70x70 square with 4x Ø7 corner holes */
                        <svg width="250" height="130" viewBox="0 0 250 130">
                          <line x1="20" y1="65" x2="230" y2="65" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          <line x1="125" y1="10" x2="125" y2="120" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          {/* 70x70 Square Flange (R7 corners) */}
                          <rect x="65" y="15" width="120" height="100" rx="12" fill="none" stroke="currentColor" strokeWidth="2" />
                          {/* 4x Ø7 Corner Mounting Holes (35x35 pitch, PCD 75) */}
                          <circle cx="80" cy="30" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="170" cy="30" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="80" cy="100" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="170" cy="100" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          {/* Center 40mm Bore & 18mm through hole */}
                          <circle cx="125" cy="65" r="28" fill="var(--warning-bg, rgba(245, 203, 92, 0.18))" stroke="var(--primary)" strokeWidth="2" />
                          <circle cx="125" cy="65" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4,2" />
                          {/* Dimension labels */}
                          <text x="125" y="70" textAnchor="middle" fontSize="10" fill="var(--primary)" fontWeight="800">Ø40 H7</text>
                          <text x="125" y="125" textAnchor="middle" fontSize="8.5" fill="currentColor" fontWeight="700">70×70 mm | 4x Ø7 (PCD Ø75)</text>
                        </svg>
                      ) : product.name.toLowerCase().includes('bearing') || (product.sku || '').toLowerCase().includes('brg') ? (
                        /* Deep Groove Radial Ball Bearing Orthographic Section */
                        <svg width="250" height="130" viewBox="0 0 250 130">
                          <line x1="20" y1="65" x2="230" y2="65" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          <line x1="125" y1="10" x2="125" y2="120" stroke="var(--border)" strokeDasharray="5,3" strokeWidth="1" />
                          {/* Outer Ring (Ø40mm) */}
                          <circle cx="125" cy="65" r="48" fill="none" stroke="currentColor" strokeWidth="2" />
                          <circle cx="125" cy="65" r="38" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3,2" />
                          {/* Rolling Ball Elements */}
                          {[0, 45, 90, 135, 180, 225, 270, 315].map((ang, i) => {
                            const rad = (ang * Math.PI) / 180;
                            const bx = 125 + 29 * Math.cos(rad);
                            const by = 65 + 29 * Math.sin(rad);
                            return <circle key={i} cx={bx} cy={by} r="7" fill="var(--warning-bg, rgba(245, 203, 92, 0.25))" stroke="var(--primary)" strokeWidth="1.5" />;
                          })}
                          {/* Inner Ring (Ø18mm) */}
                          <circle cx="125" cy="65" r="20" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3,2" />
                          <circle cx="125" cy="65" r="14" fill="var(--bg-secondary)" stroke="currentColor" strokeWidth="2" />
                          <text x="125" y="68" textAnchor="middle" fontSize="9" fill="var(--primary)" fontWeight="800">Ø18 d</text>
                          <text x="210" y="30" fontSize="8.5" fill="currentColor" fontWeight="700">OD: Ø40mm</text>
                          <text x="210" y="44" fontSize="8" fill="var(--text-muted)">B = 12mm</text>
                        </svg>
                      ) : (
                        /* Stepped Ground Shaft Blueprint */
                        <svg width="250" height="130" viewBox="0 0 250 130">
                          <line x1="10" y1="65" x2="240" y2="65" stroke="var(--primary)" strokeDasharray="6,3" strokeWidth="1.2" />
                          {/* Stepped Shaft Profile */}
                          <rect x="25" y="50" width="45" height="30" fill="var(--bg-secondary)" stroke="currentColor" strokeWidth="1.5" />
                          <rect x="70" y="42" width="70" height="46" fill="var(--warning-bg, rgba(245, 203, 92, 0.15))" stroke="var(--primary)" strokeWidth="2" />
                          <rect x="140" y="48" width="85" height="34" fill="var(--bg-secondary)" stroke="currentColor" strokeWidth="1.5" />
                          {/* Chamfers */}
                          <line x1="25" y1="50" x2="30" y2="50" stroke="currentColor" strokeWidth="2" />
                          <line x1="220" y1="48" x2="225" y2="53" stroke="currentColor" strokeWidth="1.5" />
                          {/* Dimension labels */}
                          <text x="105" y="69" textAnchor="middle" fontSize="9.5" fill="var(--primary)" fontWeight="800">Ø18 h6 Journal</text>
                          <text x="105" y="112" textAnchor="middle" fontSize="8.5" fill="currentColor" fontWeight="700">L = 120 mm | EN8 Steel</text>
                          <text x="182" y="42" textAnchor="middle" fontSize="7.5" fill="var(--text-muted)">Ra 0.8 µm</text>
                        </svg>
                      )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Bore Fit: Ø40 mm H7 (+0.025 / 0 mm)</span>
                      <span>Depth: 12.0 mm (Seat)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Add to Cart CTA */}
              <motion.button
                whileTap={inStock ? { scale: 0.97 } : {}}
                className={`btn btn-lg ${added ? 'btn-ghost' : 'btn-primary'}`}
                style={{ width: '100%', padding: '16px' }}
                onClick={handleAdd}
                disabled={!inStock}
              >
                {added ? (
                  <><Check size={20} /> Added to Cart</>
                ) : inStock ? (
                  <><ShoppingCart size={20} /> Add to Cart ({formatPrice(product.price)})</>
                ) : (
                  'Currently Out of Stock in ASRS'
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
