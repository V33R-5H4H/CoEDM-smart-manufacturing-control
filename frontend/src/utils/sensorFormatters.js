/**
 * Shared sensor display helpers used across CNC machine pages (Mirac, Triac, etc.)
 */

/**
 * Render a sensor value or a fallback string if null/undefined (sensor offline).
 * Ensures the user can distinguish "sensor reads zero" from "sensor disconnected".
 *
 * @param {number|null|undefined} value
 * @param {number} decimals
 * @param {string} fallback
 * @returns {string}
 */
export const sensorVal = (value, decimals = 2, fallback = "---") => {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(decimals);
};

/**
 * ISO 10816 vibration severity colour coding (velocity RMS in mm/s):
 *   < 2.8   → green  (Zone A — new machinery)
 *   2.8–7.1 → amber  (Zone B — acceptable for long-term)
 *   7.1–18  → orange (Zone C — alarm, short-term only)
 *   > 18    → red    (Zone D — danger)
 *
 * @param {number|null|undefined} value
 * @returns {string} CSS colour value
 */
export const vibColor = (value) => {
  if (value === null || value === undefined) return 'var(--text-muted)';
  if (value < 2.8) return 'var(--status-ok)';
  if (value < 7.1) return '#c9922e';
  if (value < 18)  return '#f97316';
  return 'var(--status-error)';
};
