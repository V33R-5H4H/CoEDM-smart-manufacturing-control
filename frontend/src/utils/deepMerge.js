/**
 * frontend/src/utils/deepMerge.js
 *
 * Recursively merges `source` into `target`, returning a new object.
 *
 * Used by WebSocket onmessage handlers to apply delta payloads onto the
 * existing React state without clobbering unchanged nested fields.
 *
 * Rules:
 *   - Plain objects are merged recursively (keys from source win)
 *   - Arrays are replaced wholesale (delta replaces, not concatenates)
 *   - Primitives (string, number, bool, null) from source replace target
 */
export function deepMerge(target, source) {
  // Guard: if either side isn't a plain object, source wins outright
  if (
    source === null ||
    typeof source !== 'object' ||
    Array.isArray(source)
  ) {
    return source;
  }
  if (
    target === null ||
    typeof target !== 'object' ||
    Array.isArray(target)
  ) {
    return source;
  }

  const out = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      // Both sides are plain objects — recurse
      out[key] = deepMerge(tgtVal, srcVal);
    } else {
      // Primitive, array, or null — source wins
      out[key] = srcVal;
    }
  }

  return out;
}
