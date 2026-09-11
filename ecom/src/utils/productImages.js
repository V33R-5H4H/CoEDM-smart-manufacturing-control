/**
 * ecom/src/utils/productImages.js
 * Centralized deterministic asset resolver for products and assemblies.
 */

export function getProductAsset(name = '', sku = '', imageUrl = null) {
  if (imageUrl && !imageUrl.includes('placeholder') && !imageUrl.includes('null')) {
    return imageUrl;
  }

  const n = (name || '').toLowerCase();
  const s = (sku || '').toLowerCase();

  // Bearings
  if (n.includes('bearing') || s.includes('brg')) {
    if (n.includes('6204') || s.includes('02') || n.includes('roller')) return '/images/bearing2.png';
    if (n.includes('6002') || s.includes('03') || n.includes('thrust')) return '/images/bearing3.png';
    return '/images/bearing.png';
  }

  // Shafts
  if (n.includes('shaft') || s.includes('sft')) {
    if (n.includes('stepped') || s.includes('02') || n.includes('splined')) return '/images/shaft2.png';
    if (n.includes('hollow') || s.includes('03') || n.includes('keyed')) return '/images/shaft3.png';
    return '/images/shaft.png';
  }

  // Casings / Housings (The 3 standard manufacturing housings)
  if (n.includes('casing') || n.includes('housing') || s.includes('csg') || s.includes('hsg') || n.includes('bracket') || n.includes('oval') || n.includes('70sq')) {
    if (n.includes('bracket') || s.includes('brk') || n.includes('bracket_40mm')) return '/images/casing3.png';
    if (n.includes('oval') || s.includes('ovl') || n.includes('oval_40mm')) return '/images/casing2.png';
    if (n.includes('70sq') || n.includes('square') || s.includes('sqr') || n.includes('70sq_40mmdia')) return '/images/casing.png';
    return '/images/casing.png';
  }

  // Default fallback for mechanical parts
  if (n.includes('milling') || n.includes('billet') || n.includes('alu')) return '/images/shaft.png';
  if (n.includes('block') || n.includes('steel')) return '/images/casing.png';

  return '/images/shaft.png';
}

export function formatPrice(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

