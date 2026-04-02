/**
 * NailMeasure Pro - Sizing Logic
 * Standard Press-On Sizes (Generic 00-9)
 */

const SIZE_MAP = [
  { size: '00', min: 18.0, max: 19.0 },
  { size: '0',  min: 17.0, max: 17.9 },
  { size: '1',  min: 16.0, max: 16.9 },
  { size: '2',  min: 15.0, max: 15.9 },
  { size: '3',  min: 14.0, max: 14.9 },
  { size: '4',  min: 13.0, max: 13.9 },
  { size: '5',  min: 12.0, max: 12.9 },
  { size: '6',  min: 11.0, max: 11.9 },
  { size: '7',  min: 10.0, max: 10.9 },
  { size: '8',  min: 9.0,  max: 9.9 },
  { size: '9',  min: 8.0,  max: 8.9 }
]

/**
 * Converts measured MM width to Press-On size.
 * Adds 1mm buffer for nail curvature.
 * @param {number} mm - Measured width in millimeters
 * @returns {string} - Predicted Size (00-9)
 */
export const mmToSize = (mm) => {
  const bufferedMM = mm + 1.0;
  const match = SIZE_MAP.find(s => bufferedMM >= s.min && bufferedMM <= s.max);
  
  if (!match) {
    if (bufferedMM > 19.0) return '00';
    if (bufferedMM < 8.0) return '9';
    return '?';
  }
  
  return match.size;
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
