/**
 * NailScale AI - Sizing Logic
 * Refined Mapping with +1mm Curvature Buffer logic
 */

/**
 * Convert measured width (mm) to standard press-on size (00-9)
 * Scale: [18mm:00, 17mm:0, 16mm:1, 15mm:2, 14mm:3, 13mm:4, 12mm:5, 11mm:6, 10mm:7, 9mm:8, 8mm:9]
 * @param {number} mm - Measured raw width in millimeters
 * @returns {string} - Predicted Size (00-9)
 */
export const mmToSize = (mm) => {
  // Apply +1mm curvature buffer as requested
  const buffered = mm + 1.0;
  
  if (buffered >= 17.5) return '00';
  if (buffered >= 16.5) return '0';
  if (buffered >= 15.5) return '1';
  if (buffered >= 14.5) return '2';
  if (buffered >= 13.5) return '3';
  if (buffered >= 12.5) return '4';
  if (buffered >= 11.5) return '5';
  if (buffered >= 10.5) return '6';
  if (buffered >= 9.5) return '7';
  if (buffered >= 8.5) return '8';
  return '9';
}

export const formatResults = (results) => {
  return Object.entries(results).reduce((acc, [id, data]) => {
    acc[id] = {
      ...data,
      size: mmToSize(data.widthMM)
    };
    return acc;
  }, {});
}
