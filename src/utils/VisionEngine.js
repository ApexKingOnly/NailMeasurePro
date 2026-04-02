/**
 * NailScale AI - Unified Vision Engine
 * Combines OpenCV.js (for Dime Scaler) and MediaPipe Hands (for Nail Bed Span detection)
 */

export const detectDimeAndCalibrate = (cv, mat) => {
  const gray = new cv.Mat();
  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(9, 9), 2, 2);

  const circles = new cv.Mat();
  // Hough Circle detection for US Dime
  cv.HoughCircles(
    gray,
    circles,
    cv.HOUGH_GRADIENT,
    1,
    gray.rows / 8,
    100,
    30,
    70, // Min Radius ~ 40px
    120 // Max Radius ~ 150px
  );

  let pixelsPerMM = 0;
  let dimeInfo = null;

  if (circles.cols > 0) {
    const x = circles.data32F[0];
    const y = circles.data32F[1];
    const r = circles.data32F[2];
    
    // US Dime is 17.91mm in diameter (2*r = 17.91)
    pixelsPerMM = (2 * r) / 17.91;
    dimeInfo = { x, y, r, pixelsPerMM };
  }

  gray.delete();
  circles.delete();
  return dimeInfo;
}

/**
 * Identify finger widths based on MediaPipe landmarks
 * @param {Object} results - MediaPipe Hands results
 * @param {number} pixelsPerMM - Pixels to MM ratio from Dime
 * @param {string} mode - 'left', 'right', or 'thumbs'
 */
export const calculateNailSpans = (results, pixelsPerMM, mode) => {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0 || pixelsPerMM === 0) return null;

  // Measurement logic:
  // We use Landmark 13-16 (Distal Phalanx) for finger width approximation
  const spans = {};
  
  results.multiHandLandmarks.forEach((hand, index) => {
    // MediaPipe hands: 4=Thumb, 8=Index, 12=Middle, 16=Ring, 20=Pinky
    const landmarks = [4, 8, 12, 16, 20];
    
    landmarks.forEach(lm => {
      // Calculate "widest horizontal span" at the tip
      // Since we don't have full segmentation masks from Mediapipe Hands (it's landmarks only), 
      // we'll approximate based on palm orientation or provide the bounding box width.
    });
  });

  return spans;
}
