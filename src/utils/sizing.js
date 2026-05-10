/**
 * Sizing Engine for NailScale AI
 * 
 * Reference: US Quarter = 24.26mm
 */

const QUARTER_MM = 24.26;

export const NAIL_FIT_PROFILES = [
  { key: 'standard', label: 'Standard fit', adjustmentMm: 0 },
  { key: 'runs-narrow', label: 'Runs narrow', adjustmentMm: 0.5 },
  { key: 'runs-wide', label: 'Runs wide', adjustmentMm: -0.5 },
];

export const NAIL_BED_CURVES = [
  { key: 'flat', label: 'Flat nail bed', adjustmentMm: 0.5 },
  { key: 'medium', label: 'Medium curve', adjustmentMm: 1.0 },
  { key: 'rounded', label: 'Rounded nail bed', adjustmentMm: 1.5 },
];

export const DEFAULT_FIT_CONTEXT = {
  productProfile: 'standard',
  nailBedCurve: 'medium',
  manufacturer: 'Nails By Liz default',
};

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

const findFitProfile = (key) => (
  NAIL_FIT_PROFILES.find(profile => profile.key === key) || NAIL_FIT_PROFILES[0]
);

const findNailBedCurve = (key) => (
  NAIL_BED_CURVES.find(curve => curve.key === key) || NAIL_BED_CURVES[1]
);

export const normalizeFitContext = (fitContext = {}) => ({
  manufacturer: String(fitContext.manufacturer || DEFAULT_FIT_CONTEXT.manufacturer).trim().slice(0, 80) || DEFAULT_FIT_CONTEXT.manufacturer,
  productProfile: findFitProfile(fitContext.productProfile).key,
  nailBedCurve: findNailBedCurve(fitContext.nailBedCurve).key,
});

export const getFitAdjustmentMM = (fitContext = DEFAULT_FIT_CONTEXT) => {
  const normalized = normalizeFitContext(fitContext);
  const profile = findFitProfile(normalized.productProfile);
  const curve = findNailBedCurve(normalized.nailBedCurve);
  return profile.adjustmentMm + curve.adjustmentMm;
};

export const getAdjustedNailWidthMM = (mm, fitContext = DEFAULT_FIT_CONTEXT) => {
  const width = Number(mm);
  if (!Number.isFinite(width) || width <= 0) return 0;
  return width + getFitAdjustmentMM(fitContext);
};

/**
 * Calculates millimeters from pixel width based on quarter calibration
 */
export const calculateMM = (pixelWidth, quarterPixels) => {
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(quarterPixels) || pixelWidth <= 0 || quarterPixels <= 0) return 0;
  const ratio = QUARTER_MM / quarterPixels;
  return pixelWidth * ratio;
};

/**
 * Maps MM to nearest press-on nail size
 * Includes a product-fit and nail-bed curvature adjustment.
 */
export const mmToNailSize = (mm, fitContext = DEFAULT_FIT_CONTEXT) => {
  if (!mm || mm < 5) return 'N/A';
  const adjustedMM = getAdjustedNailWidthMM(mm, fitContext);

  // Find the closest size or the next size up
  let bestMatch = SIZING_CHART[0];
  let minDiff = Math.abs(adjustedMM - SIZING_CHART[0].mm);

  for (let i = 1; i < SIZING_CHART.length; i++) {
    const diff = Math.abs(adjustedMM - SIZING_CHART[i].mm);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = SIZING_CHART[i];
    }
  }

  return bestMatch.size;
};

/**
 * V29: Distal Phalanx Scan
 * Calculates the horizontal width of the fingertip phalanx in pixels.
 * Uses the tip (e.g. 8) and DIP joint (e.g. 7) to estimate local width.
 */
export const calculateFingerWidthPixels = (hand, fingerIndex, canvasWidth, canvasHeight) => {
  if (!hand || !hand[fingerIndex] || !hand[fingerIndex - 1]) return 0;
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) return 0;

  const tip = hand[fingerIndex];
  const dip = hand[fingerIndex - 1]; // DIP joint is the previous landmark in MD sequence for non-thumb

  // Euclidean Distance in Pixels (Verticalish)
  const dy = (tip.y - dip.y) * canvasHeight;
  const dx = (tip.x - dip.x) * canvasWidth;
  const phalanxLength = Math.sqrt(dx * dx + dy * dy);

  // Distal Phalanx Aspect Ratio: Typically width is ~0.85 of length
  return Number.isFinite(phalanxLength) ? phalanxLength * 0.85 : 0;
};

export const getFullSizing = (pixelWidth, quarterPixels, handLandmarks, canvasWidth, canvasHeight, fitContext = DEFAULT_FIT_CONTEXT) => {
  const mm = calculateMM(pixelWidth, quarterPixels);
  const size = mmToNailSize(mm, fitContext);
  
  let guidance = "Position Target...";
  let isStable = false;

  if (handLandmarks) {
    if (!quarterPixels || quarterPixels < 1) {
       guidance = "Place Quarter in Circle";
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
