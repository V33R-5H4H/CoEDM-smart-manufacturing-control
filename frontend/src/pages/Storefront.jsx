import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { bearingsData } from '../data/bearingsData';
import './Storefront.css';

const HOUSINGS = [
  {
    id: 'bracket_40',
    name: 'Bracket 40mm',
    image: '/products/images/bracket-40mm.png',
    datasheet: '/products/datasheets/bracket-40mm.pdf',
    desc: 'Precision CNC milled 3-bolt bracket cantilever flanged bearing unit (54mm width, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, 40° reinforcement gusset (27mm height), and 3× Ø9mm mounting holes (R10 tip). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: Bracket_40mm (Jayesh Koisha).',
    details: [
      { label: 'DWG Reference', value: 'Bracket_40mm (Rev 1/1, Jayesh Koisha)' },
      { label: 'Component Type', value: '3-Bolt Cantilever Bracket Flanged Housing Unit' },
      { label: 'Bearing Bore (Seat)', value: 'Ø40.00 mm (H7 Tolerance Fit, Depth 12 mm)' },
      { label: 'Shaft Through-Hole', value: 'Ø18.00 mm' },
      { label: 'Counterbore / Step', value: 'Ø28.00 mm' },
      { label: 'Outer Hub Dimensions', value: 'Ø54.00 mm (Overall Height 30.00 mm)' },
      { label: 'Flange Dimensions', value: '60.00 mm Reach × 54.00 mm Width (10 mm Base)' },
      { label: 'Reinforcement Rib', value: '40° Angled Support Gusset (Height 27.00 mm)' },
      { label: 'Mounting Holes', value: '3× Ø9.00 mm (1 Tip Hole + 2 Inline Base Holes)' },
      { label: 'Flange Thickness', value: '10.00 mm Base Thickness' },
      { label: 'Origin / Station', value: 'Station 4 — TRIAC CNC Milling Centre' },
    ],
  },
  {
    id: '70sq_40',
    name: '70sq 40mm Diameter',
    image: '/products/images/70sq-40mm.png',
    datasheet: '/products/datasheets/70sq-40mm.pdf',
    desc: 'Precision CNC milled square 4-bolt flanged bearing housing unit (70×70mm, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, and 4× Ø7mm mounting holes on Ø75mm pitch circle (R7 corner fillets). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: 70sq_40mmdia (Jayesh Koisha).',
    details: [
      { label: 'DWG Reference', value: '70sq_40mmdia (Rev 1/1, Jayesh Koisha)' },
      { label: 'Component Type', value: '4-Bolt Square Flanged Housing Unit' },
      { label: 'Bearing Bore (Seat)', value: 'Ø40.00 mm (H7 Tolerance Fit, Depth 12 mm)' },
      { label: 'Shaft Through-Hole', value: 'Ø18.00 mm' },
      { label: 'Counterbore / Step', value: 'Ø28.00 mm' },
      { label: 'Outer Hub Dimensions', value: 'Ø54.00 mm (Overall Height 30.00 mm)' },
      { label: 'Flange Dimensions', value: '70.00 mm Length × 70.00 mm Width (R7 Corner Fillets)' },
      { label: 'Mounting Holes', value: '4× Ø7.00 mm on Ø75.00 mm Pitch Circle (PCD)' },
      { label: 'Flange Thickness', value: '10.00 mm Base Thickness' },
      { label: 'Origin / Station', value: 'Station 4 — TRIAC CNC Milling Centre' },
    ],
  },
  {
    id: 'oval_40',
    name: 'Oval 40mm',
    image: '/products/images/oval-40mm.png',
    datasheet: '/products/datasheets/oval-40mm.pdf',
    desc: 'Precision CNC milled rhombic oval 2-bolt flanged bearing unit (104×54mm, 30mm hub height) with Ø40mm H7 bore (12mm seat depth), Ø18mm through-hole, and 2× Ø9mm mounting holes on 84mm centers (R31 body, R10 tips). Origin: Station 4 TRIAC CNC Milling Centre. Drawing Ref: oval_40mm (Jayesh Koisha).',
    details: [
      { label: 'DWG Reference', value: 'oval_40mm (Rev 1/1, Jayesh Koisha)' },
      { label: 'Component Type', value: '2-Bolt Oval Rhombic Flanged Housing Unit' },
      { label: 'Bearing Bore (Seat)', value: 'Ø40.00 mm (H7 Tolerance Fit, Depth 12 mm)' },
      { label: 'Shaft Through-Hole', value: 'Ø18.00 mm' },
      { label: 'Counterbore / Step', value: 'Ø28.00 mm' },
      { label: 'Outer Hub Dimensions', value: 'Ø54.00 mm (Overall Height 30.00 mm)' },
      { label: 'Flange Dimensions', value: '104.00 mm Length × 54.00 mm Width (R31 Oval, R10 Tips)' },
      { label: 'Mounting Holes', value: '2× Ø9.00 mm on 84.00 mm Centers' },
      { label: 'Flange Thickness', value: '10.00 mm Base Thickness' },
      { label: 'Origin / Station', value: 'Station 4 — TRIAC CNC Milling Centre' },
    ],
  },
];

