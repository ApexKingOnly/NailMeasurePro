/**
 * VisionEngine.js - Wrapper for OpenCV.js Circle Detection & Calibration
 */

const DIME_DIAMETER_MM = 17.91; // Standard US Dime

/**
 * Detects circle (Dime) in current frame and calculates pixels-per-mm.
 * @param {HTMLVideoElement} video - Current video element
 * @param {object} cv - OpenCV instance
 * @returns {object|null} - { ratio, x, y, r, widthPx }
 */
export const detectDimeAndCalibrate = (video, cv) => {
  if (!cv || !video) return null;

  try {
    let src = cv.imread(video);
    let gray = new cv.Mat();
    let circles = new cv.Mat();
    
    // Low-pass filter to reduce noise
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(9, 9), 2, 2);
    
    // Hough Circle Transform
    cv.HoughCircles(
      gray,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      45,   // Min distance between centers
      75,   // Param1 (Canny upper threshold)
      40,   // Param2 (Accumulator threshold) - Increase for fewer false positives
      50,   // Min radius (pixels)
      150   // Max radius (pixels)
    );

    let result = null;
    if (circles.cols > 0) {
      // Take the most prominent circle
      let x = circles.data32F[0];
      let y = circles.data32F[1];
      let r = circles.data32F[2];
      let widthPx = r * 2;
      
      result = {
        x, y, r, widthPx,
        ratio: DIME_DIAMETER_MM / widthPx
      };
    }

    // Cleanup Mats
    src.delete();
    gray.delete();
    circles.delete();
    
    return result;
  } catch (err) {
    console.error("OpenCV Error:", err);
    return null;
  }
}

/**
 * Measures an object (fingernail) using the established ratio.
 * @param {number} pixels - Width in pixels
 * @param {number} ratio - pixels-to-mm ratio
 * @returns {number} - Width in mm
 */
export const measurePixelsToMM = (pixels, ratio) => {
  return pixels * ratio;
}
