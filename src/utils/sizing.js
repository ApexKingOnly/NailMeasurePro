/**
 * Sizing Engine for NailScale AI
 * 
 * Reference: US Quarter = 24.26mm
 */

const QUARTER_MM = 24.26;
const SIZE_LOCK_TOLERANCE_MM = 0.08;
const SIZE_SAFETY_BUFFER_MM = 0;

export const NAIL_FIT_PROFILES = [
  { key: 'standard', label: 'Standard fit', adjustmentMm: 0 },
  { key: 'runs-narrow', label: 'Runs narrow', adjustmentMm: 0.25 },
  { key: 'runs-wide', label: 'Runs wide', adjustmentMm: -0.25 },
];

export const NAIL_BED_CURVES = [
  { key: 'flat', label: 'Flat nail bed', adjustmentMm: 0 },
  { key: 'medium', label: 'Medium curve', adjustmentMm: 0 },
  { key: 'rounded', label: 'Rounded nail bed', adjustmentMm: 0.2 },
];

export const DEFAULT_FIT_CONTEXT = {
  productProfile: 'standard',
  nailBedCurve: 'medium',
  manufacturer: 'Nails By Liz default',
};

// Nails By Liz press-on tip widths, ordered largest to smallest.
// Some manufacturers vary by shape; this chart uses the supplied default
// widths and returns ranges instead of hard-snapping between sizes.
export const SIZING_CHART = [
  { size: '0', mm: 14.0 },
  { size: '1', mm: 13.0 },
  { size: '2', mm: 12.0 },
  { size: '3', mm: 11.0 },
  { size: '4', mm: 10.5 },
  { size: '5', mm: 10.0 },
  { size: '6', mm: 9.5 },
  { size: '7', mm: 9.0 },
  { size: '8', mm: 8.5, alternateMm: [7.0] },
  { size: '9', mm: 8.0 },
  { size: '10', mm: 7.5 }
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
  return profile.adjustmentMm + curve.adjustmentMm + SIZE_SAFETY_BUFFER_MM;
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

const getPressOnWidthRange = () => {
  const widths = SIZING_CHART.map(item => item.mm);
  return {
    minMM: Math.min(...widths) - 0.25,
    maxMM: Math.max(...widths) + 0.25,
  };
};

export const compareToPressOnRange = (adjustedMM) => {
  const width = Number(adjustedMM);
  const range = getPressOnWidthRange();
  if (!Number.isFinite(width) || width <= 0) {
    return { ...range, status: 'invalid', warning: 'Measured width unavailable' };
  }
  if (width < range.minMM) {
    return { ...range, status: 'below-range', warning: 'Below the default press-on range; verify nail guide placement or product shape' };
  }
  if (width > range.maxMM) {
    return { ...range, status: 'above-range', warning: 'Above the default press-on range; verify quarter calibration and guide placement' };
  }
  return { ...range, status: 'in-range', warning: '' };
};

export const getNailSizeRecommendation = (mm, fitContext = DEFAULT_FIT_CONTEXT) => {
  const rawMM = Number(mm);
  if (!Number.isFinite(rawMM) || rawMM < 5) {
    return {
      size: 'N/A',
      recommendedSize: null,
      alternateSize: null,
      sizeRange: null,
      isBetween: false,
      rawMM: Number.isFinite(rawMM) ? rawMM : 0,
      adjustedMM: 0,
      fitAdjustmentMM: getFitAdjustmentMM(fitContext),
      rangeCheck: compareToPressOnRange(0),
    };
  }

  const adjustedMM = getAdjustedNailWidthMM(rawMM, fitContext);
  const rangeCheck = compareToPressOnRange(adjustedMM);

  if (adjustedMM >= SIZING_CHART[0].mm) {
    return {
      size: SIZING_CHART[0].size,
      recommendedSize: SIZING_CHART[0].size,
      alternateSize: null,
      sizeRange: SIZING_CHART[0].size,
      isBetween: false,
      rawMM,
      adjustedMM,
      fitAdjustmentMM: getFitAdjustmentMM(fitContext),
      rangeCheck,
    };
  }

  const last = SIZING_CHART[SIZING_CHART.length - 1];
  if (adjustedMM <= last.mm) {
    return {
      size: last.size,
      recommendedSize: last.size,
      alternateSize: null,
      sizeRange: last.size,
      isBetween: false,
      rawMM,
      adjustedMM,
      fitAdjustmentMM: getFitAdjustmentMM(fitContext),
      rangeCheck,
    };
  }

  for (let index = 0; index < SIZING_CHART.length - 1; index += 1) {
    const largerTip = SIZING_CHART[index];
    const smallerTip = SIZING_CHART[index + 1];

    if (adjustedMM <= largerTip.mm && adjustedMM >= smallerTip.mm) {
      const largerDiff = Math.abs(adjustedMM - largerTip.mm);
      const smallerDiff = Math.abs(adjustedMM - smallerTip.mm);

      if (largerDiff <= SIZE_LOCK_TOLERANCE_MM) {
        return {
          size: largerTip.size,
          recommendedSize: largerTip.size,
          alternateSize: smallerTip.size,
          sizeRange: `${largerTip.size}-${smallerTip.size}`,
          isBetween: false,
          rawMM,
          adjustedMM,
          fitAdjustmentMM: getFitAdjustmentMM(fitContext),
          rangeCheck,
        };
      }

      if (smallerDiff <= SIZE_LOCK_TOLERANCE_MM) {
        return {
          size: smallerTip.size,
          recommendedSize: smallerTip.size,
          alternateSize: largerTip.size,
          sizeRange: `${largerTip.size}-${smallerTip.size}`,
          isBetween: false,
          rawMM,
          adjustedMM,
          fitAdjustmentMM: getFitAdjustmentMM(fitContext),
          rangeCheck,
        };
      }

      return {
        size: `${largerTip.size}-${smallerTip.size}`,
        recommendedSize: largerTip.size,
        alternateSize: smallerTip.size,
        sizeRange: `${largerTip.size}-${smallerTip.size}`,
        isBetween: true,
        rawMM,
        adjustedMM,
        fitAdjustmentMM: getFitAdjustmentMM(fitContext),
        rangeCheck,
      };
    }
  }

  return {
    size: last.size,
    recommendedSize: last.size,
    alternateSize: null,
    sizeRange: last.size,
    isBetween: false,
    rawMM,
    adjustedMM,
    fitAdjustmentMM: getFitAdjustmentMM(fitContext),
    rangeCheck,
  };
};

/**
 * Maps MM to nearest press-on nail size
 * Includes a product-fit and nail-bed curvature adjustment.
 */
export const mmToNailSize = (mm, fitContext = DEFAULT_FIT_CONTEXT) => {
  return getNailSizeRecommendation(mm, fitContext).size;
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
  const recommendation = getNailSizeRecommendation(mm, fitContext);
  
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
    size: recommendation.size || "N/A",
    recommendedSize: recommendation.recommendedSize,
    alternateSize: recommendation.alternateSize,
    sizeRange: recommendation.sizeRange,
    adjustedMM: recommendation.adjustedMM?.toFixed?.(2) || "0.00",
    isBetween: recommendation.isBetween,
    rangeCheck: recommendation.rangeCheck,
    guidance: guidance || "Initializing...",
    isStable: isStable || false
  };
};