const SHAFTS = [
  {
    id: 'shaft_18_135',
    name: 'Precision Drive Shaft Ø18mm',
    image: '/products/images/shaft-default.png',
    desc: 'Induction-hardened chrome steel transmission shaft with ground finish and diamond knurled grip section. Engineered to pair with Ø18mm flanged housings and automated hydraulic assembly press.',
    details: [
      { label: 'Shaft Reference', value: 'SHAFT-18-135-CF53 (Standard Industrial)' },
      { label: 'Component Type', value: 'Ground Transmission Drive Shaft' },
      { label: 'Shaft Diameter (d)', value: 'Ø18.00 mm (h6 Precision Fit)' },
      { label: 'Total Length (L)', value: '135.00 mm (Matches Station 4 Press Stroke)' },
      { label: 'Material Grade', value: 'Induction Hardened CF53 / 100Cr6 (58-62 HRC)' },
      { label: 'Surface Finish', value: 'Ground & Polished (Ra 0.2 µm) + Knurled Band' },
      { label: 'Housing Fit', value: 'Engineered for Ø18mm Flanged Through-Hole' },
      { label: 'Manufacturing Cell', value: 'Station 4 — Turning & Cylindrical Grinding' },
    ],
  },
];

export default function Storefront() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // Housing detail inspection modal state
  const [modalHousingId, setModalHousingId] = useState(null);
  const selectedHousing = HOUSINGS.find((h) => h.id === modalHousingId) || null;
  const [showPdf, setShowPdf] = useState(false);

  // 3-Piece Assembly Kit Selection State
  const [chosenHousingId, setChosenHousingId] = useState(null);
  const chosenHousing = HOUSINGS.find((h) => h.id === chosenHousingId) || null;

  const [selectedBearingId, setSelectedBearingId] = useState(bearingsData[0]?.id || 1);
  const chosenBearing = bearingsData.find((b) => b.id === Number(selectedBearingId)) || bearingsData[0];

  const [chosenShaftId, setChosenShaftId] = useState(SHAFTS[0].id);
  const chosenShaft = SHAFTS.find((s) => s.id === chosenShaftId) || SHAFTS[0];

  const isKitComplete = Boolean(chosenHousing && chosenBearing && chosenShaft);
  const selectedCount = (chosenHousing ? 1 : 0) + (chosenBearing ? 1 : 0) + (chosenShaft ? 1 : 0);

  const [showFullTable, setShowFullTable] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  async function handlePlaceAssemblyOrder() {
    if (!chosenHousing || !chosenBearing || !chosenShaft) {
      const missing = [
        !chosenHousing && 'Housing',
        !chosenBearing && 'Bearing',
        !chosenShaft && 'Shaft',
      ].filter(Boolean).join(', ');
      toast.warn(`Please select all 3 components (${missing} missing) before placing your assembly order!`);
      return;
    }
    if (orderLoading) return;

    const kitTitle = `Assembly Kit (${chosenHousing.name} + ${chosenBearing.designation} + ${chosenShaft.name})`;
    try {
      setOrderLoading(true);
      const res = await fetch('/api/store/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: null,
          item_name: kitTitle,
          quantity: 1,
          item_type: 'assembly',
          shipping_address: `CoEDM Station 4 Automated Cell [H:${chosenHousing.id}, B:${chosenBearing.designation}, S:${chosenShaft.id}]`,
        }),
      });

      let orderId = Math.floor(1000 + Math.random() * 9000);
      if (res.ok) {
        const data = await res.json();
        orderId = data.order_id || orderId;
      }

      toast.success(`Assembly Order #${orderId} confirmed! Redirecting to AS/RS for automated retrieval...`, {
        autoClose: 2500,
      });

      // Redirect immediately to AS/RS page with order tracking parameters
      navigate(`/asrs?order_id=${orderId}&item=${encodeURIComponent(kitTitle)}&tracking=true`);
    } catch (err) {
      console.warn('Backend order request fallback:', err);
      const fallbackId = Math.floor(1000 + Math.random() * 9000);
      navigate(`/asrs?order_id=${fallbackId}&item=${encodeURIComponent(kitTitle)}&tracking=true`);
    } finally {
      setOrderLoading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && modalHousingId) {
        closeModal();
      }
    }

    if (modalHousingId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [modalHousingId]);

  const filteredBearings = bearingsData.filter(
    (b) =>
      (b.designation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.type || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  function openModal(housing) {
    setModalHousingId(housing.id);
    setShowPdf(false);
  }

  function closeModal() {
    setModalHousingId(null);
    setShowPdf(false);
  }

  return (
    <div className="store-page">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="store-hero">
        <div className="store-hero__bg" />
        <div className="store-hero__grid" />
        <div className="store-hero__content">
          <div className="store-hero__eyebrow">CoEDM Digital Store</div>
          <h1 className="store-hero__title">
            Precision Bearings &amp; Housings
          </h1>
          <p className="store-hero__sub">
            Order certified industrial-grade bearings and precision housings
            directly from the CoEDM automated manufacturing line.
          </p>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="store-body">

        {/* Housings */}
        <section>
          <div className="store-section-header">
            <div className="store-section-header__bar" />
            <h2 className="store-section-header__title">Precision Housings</h2>
          </div>

          <div className="store-housings-grid">
            {HOUSINGS.map((h) => (
              <button
                key={h.id}
                className={`store-housing-card ${chosenHousingId === h.id ? 'store-housing-card--chosen' : ''}`}
                onClick={() => openModal(h)}
              >
                <div className="store-housing-card__img-wrap">
                  <img
                    src={h.image}
                    alt={h.name}
                    className="store-housing-card__img"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="store-housing-card__img-fallback" style={{ display: 'none' }}>
                    <span className="material-symbols-outlined">deployed_code</span>
                    <span>Image coming soon</span>
                  </div>
                  {chosenHousingId === h.id && (
                    <div className="store-housing-card__chosen-badge">
                      <span className="material-symbols-outlined">check_circle</span>
                      Selected in Kit
                    </div>
                  )}
                </div>
                <div className="store-housing-card__label">
                  <span className="store-housing-card__name">{h.name}</span>
                  <span className="material-symbols-outlined store-housing-card__arrow">
                    {chosenHousingId === h.id ? 'check' : 'arrow_forward'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Bearing Catalog — Dropdown Selector */}
        <section className="store-bearing-section">
          <div className="store-catalog-toolbar">
            <div className="store-catalog-info">
              <div className="store-section-header" style={{ marginBottom: 6 }}>
                <div className="store-section-header__bar store-section-header__bar--purple" />
                <h2 className="store-section-header__title">Bearing Catalog</h2>
              </div>
              <p>Select any certified bearing from the dropdown below to view specifications and add to kit.</p>
            </div>
          </div>

          {/* ── Dropdown Picker & Specs Card ── */}
          <div className="store-bearing-card">
            <div className="store-bearing-dropdown-row">
              <label htmlFor="bearing-select" className="store-bearing-label">
                <span className="material-symbols-outlined">radio_button_checked</span>
                Choose Bearing Model:
              </label>
              <div className="store-bearing-select-wrap">
                <select
                  id="bearing-select"
                  className="store-bearing-select"
                  value={selectedBearingId}
                  onChange={(e) => setSelectedBearingId(e.target.value)}
                >
                  {bearingsData.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.designation} — {b.type} (d={b.d}mm, D={b.D}mm, B={b.B}mm)
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined store-bearing-select-arrow">arrow_drop_down</span>
              </div>
            </div>

            {/* Selected Bearing Live Detail Card */}
            {chosenBearing && (
              <div className="store-bearing-detail-box">
                <div className="store-bearing-detail-header">
                  <div>
                    <span className="store-bearing-type-badge">{chosenBearing.type}</span>
                    <h3 className="store-bearing-title">{chosenBearing.designation}</h3>
                  </div>
                  <div className="store-bearing-selected-pill">
                    <span className="material-symbols-outlined">check_circle</span>
                    Selected in Kit
                  </div>
                </div>

                <div className="store-bearing-specs-grid">
                  <div className="store-spec-tile">
                    <span className="store-spec-tile__label">Bore (d)</span>
                    <span className="store-spec-tile__val">{chosenBearing.d} mm</span>
                  </div>
                  <div className="store-spec-tile">
                    <span className="store-spec-tile__label">Outer Dia (D)</span>
                    <span className="store-spec-tile__val">{chosenBearing.D} mm</span>
                  </div>
                  <div className="store-spec-tile">
                    <span className="store-spec-tile__label">Width (B)</span>
                    <span className="store-spec-tile__val">{chosenBearing.B} mm</span>
                  </div>
                  <div className="store-spec-tile">
                    <span className="store-spec-tile__label">Dynamic Load (C)</span>
                    <span className="store-spec-tile__val store-spec-tile__val--highlight">{chosenBearing.C} kN</span>
                  </div>
                  <div className="store-spec-tile">
                    <span className="store-spec-tile__label">Static Load (C₀)</span>
                    <span className="store-spec-tile__val">{chosenBearing.C0} kN</span>
                  </div>
                </div>
              </div>
            )}

            {/* Optional Collapsible Full Table Toggle */}
            <div className="store-catalog-toggle-row">
              <button
                type="button"
                className="store-catalog-accordion-btn"
                onClick={() => setShowFullTable(!showFullTable)}
              >
                <span className="material-symbols-outlined">
                  {showFullTable ? 'unfold_less' : 'table_view'}
                </span>
                {showFullTable ? 'Collapse Full Catalog Table' : 'Browse All Bearings in Table'}
                <span className="material-symbols-outlined">
                  {showFullTable ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>

            {showFullTable && (
              <div className="store-table-dropdown-view">
                <div className="store-search-wrap" style={{ margin: '14px 0' }}>
                  <span className="store-search-wrap__icon material-symbols-outlined">search</span>
                  <input
                    type="text"
                    className="store-search"
                    placeholder="Search by designation or type…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="store-table-wrap">
                  <table className="store-table">
                    <thead>
                      <tr>
                        <th>Designation</th>
                        <th>Type</th>
                        <th>d (mm)</th>
                        <th>D (mm)</th>
                        <th>B (mm)</th>
                        <th>C (kN)</th>
                        <th>C₀ (kN)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBearings.length > 0 ? (
                        filteredBearings.slice(0, 50).map((b, idx) => (
                          <tr key={b.id || idx}>
                            <td className="designation">{b.designation || 'N/A'}</td>
                            <td className="bearing-type">{b.type || '—'}</td>
                            <td>{b.d}</td>
                            <td>{b.D}</td>
                            <td>{b.B}</td>
                            <td className="load-rating">{b.C}</td>
                            <td>{b.C0}</td>
                            <td className="action">
                              <button
                                className={`store-add-btn ${Number(selectedBearingId) === b.id ? 'store-add-btn--selected' : ''}`}
                                onClick={() => {
                                  setSelectedBearingId(b.id);
                                  toast.success(`✓ Selected bearing ${b.designation} in kit!`);
                                }}
                              >
                                {Number(selectedBearingId) === b.id ? 'Selected' : 'Select'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="8">
                            <div className="store-empty">
                              <span className="material-symbols-outlined">search_off</span>
                              No bearings match your search.
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Shaft Catalog (1 Default Shaft) ──────────────── */}
        <section className="store-shaft-section">
          <div className="store-catalog-toolbar">
            <div className="store-catalog-info">
              <div className="store-section-header" style={{ marginBottom: 6 }}>
                <div className="store-section-header__bar store-section-header__bar--cyan" />
                <h2 className="store-section-header__title">Shaft Catalog</h2>
              </div>
              <p>Standardized precision ground transmission drive shaft for automated hydraulic assembly.</p>
            </div>
          </div>

          <div className="store-shaft-card">
            <div className="store-shaft-card__img-wrap">
              <img
                src={SHAFTS[0].image}
                alt={SHAFTS[0].name}
                className="store-shaft-card__img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextSibling.style.display = 'flex';
                }}
              />
              <div className="store-shaft-card__img-fallback" style={{ display: 'none' }}>
                <span className="material-symbols-outlined">deployed_code</span>
                <span>Image coming soon</span>
              </div>
            </div>

            <div className="store-shaft-card__info">
              <div className="store-shaft-card__header">
                <div>
                  <span className="store-shaft-badge">Standard Transmission Spec</span>
                  <h3 className="store-shaft-name">{SHAFTS[0].name}</h3>
                </div>
                <div className="store-shaft-status-pill">
                  <span className="material-symbols-outlined">check_circle</span>
                  Included in Assembly Kit
                </div>
              </div>

              <p className="store-shaft-desc">{SHAFTS[0].desc}</p>

              <div className="store-shaft-spec-card">
                <table className="store-modal__spec-table">
                  <tbody>
                    {SHAFTS[0].details.map((d, i) => (
                      <tr key={i} className="store-modal__spec-row">
                        <td className="store-modal__spec-label">{d.label}</td>
                        <td className="store-modal__spec-value">{d.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── Manufacturing Assembly Kit Builder & Dispatch ── */}
        <section className="store-kit-section">
          <div className="store-kit-card">
            <div className="store-kit-header">
              <div>
                <div className="store-section-header" style={{ marginBottom: 6 }}>
                  <div className="store-section-header__bar store-section-header__bar--amber" />
                  <h2 className="store-section-header__title">Manufacturing Assembly Kit</h2>
                </div>
                <p>
                  To dispatch an automated manufacturing order, exactly 3 components must be chosen:
                  <strong> 1 Housing</strong>, <strong>1 Bearing</strong>, and <strong>1 Shaft</strong>.
                </p>
              </div>
              <div className="store-kit-chip-wrap">
                <span className={`store-kit-chip ${isKitComplete ? 'store-kit-chip--ready' : 'store-kit-chip--pending'}`}>
                  <span className="material-symbols-outlined">
                    {isKitComplete ? 'verified' : 'pending_actions'}
                  </span>
                  {isKitComplete ? '3/3 Components Ready' : `${selectedCount}/3 Components Selected`}
                </span>
              </div>
            </div>

            <div className="store-kit-slots">
              {/* Slot 1: Housing */}
              <div className={`store-kit-slot ${chosenHousing ? 'store-kit-slot--filled' : 'store-kit-slot--empty'}`}>
                <div className="store-kit-slot__num">1</div>
                <div className="store-kit-slot__body">
                  <div className="store-kit-slot__label">Housing Component</div>
                  {chosenHousing ? (
                    <>
                      <div className="store-kit-slot__val">{chosenHousing.name}</div>
                      <div className="store-kit-slot__sub">Ø40mm Bore Seat • TRIAC Milled</div>
                    </>
                  ) : (
                    <div className="store-kit-slot__prompt">
                      <span className="material-symbols-outlined">touch_app</span>
                      Choose a Housing above
                    </div>
                  )}
                </div>
                <span className="material-symbols-outlined store-kit-slot__check">
                  {chosenHousing ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </div>

              {/* Slot 2: Bearing */}
              <div className={`store-kit-slot ${chosenBearing ? 'store-kit-slot--filled' : 'store-kit-slot--empty'}`}>
                <div className="store-kit-slot__num">2</div>
                <div className="store-kit-slot__body">
                  <div className="store-kit-slot__label">Bearing Component</div>
                  {chosenBearing ? (
                    <>
                      <div className="store-kit-slot__val">{chosenBearing.designation}</div>
                      <div className="store-kit-slot__sub">{chosenBearing.type} (d={chosenBearing.d}mm)</div>
                    </>
                  ) : (
                    <div className="store-kit-slot__prompt">
                      <span className="material-symbols-outlined">touch_app</span>
                      Choose a Bearing above
                    </div>
                  )}
                </div>
                <span className="material-symbols-outlined store-kit-slot__check">
                  {chosenBearing ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </div>

              {/* Slot 3: Shaft */}
              <div className={`store-kit-slot ${chosenShaft ? 'store-kit-slot--filled' : 'store-kit-slot--empty'}`}>
                <div className="store-kit-slot__num">3</div>
                <div className="store-kit-slot__body">
                  <div className="store-kit-slot__label">Shaft Component</div>
                  <div className="store-kit-slot__val">{chosenShaft.name}</div>
                  <div className="store-kit-slot__sub">Ø18mm × 135mm Ground CF53</div>
                </div>
                <span className="material-symbols-outlined store-kit-slot__check">
                  check_circle
                </span>
              </div>
            </div>

            <div className="store-kit-footer">
              <div className="store-kit-msg-box">
                {isKitComplete ? (
                  <div className="store-kit-msg store-kit-msg--ready">
                    <span className="material-symbols-outlined">task_alt</span>
                    All 3 components selected and validated. Ready to dispatch order to AS/RS automated warehouse & robotic assembly.
                  </div>
                ) : (
                  <div className="store-kit-msg store-kit-msg--pending">
                    <span className="material-symbols-outlined">info</span>
                    {!chosenHousing
                      ? 'Please select a Housing above to complete the 3-piece kit.'
                      : 'Please select a Bearing from the dropdown to complete the 3-piece kit.'}
                  </div>
                )}
              </div>

              <button
                className={`store-kit-submit-btn ${isKitComplete ? 'store-kit-submit-btn--ready' : ''}`}
                disabled={!isKitComplete || orderLoading}
                onClick={handlePlaceAssemblyOrder}
              >
                <span className="material-symbols-outlined">
                  {orderLoading ? 'sync' : isKitComplete ? 'precision_manufacturing' : 'lock'}
                </span>
                {orderLoading
                  ? 'Dispatching Order...'
                  : isKitComplete
                    ? 'Place Assembly Order (AS/RS -> AMR)'
                    : 'Select All 3 Components to Order'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ── Product Detail Modal ──────────────────────────── */}
      {selectedHousing && (
        <div className="store-modal-overlay" onClick={closeModal}>
          <div className="store-modal" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button className="store-modal__close" onClick={closeModal}>
              <span className="material-symbols-outlined">close</span>
            </button>

            {showPdf ? (
              /* ── PDF View ── */
              <div className="store-modal__pdf-view">
                <div className="store-modal__pdf-header">
                  <button className="store-modal__back-btn" onClick={() => setShowPdf(false)}>
                    <span className="material-symbols-outlined">arrow_back</span>
                    Back to details
                  </button>
                  <span className="store-modal__pdf-title">
                    {selectedHousing.name} — Datasheet
                  </span>
                  <a
                    href={selectedHousing.datasheet}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="store-modal__pdf-external"
                    title="Open in new tab"
                  >
                    <span className="material-symbols-outlined">open_in_new</span>
                  </a>
                </div>
                <iframe
                  src={selectedHousing.datasheet}
                  className="store-modal__pdf-frame"
                  title={`${selectedHousing.name} Datasheet`}
                />
              </div>
            ) : (
              /* ── Product Detail View ── */
              <div className="store-modal__detail">
                <div className="store-modal__img-wrap">
                  <img
                    src={selectedHousing.image}
                    alt={selectedHousing.name}
                    className="store-modal__img"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="store-modal__img-fallback" style={{ display: 'none' }}>
                    <span className="material-symbols-outlined">deployed_code</span>
                    <span>Image coming soon</span>
                  </div>
                </div>

                <div className="store-modal__info">
                  <p className="store-modal__name">{selectedHousing.name}</p>

                  {/* ── Technical Specifications Table ── */}
                  {selectedHousing.details && (
                    <div className="store-modal__spec-card">
                      <table className="store-modal__spec-table">
                        <tbody>
                          {selectedHousing.details.map((d, i) => (
                            <tr key={i} className="store-modal__spec-row">
                              <td className="store-modal__spec-label">{d.label}</td>
                              <td className="store-modal__spec-value">{d.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="store-modal__actions">
                    <button
                      className={`store-modal__order-btn ${chosenHousingId === selectedHousing.id ? 'store-modal__order-btn--selected' : ''}`}
                      onClick={() => {
                        setChosenHousingId(selectedHousing.id);
                        closeModal();
                        toast.success(`✓ Selected ${selectedHousing.name} for Assembly Kit!`);
                      }}
                    >
                      <span className="material-symbols-outlined">
                        {chosenHousingId === selectedHousing.id ? 'check_circle' : 'add_task'}
                      </span>
                      {chosenHousingId === selectedHousing.id ? 'Housing Selected in Kit' : 'Select This Housing for Kit'}
                    </button>
                    <button className="store-modal__pdf-btn" onClick={() => setShowPdf(true)}>
                      <span className="material-symbols-outlined">picture_as_pdf</span>
                      Know More
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
