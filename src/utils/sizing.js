/**
 * Sizing Engine for NailScale AI
 * 
 * Reference: US Dime = 17.91mm
 */

const DIME_MM = 17.91;

// Standard sizing chart (mm -> Size ID)
// Based on typical press-on nail width ranges
const SIZING_CHART = [
  { size: '00', mm: 18.0 },
  { size: '0', mm: 16.0 },
  { size: '1', mm: 15.0 },
  { size: '2', mm: 14.0 },
  { size: '3', mm: 13.0 },
  { size: '4', mm: 12.0 },
  { size: '5', mm: 11.0 },
  { size: '6', mm: 10.0 },
  { size: '7', mm: 9.0 },
  { size: '8', mm: 8.0 },
  { size: '9', mm: 7.0 }
];

/**
 * Calculates millimeters from pixel width based on dime calibration
 */
export const calculateMM = (pixelWidth, dimePixels) => {
  if (!dimePixels || dimePixels === 0) return 0;
  const ratio = DIME_MM / dimePixels;
  return pixelWidth * ratio;
};

/**
 * Maps MM to nearest press-on nail size
 * Includes a mandatory +1mm curvature buffer
 */
export const mmToNailSize = (mm) => {
  if (!mm || mm < 5) return 'N/A';
  
  // Add 1.0mm buffer for nail curvature (flat-to-curved correction)
  const bufferedMM = mm + 1.0;

  // Find the closest size or the next size up
  let bestMatch = SIZING_CHART[0];
  let minDiff = Math.abs(bufferedMM - SIZING_CHART[0].mm);

  for (let i = 1; i < SIZING_CHART.length; i++) {
    const diff = Math.abs(bufferedMM - SIZING_CHART[i].mm);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = SIZING_CHART[i];
    }
  }

  return bestMatch.size;
};

export const getFullSizing = (pixelWidth, dimePixels, handLandmarks, canvasWidth, canvasHeight) => {
  const mm = calculateMM(pixelWidth, dimePixels);
  const size = mmToNailSize(mm);
  
  let guidance = "Position Target...";
  let isStable = false;

  if (handLandmarks) {
    if (!dimePixels || dimePixels < 1) {
       guidance = "Place Dime in Circle ⭕";
    } else {
       // 2. Tilt/Orientation Check (Simple Plane Delta)
       const mcpY = (handLandmarks[5].y + handLandmarks[17].y) / 2;
       const tiltY = handLandmarks[0].y - mcpY; 

       if (tiltY > 0.4) guidance = "Tilt Camera Up ⤊";
       else if (tiltY < -0.4) guidance = "Tilt Camera Down ⤋";
       else {
          guidance = "PERFECT SIGNAL ✨";
          isStable = true;
       }
    }
  }

  return {
    mm: mm?.toFixed?.(2) || "0.00",
    size: size || "N/A",
    guidance: guidance || "Initializing...",
    isStable: isStable || false
  };
};
