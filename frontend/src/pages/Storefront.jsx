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

export default function Storefront() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHousingId, setSelectedHousingId] = useState(null);
  const selectedHousing = HOUSINGS.find((h) => h.id === selectedHousingId) || null;
  const [showPdf, setShowPdf] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  async function handlePlaceOrder(item, itemType = 'housing') {
    if (orderLoading) return;
    const itemName = item.name || item.designation || 'Precision Industrial Part';
    try {
      setOrderLoading(true);
      const res = await fetch('/api/store/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: typeof item.id === 'number' ? item.id : null,
          item_name: itemName,
          quantity: 1,
          item_type: itemType,
        }),
      });

      let orderId = Math.floor(1000 + Math.random() * 9000);
      if (res.ok) {
        const data = await res.json();
        orderId = data.order_id || orderId;
      }

      toast.info(`Order #${orderId} placed! Redirecting to AS/RS for retrieval...`, {
        autoClose: 2500,
      });

      // Close modal if open
      setSelectedHousingId(null);

      // Redirect immediately to AS/RS page with order tracking parameters
      navigate(`/asrs?order_id=${orderId}&item=${encodeURIComponent(itemName)}&tracking=true`);
    } catch (err) {
      console.warn('Backend order request fallback:', err);
      const fallbackId = Math.floor(1000 + Math.random() * 9000);
      setSelectedHousingId(null);
      navigate(`/asrs?order_id=${fallbackId}&item=${encodeURIComponent(itemName)}&tracking=true`);
    } finally {
      setOrderLoading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && selectedHousingId) {
        closeModal();
      }
    }

    if (selectedHousingId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [selectedHousingId]);

  const filteredBearings = bearingsData.filter(
    (b) =>
      (b.designation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.type || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  function openModal(housing) {
    setSelectedHousingId(housing.id);
    setShowPdf(false);
  }

  function closeModal() {
    setSelectedHousingId(null);
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
              <button key={h.id} className="store-housing-card" onClick={() => openModal(h)}>
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
                </div>
                <div className="store-housing-card__label">
                  <span className="store-housing-card__name">{h.name}</span>
                  <span className="material-symbols-outlined store-housing-card__arrow">arrow_forward</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Bearing Catalog */}
        <section>
          <div className="store-catalog-toolbar">
            <div className="store-catalog-info">
              <div className="store-section-header" style={{ marginBottom: 4 }}>
                <div className="store-section-header__bar store-section-header__bar--purple" />
                <h2 className="store-section-header__title">Bearing Catalog</h2>
              </div>
              <p>Browse our full inventory of certified ball and roller bearings.</p>
            </div>
            <div className="store-search-wrap">
              <span className="store-search-wrap__icon material-symbols-outlined">search</span>
              <input
                type="text"
                className="store-search"
                placeholder="Search by designation or type…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
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
                  filteredBearings.slice(0, 60).map((b, idx) => (
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
                          className="store-add-btn"
                          disabled={orderLoading}
                          onClick={() => handlePlaceOrder(b, 'bearing')}
                        >
                          Add
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
            <div className="store-table-footer">
              <span>
                Showing {Math.min(filteredBearings.length, 60)} of {filteredBearings.length} bearings
              </span>
              {filteredBearings.length > 60 && <span>Refine your search to see more</span>}
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
                  <p className="store-modal__desc">{selectedHousing.desc}</p>

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
                      className="store-modal__order-btn"
                      disabled={orderLoading}
                      onClick={() => handlePlaceOrder(selectedHousing, 'housing')}
                    >
                      <span className="material-symbols-outlined">add_shopping_cart</span>
                      {orderLoading ? 'Placing Order...' : 'Add to Order'}
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
