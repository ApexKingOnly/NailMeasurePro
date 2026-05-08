import React, { useState, useEffect, useRef } from 'react'
import { Camera, ShieldAlert, Scan, CheckCircle2, ChevronLeft, ChevronRight, Mail } from 'lucide-react'
import { getFullSizing, calculateFingerWidthPixels, calculateMM, mmToNailSize } from './utils/sizing'
import AdminPortal from './AdminPortal.jsx'

// V30: Explicit 10-Finger Sequence Mapping
// L-Pinky(20), L-Ring(16), L-Mid(12), L-Index(8), L-Thumb(4)
// R-Thumb(4), R-Index(8), R-Mid(12), R-Ring(16), R-Pinky(20)
const getFingerIndexForShot = (shotNum) => [20, 16, 12, 8, 4, 4, 8, 12, 16, 20][shotNum - 1] || 8;

const LEVEL_TOLERANCE_DEGREES = 8;
const DEFAULT_QUARTER_RING = { x: 0.5, y: 0.35, r: 0.15 };
const DEFAULT_NAIL_BOX = { x: 0.275, y: 0.43625, w: 0.45, h: 0.4375 };
const AI_GUIDE_ENDPOINT = '/api/vision-detect';
const TRAINING_LABEL_ENDPOINT = '/api/training-labels';
const CUSTOMER_NAILSET_ENDPOINT = '/api/customer-nailsets';
const NAIL_EDGE_HANDLE_DROP = 112;
const ASSIST_FRAME_ZOOM = 1.25;
const APP_VERSION = 'training-labels-v1';
const TRAINING_STATUS_IDLE = { status: 'idle', label: '' };
const CUSTOMER_SAVE_STATUS_IDLE = { status: 'idle', label: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getObjectCoverTransform = (video, rect) => {
  const videoWidth = video.videoWidth || rect.width;
  const videoHeight = video.videoHeight || rect.height;
  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;

  return {
    videoWidth,
    videoHeight,
    scale,
    offsetX: (rect.width - renderedWidth) / 2,
    offsetY: (rect.height - renderedHeight) / 2,
  };
};

const videoToViewPoint = (point, transform) => ({
  x: point.x * transform.scale + transform.offsetX,
  y: point.y * transform.scale + transform.offsetY,
});

const viewToVideoPoint = (point, transform) => ({
  x: (point.x - transform.offsetX) / transform.scale,
  y: (point.y - transform.offsetY) / transform.scale,
});

const landmarkToViewPoint = (landmark, transform) => videoToViewPoint({
  x: landmark.x * transform.videoWidth,
  y: landmark.y * transform.videoHeight,
}, transform);

const zoneToRect = (zone, rect) => ({
  x: zone.x * rect.width,
  y: zone.y * rect.height,
  w: zone.w * rect.width,
  h: zone.h * rect.height,
});

const isPointInRect = (point, box, padding = 0) => (
  point.x >= box.x - padding &&
  point.x <= box.x + box.w + padding &&
  point.y >= box.y - padding &&
  point.y <= box.y + box.h + padding
);

const toViewLandmarks = (hand, transform, rect) => hand.map((landmark) => {
  const point = landmarkToViewPoint(landmark, transform);
  return {
    ...landmark,
    x: point.x / rect.width,
    y: point.y / rect.height,
  };
});

const findQuarterInFrame = (video, rect, transform, quarterRing) => {
  const cv = window.cv;
  if (!cv?.Mat || !video.videoWidth || !video.videoHeight || !rect.width || !rect.height) return null;

  const ringCenter = {
    x: quarterRing.x * rect.width,
    y: quarterRing.y * rect.height,
  };
  const ringRadius = quarterRing.r * rect.width;
  const searchRadius = ringRadius * 1.85;
  const topLeft = viewToVideoPoint({ x: ringCenter.x - searchRadius, y: ringCenter.y - searchRadius }, transform);
  const bottomRight = viewToVideoPoint({ x: ringCenter.x + searchRadius, y: ringCenter.y + searchRadius }, transform);
  const left = Math.floor(clamp(Math.min(topLeft.x, bottomRight.x), 0, transform.videoWidth - 1));
  const top = Math.floor(clamp(Math.min(topLeft.y, bottomRight.y), 0, transform.videoHeight - 1));
  const right = Math.ceil(clamp(Math.max(topLeft.x, bottomRight.x), 1, transform.videoWidth));
  const bottom = Math.ceil(clamp(Math.max(topLeft.y, bottomRight.y), 1, transform.videoHeight));
  const roiWidth = right - left;
  const roiHeight = bottom - top;

  if (roiWidth < 30 || roiHeight < 30) return null;

  let src = null;
  let roi = null;
  let gray = null;
  let equalized = null;
  let blurred = null;
  let circles = null;

  try {
    src = cv.imread(video);
    roi = src.roi(new cv.Rect(left, top, roiWidth, roiHeight));
    gray = new cv.Mat();
    equalized = new cv.Mat();
    blurred = new cv.Mat();
    circles = new cv.Mat();

    cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
    if (typeof cv.equalizeHist === 'function') {
      cv.equalizeHist(gray, equalized);
    } else {
      gray.copyTo(equalized);
    }
    cv.GaussianBlur(equalized, blurred, new cv.Size(9, 9), 2, 2, cv.BORDER_DEFAULT);

    const expectedRadius = ringRadius / transform.scale;
    const minRadius = Math.max(8, Math.round(expectedRadius * 0.45));
    const maxRadius = Math.max(
      minRadius + 2,
      Math.min(Math.round(expectedRadius * 1.7), Math.floor(Math.min(roiWidth, roiHeight) / 2))
    );
    const minDistance = Math.max(24, Math.round(expectedRadius * 0.9));

    cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, 1.2, minDistance, 70, 18, minRadius, maxRadius);

    let best = null;
    for (let i = 0; i < circles.cols; i += 1) {
      const base = i * 3;
      const centerVideo = {
        x: left + circles.data32F[base],
        y: top + circles.data32F[base + 1],
      };
      const centerView = videoToViewPoint(centerVideo, transform);
      const radiusView = circles.data32F[base + 2] * transform.scale;
      const distance = Math.hypot(centerView.x - ringCenter.x, centerView.y - ringCenter.y);
      const radiusError = Math.abs(radiusView - ringRadius) / ringRadius;
      const inGuide = distance <= ringRadius * 1.6;
      const usableRadius = radiusView >= ringRadius * 0.45 && radiusView <= ringRadius * 1.7;

      if (!inGuide || !usableRadius) continue;

      const score = distance / ringRadius + radiusError;
      if (!best || score < best.score) {
        best = {
          x: centerView.x,
          y: centerView.y,
          radius: radiusView,
          diameter: radiusView * 2,
          score,
        };
      }
    }

    return best;
  } finally {
    src?.delete?.();
    roi?.delete?.();
    gray?.delete?.();
    equalized?.delete?.();
    blurred?.delete?.();
    circles?.delete?.();
  }
};

const getDefaultAssistGuide = (width, height) => ({
  quarter: {
    x: DEFAULT_QUARTER_RING.x * width,
    y: DEFAULT_QUARTER_RING.y * height,
    r: DEFAULT_QUARTER_RING.r * width,
  },
  nail: {
    left: { x: (DEFAULT_NAIL_BOX.x + DEFAULT_NAIL_BOX.w * 0.34) * width, y: (DEFAULT_NAIL_BOX.y + DEFAULT_NAIL_BOX.h * 0.55) * height },
    right: { x: (DEFAULT_NAIL_BOX.x + DEFAULT_NAIL_BOX.w * 0.66) * width, y: (DEFAULT_NAIL_BOX.y + DEFAULT_NAIL_BOX.h * 0.55) * height },
  },
});

const normalizePoint = (point, width, height) => {
  if (!point) return null;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
  };
};

const mergeAssistGuide = (baseGuide, aiGuide, width, height) => {
  const nextGuide = {
    quarter: { ...baseGuide.quarter },
    nail: {
      left: { ...baseGuide.nail.left },
      right: { ...baseGuide.nail.right },
    },
  };

  const quarter = aiGuide?.quarter;
  if (quarter) {
    const x = Number(quarter.x);
    const y = Number(quarter.y);
    const r = Number(quarter.r);
    if ([x, y, r].every(Number.isFinite) && r > 8) {
      nextGuide.quarter = {
        ...nextGuide.quarter,
        x: clamp(x, 0, width),
        y: clamp(y, 0, height),
        r: clamp(r, 8, Math.min(width, height) * 0.45),
      };
    }
  }

  const nailLeft = normalizePoint(aiGuide?.nail?.left, width, height);
  const nailRight = normalizePoint(aiGuide?.nail?.right, width, height);
  if (nailLeft && nailRight && Math.hypot(nailRight.x - nailLeft.x, nailRight.y - nailLeft.y) > 8) {
    nextGuide.nail = { left: nailLeft, right: nailRight };
  }

  return nextGuide;
};

const requestAssistGuide = async ({ image, width, height, fingerName }) => {
  const response = await fetch(AI_GUIDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, width, height, fingerName }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    throw new Error('AI guide endpoint unavailable');
  }

  return response.json();
};

const requestTrainingLabelSave = async (payload) => {
  const response = await fetch(TRAINING_LABEL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Training label endpoint unavailable');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Training label save failed');
  }

  return data;
};

const requestCustomerNailsetSave = async (payload) => {
  const response = await fetch(CUSTOMER_NAILSET_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Customer nail set endpoint unavailable');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Customer nail set save failed');
  }

  return data;
};

const getAssistMeasurement = (frame) => {
  if (!frame?.guide) return null;

  const { quarter, nail } = frame.guide;
  const quarterPixels = quarter.r * 2;
  const nailPixels = Math.hypot(nail.right.x - nail.left.x, nail.right.y - nail.left.y);
  const mm = calculateMM(nailPixels, quarterPixels);
  const size = mmToNailSize(mm);

  if (!Number.isFinite(mm) || mm <= 0 || size === 'N/A') return null;

  return {
    mm: mm.toFixed(2),
    size,
    method: 'assist',
    quarterPixels,
    nailPixels,
  };
};

const cloneJson = (value) => {
  if (value === null || value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
};

const cloneAssistGuide = (guide) => {
  if (!guide?.quarter || !guide?.nail?.left || !guide?.nail?.right) return null;

  return {
    quarter: { ...guide.quarter },
    nail: {
      left: { ...guide.nail.left },
      right: { ...guide.nail.right },
    },
  };
};

const cloneAssistFrame = (frame, ai = frame?.ai) => {
  const guide = cloneAssistGuide(frame?.guide);
  if (!frame || !guide) return null;

  return {
    image: frame.image,
    width: frame.width,
    height: frame.height,
    zoom: frame.zoom || ASSIST_FRAME_ZOOM,
    guide,
    ai: cloneJson(ai || { status: 'manual', label: 'MANUAL' }),
    aiGuide: cloneJson(frame.aiGuide),
  };
};

const getStoredMeasurement = (result) => {
  if (!result?.mm || !result?.size) return null;
  return {
    mm: result.mm,
    size: result.size,
    method: result.method || 'assist',
    quarterPixels: result.quarterPixels,
    nailPixels: result.nailPixels,
  };
};

const createSessionId = () => (
  window.crypto?.randomUUID?.() ||
  `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const getStoredCustomerEmail = () => {
  try {
    return window.localStorage?.getItem('nailmeasure_customer_email') || '';
  } catch (error) {
    return '';
  }
};

const storeCustomerEmail = (email) => {
  try {
    window.localStorage?.setItem('nailmeasure_customer_email', email);
  } catch (error) {
    // Local storage is only for convenience.
  }
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const buildTrainingLabelPayload = ({ frame, measurement, fingerName, shotNumber, sessionId }) => {
  const guide = cloneAssistGuide(frame?.guide);
  if (!frame || !guide || !measurement) return null;

  return {
    sessionId,
    fingerName,
    shotNumber,
    handSide: shotNumber <= 5 ? 'left' : 'right',
    capturedAt: new Date().toISOString(),
    image: frame.image,
    frame: {
      width: frame.width,
      height: frame.height,
      zoom: frame.zoom || ASSIST_FRAME_ZOOM,
    },
    guide,
    ai: {
      ...(cloneJson(frame.ai) || { status: 'manual', label: 'MANUAL' }),
      suggestedGuide: cloneJson(frame.aiGuide),
    },
    measurement: {
      mm: Number(measurement.mm),
      size: String(measurement.size),
      method: measurement.method || 'assist',
      quarterPixels: measurement.quarterPixels,
      nailPixels: measurement.nailPixels,
    },
    source: 'assist-correction',
    appVersion: APP_VERSION,
  };
};

const buildCustomerNailsetPayload = ({ customerEmail, sessionId, results, steps, status }) => {
  const normalizedEmail = normalizeEmail(customerEmail);
  if (!EMAIL_PATTERN.test(normalizedEmail)) return null;

  const measurements = steps
    .map((fingerName, index) => {
      const result = results[fingerName];
      if (!result?.mm || !result?.size) return null;
      const shotNumber = index + 1;

      return {
        fingerName,
        shotNumber,
        handSide: shotNumber <= 5 ? 'left' : 'right',
        mm: Number(result.mm),
        size: String(result.size),
        method: result.method || 'assist',
        quarterPixels: result.quarterPixels,
        nailPixels: result.nailPixels,
        guide: cloneAssistGuide(result.frame?.guide),
      };
    })
    .filter(Boolean);

  if (!measurements.length) return null;

  return {
    sessionId,
    customerEmail: normalizedEmail,
    status,
    measurements,
    source: 'customer-measurement-flow',
    appVersion: APP_VERSION,
  };
};

function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPortal />;
  }

  // Navigation State
  const [currentStep, setCurrentStep] = useState('welcome')
  const [shotNumber, setShotNumber] = useState(1)
  const steps = [
    "Left Pinky", "Left Ring", "Left Middle", "Left Pointer", "Left Thumb",
    "Right Thumb", "Right Pointer", "Right Middle", "Right Ring", "Right Pinky"
  ]
  const [customerEmail, setCustomerEmail] = useState(getStoredCustomerEmail)
  
  // Vision Health & Stability
  const [systemBooting, setSystemBooting] = useState(true)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isVisionReady, setIsVisionReady] = useState(false)
  const [isVisionCrashed, setIsVisionCrashed] = useState(false)
  const [librariesLoaded, setLibrariesLoaded] = useState(false)
  const [message, setMessage] = useState('System Booting...')
  const [isStableSignal, setIsStableSignal] = useState(false)
  const [detectionState, setDetectionState] = useState({ quarter: false, finger: false, level: true })
  
  // Results & Temporary Data
  const [results, setResults] = useState({})
  const [measurement, setMeasurement] = useState(null)
  const [shutterFlash, setShutterFlash] = useState(false)
  const [assistFrame, setAssistFrame] = useState(null)
  const [dragHandle, setDragHandle] = useState(null)
  const [trainingStatus, setTrainingStatus] = useState(TRAINING_STATUS_IDLE)
  const [customerSaveStatus, setCustomerSaveStatus] = useState(CUSTOMER_SAVE_STATUS_IDLE)
  
  // Refs
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const assistSurfaceRef = useRef(null)
  const handsRef = useRef(null)
  const frameIdRef = useRef(null)
  const lastHandRef = useRef(null) // V27: Sync Capture Hand Ref
  const lastQuarterRef = useRef(0) // V27: Sync Capture Quarter Ref
  const videoDimsRef = useRef({ w: 0, h: 0 }) // V27: Sync Capture Dims Ref
  const orientationRef = useRef({ pitch: 0, roll: 0 })
  const isLeveledRef = useRef(true)
  const isStableSignalRef = useRef(false)
  const shotNumberRef = useRef(1)
  const lastDetectionStateRef = useRef({ quarter: false, finger: false, level: true })
  const assistRequestRef = useRef(0)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const isAdvancingRef = useRef(false)
  const sessionIdRef = useRef(createSessionId())
  const customerSessionIdRef = useRef(createSessionId())
  const trainingStatusTimerRef = useRef(null)
  const customerSaveTimerRef = useRef(null)

  useEffect(() => { shotNumberRef.current = shotNumber }, [shotNumber])
  useEffect(() => { isStableSignalRef.current = isStableSignal }, [isStableSignal])
  useEffect(() => () => {
    if (trainingStatusTimerRef.current) clearTimeout(trainingStatusTimerRef.current);
    if (customerSaveTimerRef.current) clearTimeout(customerSaveTimerRef.current);
  }, [])

  const showTrainingStatus = (nextStatus, timeoutMs = 3500) => {
    if (trainingStatusTimerRef.current) clearTimeout(trainingStatusTimerRef.current);
    setTrainingStatus(nextStatus);

    if (timeoutMs > 0) {
      trainingStatusTimerRef.current = window.setTimeout(() => {
        setTrainingStatus(TRAINING_STATUS_IDLE);
        trainingStatusTimerRef.current = null;
      }, timeoutMs);
    }
  }

  const showCustomerSaveStatus = (nextStatus, timeoutMs = 3500) => {
    if (customerSaveTimerRef.current) clearTimeout(customerSaveTimerRef.current);
    setCustomerSaveStatus(nextStatus);

    if (timeoutMs > 0) {
      customerSaveTimerRef.current = window.setTimeout(() => {
        setCustomerSaveStatus(CUSTOMER_SAVE_STATUS_IDLE);
        customerSaveTimerRef.current = null;
      }, timeoutMs);
    }
  }

  // Launch Protocol
  const startWizard = () => {
    const normalizedEmail = normalizeEmail(customerEmail);
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
       alert("Enter a valid email address to start.");
       return;
    }
    if (window.innerWidth <= 10) {
       alert("Viewport too small/stalled. Please resize or refresh.");
       return; 
    }
    setCustomerEmail(normalizedEmail)
    storeCustomerEmail(normalizedEmail)
    setShotNumber(1)
    setCurrentStep('wizard')
    setIsCameraReady(false)
    setIsVisionReady(false)
    setIsVisionCrashed(false)
    setIsStableSignal(false)
    setMeasurement(null)
    setAssistFrame(null)
    setDragHandle(null)
    showTrainingStatus(TRAINING_STATUS_IDLE, 0)
    showCustomerSaveStatus(CUSTOMER_SAVE_STATUS_IDLE, 0)
    sessionIdRef.current = createSessionId()
    customerSessionIdRef.current = createSessionId()
    isAdvancingRef.current = false
    setResults({})
    setMessage('Activating Hardware...')
    lastHandRef.current = null
    lastQuarterRef.current = 0
    videoDimsRef.current = { w: 0, h: 0 }
    orientationRef.current = { pitch: 0, roll: 0 }
    isLeveledRef.current = true
    isStableSignalRef.current = false
    lastDetectionStateRef.current = { quarter: false, finger: false, level: true }
    setDetectionState(lastDetectionStateRef.current)
  }

  const resetShotTracking = () => {
    const resetDetection = { quarter: false, finger: false, level: isLeveledRef.current };
    setIsStableSignal(false);
    isStableSignalRef.current = false;
    lastHandRef.current = null;
    lastQuarterRef.current = 0;
    lastDetectionStateRef.current = resetDetection;
    setDetectionState(resetDetection);
  }

  const goToShot = (targetShotNumber, { openSavedFrame = true } = {}) => {
    const nextShotNumber = clamp(targetShotNumber, 1, steps.length);
    const fingerName = steps[nextShotNumber - 1];
    const savedResult = results[fingerName];
    const savedMeasurement = getStoredMeasurement(savedResult);
    const savedFrame = openSavedFrame
      ? cloneAssistFrame(savedResult?.frame, { status: 'saved', label: 'SAVED' })
      : null;

    setShotNumber(nextShotNumber);
    shotNumberRef.current = nextShotNumber;
    setCurrentStep('wizard');
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
    setAssistFrame(savedFrame);
    setMeasurement(savedMeasurement);
    resetShotTracking();
    isAdvancingRef.current = false;

    if (savedFrame) {
      setMessage(`Review saved ${fingerName}`);
    } else if (savedMeasurement) {
      setMessage(`Saved ${fingerName}; tap camera to retake`);
    } else {
      setMessage(`Place ${fingerName} in lower target`);
    }
  }

  const saveTrainingLabel = (payload) => {
    if (!payload) return;

    showTrainingStatus({ status: 'saving', label: 'SAVING LABEL' }, 0);
    requestTrainingLabelSave(payload)
      .then((result) => {
        if (result?.ok) {
          showTrainingStatus({ status: 'saved', label: 'LABEL SAVED' });
        } else if (result?.configured === false) {
          showTrainingStatus({ status: 'off', label: 'LABEL OFF' });
        } else {
          showTrainingStatus({ status: 'error', label: 'LABEL FAILED' });
        }
      })
      .catch(() => {
        showTrainingStatus({ status: 'error', label: 'LABEL FAILED' });
      });
  }

  const saveCustomerNailset = (nextResults, status = 'draft') => {
    const payload = buildCustomerNailsetPayload({
      customerEmail,
      sessionId: customerSessionIdRef.current,
      results: nextResults,
      steps,
      status,
    });
    if (!payload) return;

    showCustomerSaveStatus({ status: 'saving', label: 'SAVING SIZES' }, 0);
    requestCustomerNailsetSave(payload)
      .then((result) => {
        if (result?.ok) {
          showCustomerSaveStatus({ status: 'saved', label: status === 'complete' ? 'SET SAVED' : 'SIZES SAVED' });
        } else if (result?.configured === false) {
          showCustomerSaveStatus({ status: 'off', label: 'SAVE OFF' });
        } else {
          showCustomerSaveStatus({ status: 'error', label: 'SAVE FAILED' });
        }
      })
      .catch(() => {
        showCustomerSaveStatus({ status: 'error', label: 'SAVE FAILED' });
      });
  }

  // Phase 0: Environment Lockdown (2s)
  useEffect(() => {
     const timer = setTimeout(() => setSystemBooting(false), 2000);
     return () => clearTimeout(timer);
  }, []);

  // Phase 1: Hardware Activation (10s Polling)
  useEffect(() => {
    if (currentStep !== 'wizard') return;

    let pollCount = 0;
    let pollTimer = null;
    let cameraRequestTimer = null;
    let cancelled = false;
    const maxPolls = 100; // 10 seconds

    const requestStream = (constraints, timeoutMs = 10000) => {
       cameraRequestTimer = setTimeout(() => {
          if (!cancelled) setMessage('Allow camera permission to continue');
       }, timeoutMs);

       return navigator.mediaDevices.getUserMedia(constraints).then(stream => {
          if (cancelled) {
             stream.getTracks().forEach(track => track.stop());
             return null;
          }
          return stream;
       }).finally(() => {
          if (cameraRequestTimer) clearTimeout(cameraRequestTimer);
       });
    };

    const checkDimensions = () => {
       if (cancelled) return;
       if (videoRef.current?.videoWidth > 0) {
          setIsCameraReady(true);
       } else if (pollCount < maxPolls && currentStep === 'wizard') {
          pollCount++;
          pollTimer = setTimeout(checkDimensions, 100);
       } else {
          setMessage('Camera Hardware Timeout');
       }
    };

    const startCamera = async () => {
       if (!navigator.mediaDevices?.getUserMedia) {
          setMessage('Camera API Not Available');
          return;
       }

       try {
          setMessage('Activating Hardware...');
          const stream = await requestStream({
             video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          if (!stream) return;
          if (cancelled) {
             stream.getTracks().forEach(track => track.stop());
             return;
          }
          if (!cancelled && videoRef.current) {
             videoRef.current.srcObject = stream;
             videoRef.current.onloadedmetadata = () => {
                videoRef.current.play().catch(() => setMessage('Tap to Allow Camera Playback'));
                checkDimensions();
             }
          }
       } catch (err) {
          // Fallback to front camera if environment fails
          try {
             const fallbackStream = await requestStream({ video: true });
             if (!fallbackStream) return;
             if (cancelled) {
                fallbackStream.getTracks().forEach(track => track.stop());
                return;
             }
             if (!cancelled && videoRef.current) {
                videoRef.current.srcObject = fallbackStream;
                videoRef.current.onloadedmetadata = () => {
                   videoRef.current.play().catch(() => setMessage('Tap to Allow Camera Playback'));
                   checkDimensions();
                }
             }
          } catch (e) {
             setMessage('Camera Permission Required');
          }
       }
    };
    startCamera();

    return () => {
       cancelled = true;
       if (pollTimer) clearTimeout(pollTimer);
       if (cameraRequestTimer) clearTimeout(cameraRequestTimer);
       if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
       }
    };
  }, [currentStep]);

  // V28: HARDWARE LEVELING TRACKER
  useEffect(() => {
     if (currentStep !== 'wizard') return;

     const handleOrientation = (e) => {
        const pitch = e.beta || 0; // -180 to 180
        const roll = e.gamma || 0; // -90 to 90
        orientationRef.current = { pitch, roll };
        
        // Treat level as a tolerance band, not a hair-trigger lock.
        const isCurrentlyLeveled = Math.abs(pitch) < LEVEL_TOLERANCE_DEGREES && Math.abs(roll) < LEVEL_TOLERANCE_DEGREES;
        isLeveledRef.current = isCurrentlyLeveled;
     };

     // iOS Permission Handshake
     const requestMotion = async () => {
        const OrientationEvent = window.DeviceOrientationEvent;
        if (!OrientationEvent) {
           isLeveledRef.current = true;
           return;
        }

        if (typeof OrientationEvent.requestPermission === 'function') {
           try {
              const permission = await OrientationEvent.requestPermission();
              if (permission !== 'granted') {
                 isLeveledRef.current = true;
                 setMessage('Level sensor unavailable; continue carefully');
                 return;
              }
           } catch (e) {
              isLeveledRef.current = true;
              setMessage('Level sensor unavailable; continue carefully');
              return;
           }
        }
        window.addEventListener('deviceorientation', handleOrientation);
     }
     requestMotion();

     return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [currentStep]);

  // Stability & Debug Layer (v11 Precision HUD)
  const [debugLog, setDebugLog] = useState([])
  const logToHUD = (txt) => {
     console.log(`[V11-PRECISION]: ${txt}`);
     setDebugLog(prev => [...prev.slice(-15), `> ${new Date().toLocaleTimeString().split(' ')[0]} | ${txt}`]);
  }

  // Phase 2: AI Hub Initialization (V11 Precision Architecture)
  useEffect(() => {
    if (!isCameraReady || currentStep !== 'wizard') return;

    const loadScript = (url, id) => new Promise((resolve, reject) => {
       if (document.getElementById(id)) return resolve();
       logToHUD(`Syncing ${id}...`);
       const script = document.createElement('script');
       script.src = url;
       script.id = id;
       script.crossOrigin = 'anonymous';
       script.onload = resolve;
       script.onerror = () => reject(new Error(`Failed ${id}`));
       document.head.appendChild(script);
    });

    const initAI = async () => {
       try {
          if (!librariesLoaded) {
             setLibrariesLoaded(true);
             logToHUD("Powering Surgical Infrastructure...");
             // Local assets served from /public/ during build (v9 fix)
             await loadScript('/opencv.js', 'cv-atomic');
          }

          logToHUD("Native script handshake successful.");
          const readiness = new Promise((resolve, reject) => {
             const timeout = setTimeout(() => reject(new Error("Vision Core Hub Timeout (60s Exhausted)")), 60000);
             const check = () => {
                if (window.cv && window.cv.Mat) {
                   clearTimeout(timeout);
                   resolve();
                } else {
                   setTimeout(check, 500);
                }
             };
             check();
          });

          await readiness;
          logToHUD("Precision Space READY.");

          logToHUD("V11.1: Summoning Vision Core...");
          const visionLib = await import("@mediapipe/tasks-vision");
          const { FilesetResolver, HandLandmarker } = visionLib;
          
          if (!FilesetResolver || !HandLandmarker) {
             throw new Error("V11.1: Vision Modules Undefined");
          }

          // V11.1: TOTAL SAME-ORIGIN ISOLATION
          logToHUD("V11.1: Virtualizing Local Brain...");
          const vision = await FilesetResolver.forVisionTasks("/wasm");

          // Atomic Handlandmarker Initialization (V11.1-SURGICAL)
          try {
             logToHUD("Initializing V11.1 Local Kernel...");
             handsRef.current = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                   modelAssetPath: `/hand_landmarker.task`,
                   delegate: "GPU"
                },
                runningMode: "VIDEO", numHands: 1
             });
             logToHUD("V11.1 LOCAL KERNEL ONLINE.");
          } catch (gpuErr) {
             logToHUD("GPU Locked via V11.1. Falling back to Local CPU...");
             handsRef.current = await HandLandmarker.createFromOptions(vision, {
               baseOptions: {
                  modelAssetPath: `/hand_landmarker.task`,
                  delegate: "CPU"
               },
               runningMode: "VIDEO", numHands: 1
            });
            logToHUD("V11.1 LOCAL CPU ACTIVE.");
          }

          setIsVisionReady(true);
          setMessage('READY (V11-PRECISION)');
       } catch (err) {
          logToHUD(`FATAL V11: ${err.message}`);
          setIsVisionCrashed(true);
          setMessage(`Init Error: ${err.message}`);
       }
    };
    initAI();

    return () => { if (handsRef.current) handsRef.current = null; };
  }, [isCameraReady, currentStep, librariesLoaded]);

  // Phase 3: High-Performance Vision Heartbeat (Precision Zone Check)
  useEffect(() => {
    if (!isVisionReady || !videoRef.current || currentStep !== 'wizard') return;

    const processFrame = async () => {
      if (!videoRef.current || !canvasRef.current || !handsRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      // V17: HIGH-DPI RETINA SCALING
      const ratio = window.devicePixelRatio || 2;
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width * ratio) {
         canvas.width = rect.width * ratio;
         canvas.height = rect.height * ratio;
         canvas.style.width = `${rect.width}px`;
         canvas.style.height = `${rect.height}px`;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      try {
         const startTimeMs = performance.now();
         const results = handsRef.current.detectForVideo(video, startTimeMs);
         
         videoDimsRef.current = { w: video.videoWidth, h: video.videoHeight };
         const transform = getObjectCoverTransform(video, rect);
         
         // V28: CLOSE SURGICAL STACK (Quarter Center-Top, Nail Center-Bottom) - CLOSE SPACING
         const quarterRing = DEFAULT_QUARTER_RING; 
         const nBox = DEFAULT_NAIL_BOX; 

         const drawSurgicalHUD = () => {
            const w = rect.width;
            const h = rect.height;
            const bx = nBox.x * w; const by = nBox.y * h; const bw = nBox.w * w; const bh = nBox.h * h;
            const cl = 30; // Corner Length

            ctx.save();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2.5; // Thin surgical line
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';

            // 🔳 Precision Bracket (Nail Target)
            // Top-Left
            ctx.beginPath(); ctx.moveTo(bx, by + cl); ctx.lineTo(bx, by); ctx.lineTo(bx + cl, by); ctx.stroke();
            // Top-Right
            ctx.beginPath(); ctx.moveTo(bx + bw - cl, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cl); ctx.stroke();
            // Bottom-Left
            ctx.beginPath(); ctx.moveTo(bx, by + bh - cl); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cl, by + bh); ctx.stroke();
            // Bottom-Right
            ctx.beginPath(); ctx.moveTo(bx + bw - cl, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cl); ctx.stroke();

            // Scaling Target (Quarter Crosshair)
            const dx = quarterRing.x * w; const dy = quarterRing.y * h; const dr = quarterRing.r * w;
            ctx.setLineDash([8, 12]);
            ctx.beginPath(); ctx.arc(dx, dy, dr, 0, 2 * Math.PI); ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(dx - 10, dy); ctx.lineTo(dx + 10, dy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(dx, dy - 10); ctx.lineTo(dx, dy + 10); ctx.stroke();

            // V28: GRAVITY HUD (Pitch/Roll Crosshair Balance)
            const currentOrientation = orientationRef.current;
            const currentlyLeveled = isLeveledRef.current;
            const cx = w/2; const cy = h/2; // Center
            ctx.strokeStyle = currentlyLeveled ? '#10b981' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 2 * Math.PI); ctx.stroke(); // Static Target
            ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy); ctx.stroke(); // Static Horizontal
            ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30); ctx.stroke(); // Static Vertical

            // Dynamic Leveling Dot
            const dotX = cx + (currentOrientation.roll * 2.5); // Sensitivity 2.5x
            const dotY = cy + (currentOrientation.pitch * 2.5);
            ctx.beginPath(); 
            ctx.arc(dotX, dotY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = currentlyLeveled ? '#10b981' : '#f43f5e';
            ctx.fill();
            if (currentlyLeveled) {
               ctx.shadowBlur = 20; ctx.shadowColor = '#10b981';
               ctx.stroke();
            }
            ctx.restore();
         };

         drawSurgicalHUD();

         let quarter = null;
         try {
            quarter = findQuarterInFrame(video, rect, transform, quarterRing);
         } catch (cvErr) {
            console.warn("CV Frame Error:", cvErr);
         }

         const hand = results.landmarks?.[0] || null;
         const viewHand = hand ? toViewLandmarks(hand, transform, rect) : null;
         const fingerIndex = getFingerIndexForShot(shotNumberRef.current);
         const activeTip = viewHand?.[fingerIndex]
            ? { x: viewHand[fingerIndex].x * rect.width, y: viewHand[fingerIndex].y * rect.height }
            : null;
         const nailBox = zoneToRect(nBox, rect);
         const fingerDetected = Boolean(activeTip && isPointInRect(activeTip, nailBox, 24));
         const quarterDetected = Boolean(quarter?.diameter);
         const levelDetected = isLeveledRef.current;
         const nextDetectionState = { quarter: quarterDetected, finger: fingerDetected, level: levelDetected };
         const previousDetectionState = lastDetectionStateRef.current;

         if (
            previousDetectionState.quarter !== nextDetectionState.quarter ||
            previousDetectionState.finger !== nextDetectionState.finger ||
            previousDetectionState.level !== nextDetectionState.level
         ) {
            lastDetectionStateRef.current = nextDetectionState;
            setDetectionState(nextDetectionState);
         }

         lastQuarterRef.current = quarter?.diameter || 0;
         lastHandRef.current = viewHand;

         if (quarter) {
            ctx.save();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(quarter.x, quarter.y, quarter.radius, 0, 2 * Math.PI);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 4;
            ctx.shadowBlur = 16;
            ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
            ctx.stroke();
            ctx.restore();
         }

         if (viewHand) {
            viewHand.forEach((lm, index) => {
               const x = lm.x * rect.width;
               const y = lm.y * rect.height;
               const isActiveFinger = index === fingerIndex || index === fingerIndex - 1;
               if (!isActiveFinger && !isStableSignalRef.current) return;

               ctx.beginPath();
               ctx.arc(x, y, isActiveFinger ? 4 : 2, 0, 2 * Math.PI);
               ctx.fillStyle = fingerDetected ? 'rgba(16, 185, 129, 0.75)' : 'rgba(255,255,255,0.45)';
               ctx.fill();
            });
         }

         if (!quarterDetected) {
            setIsStableSignal(false);
            setMessage("Move quarter into top circle");
            setMeasurement(null);
         } else if (!viewHand) {
            setIsStableSignal(false);
            setMessage(`Place ${steps[shotNumberRef.current - 1]} in lower target`);
            setMeasurement(null);
         } else if (!fingerDetected) {
            setIsStableSignal(false);
            setMessage(`Move ${steps[shotNumberRef.current - 1]} into lower box`);
            setMeasurement(null);
         } else if (!levelDetected) {
            setIsStableSignal(false);
            setMessage("Hold phone level");
            setMeasurement(null);
         } else {
            const fingerPx = calculateFingerWidthPixels(viewHand, fingerIndex, rect.width, rect.height);
            const sizing = getFullSizing(fingerPx, quarter.diameter, viewHand, rect.width, rect.height);
            const hasSizing = sizing.size !== 'N/A' && Number.parseFloat(sizing.mm) > 0;

            if (hasSizing) {
               setIsStableSignal(true);
               setMessage(`TARGET LOCKED: SIZE ${sizing.size}`);
               setMeasurement(prev => (
                  prev?.mm === sizing.mm && prev?.size === sizing.size
                     ? prev
                     : { mm: sizing.mm, size: sizing.size }
               ));
            } else {
               setIsStableSignal(false);
               setMessage("Refine finger position");
               setMeasurement(null);
            }
         }
      } catch (err) { /* Frame drop silent */ }

      if (currentStep === 'wizard') {
         frameIdRef.current = requestAnimationFrame(processFrame);
      }
    };

    processFrame();
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [isVisionReady, currentStep]);

  const advanceSequence = (nextMeasurement) => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    const acceptedFrame = cloneAssistFrame(assistFrame);
    const savedFrame = cloneAssistFrame(assistFrame, { status: 'saved', label: 'SAVED' });

    setAssistFrame(null);
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };

    if (navigator.vibrate) { try { navigator.vibrate(15); } catch(e){} }
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 80);

    const currentShotNumber = clamp(shotNumberRef.current || shotNumber, 1, steps.length);
    const fingerName = steps[currentShotNumber - 1];
    const resetDetection = { quarter: false, finger: false, level: isLeveledRef.current };
    const storedMeasurement = savedFrame
      ? { ...nextMeasurement, frame: savedFrame }
      : nextMeasurement;
    const nextResults = { ...results, [fingerName]: storedMeasurement };
    const customerSetStatus = steps.every(step => nextResults[step]?.mm && nextResults[step]?.size) ? 'complete' : 'draft';

    setResults(nextResults);
    saveCustomerNailset(nextResults, customerSetStatus);
    saveTrainingLabel(buildTrainingLabelPayload({
      frame: acceptedFrame,
      measurement: nextMeasurement,
      fingerName,
      shotNumber: currentShotNumber,
      sessionId: sessionIdRef.current,
    }));
    setIsStableSignal(false);
    isStableSignalRef.current = false;
    lastHandRef.current = null;
    lastQuarterRef.current = 0;
    lastDetectionStateRef.current = resetDetection;
    setDetectionState(resetDetection);

    const releaseAdvanceLock = () => {
      window.setTimeout(() => {
        isAdvancingRef.current = false;
      }, 180);
    };

    if (currentShotNumber < steps.length) {
      const nextShotNumber = currentShotNumber + 1;
      const nextFingerName = steps[nextShotNumber - 1];
      const nextSavedResult = nextResults[nextFingerName];
      const nextSavedFrame = cloneAssistFrame(nextSavedResult?.frame, { status: 'saved', label: 'SAVED' });
      const nextSavedMeasurement = getStoredMeasurement(nextSavedResult);

      setShotNumber(nextShotNumber);
      shotNumberRef.current = nextShotNumber;
      setAssistFrame(nextSavedFrame);
      setMeasurement(nextSavedMeasurement);
      setMessage(nextSavedFrame ? `Review saved ${nextFingerName}` : `Place ${nextFingerName} in lower target`);
      setCurrentStep('wizard');
      releaseAdvanceLock();
    } else {
      setShotNumber(steps.length);
      shotNumberRef.current = steps.length;
      setMeasurement(getStoredMeasurement(storedMeasurement));
      setMessage('All nails measured');
      setCurrentStep('finish');
      releaseAdvanceLock();
    }
  }

  const startAssistMeasurement = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage('Camera frame not ready');
      return;
    }

    const rect = video.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || video.videoWidth));
    const height = Math.max(1, Math.round(rect.height || video.videoHeight));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setMessage('Frame capture unavailable');
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const transform = getObjectCoverTransform(video, { width, height });
    ctx.drawImage(
      video,
      transform.offsetX,
      transform.offsetY,
      transform.videoWidth * transform.scale,
      transform.videoHeight * transform.scale
    );

    const image = canvas.toDataURL('image/jpeg', 0.92);
    const guide = getDefaultAssistGuide(width, height);
    const requestId = assistRequestRef.current + 1;
    assistRequestRef.current = requestId;

    setAssistFrame({
      image,
      width,
      height,
      zoom: ASSIST_FRAME_ZOOM,
      guide,
      aiGuide: null,
      ai: { status: 'scanning', label: 'AI SCAN' },
    });
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
    setIsStableSignal(false);
    setMeasurement(null);
    setMessage('Checking frame with AI guide');

    try {
      const aiResult = await requestAssistGuide({
        image,
        width,
        height,
        fingerName: steps[shotNumberRef.current - 1],
      });

      if (assistRequestRef.current !== requestId) return;

      if (aiResult?.guide && (aiResult.guide.quarter || aiResult.guide.nail)) {
        setAssistFrame(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            guide: mergeAssistGuide(prev.guide, aiResult.guide, prev.width, prev.height),
            aiGuide: cloneJson(aiResult.guide),
            ai: {
              status: 'suggested',
              label: 'AI GUIDE',
              configured: aiResult.configured !== false,
              detections: aiResult.detections || null,
              predictionCount: aiResult.predictionCount || 0,
            },
          };
        });
        setMessage('AI guide ready; adjust if needed');
      } else {
        setAssistFrame(prev => prev ? ({
          ...prev,
          ai: {
            status: aiResult?.configured === false ? 'off' : 'manual',
            label: aiResult?.configured === false ? 'AI OFF' : 'MANUAL',
            configured: aiResult?.configured !== false,
            reason: aiResult?.reason || null,
          },
        }) : prev);
        setMessage('Manual guide ready');
      }
    } catch (error) {
      if (assistRequestRef.current !== requestId) return;
      setAssistFrame(prev => prev ? ({
        ...prev,
        ai: { status: 'manual', label: 'MANUAL', error: error.message || 'AI guide unavailable' },
      }) : prev);
      setMessage('Manual guide ready');
    }
  }

  const getAssistPoint = (event) => {
    if (!assistFrame || !assistSurfaceRef.current) return null;
    const rect = assistSurfaceRef.current.getBoundingClientRect();
    const zoom = Number(assistFrame.zoom || 1);
    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;
    const imageX = ((normalizedX - 0.5) / zoom + 0.5) * assistFrame.width;
    const imageY = ((normalizedY - 0.5) / zoom + 0.5) * assistFrame.height;

    return {
      x: clamp(imageX, 0, assistFrame.width),
      y: clamp(imageY, 0, assistFrame.height),
    };
  }

  const getAssistHandleAnchor = (handle, frame = assistFrame) => {
    if (!frame?.guide) return null;
    const { quarter, nail } = frame.guide;

    if (handle === 'quarter') return { x: quarter.x, y: quarter.y };
    if (handle === 'quarterRadius') return { x: quarter.x + quarter.r, y: quarter.y };
    if (handle === 'nailLeft') return nail.left;
    if (handle === 'nailRight') return nail.right;
    return null;
  }

  const moveAssistHandle = (handle, event) => {
    const pointer = getAssistPoint(event);
    if (!pointer) return;
    const point = {
      x: pointer.x + dragOffsetRef.current.x,
      y: pointer.y + dragOffsetRef.current.y,
    };

    setAssistFrame(prev => {
      if (!prev) return prev;
      const guide = {
        quarter: { ...prev.guide.quarter },
        nail: {
          left: { ...prev.guide.nail.left },
          right: { ...prev.guide.nail.right },
        },
      };

      if (handle === 'quarter') {
        guide.quarter.x = clamp(point.x, 0, prev.width);
        guide.quarter.y = clamp(point.y, 0, prev.height);
      } else if (handle === 'quarterRadius') {
        const radius = Math.hypot(point.x - guide.quarter.x, point.y - guide.quarter.y);
        guide.quarter.r = clamp(radius, prev.width * 0.04, prev.width * 0.32);
      } else if (handle === 'nailLeft') {
        guide.nail.left = {
          x: clamp(point.x, 0, prev.width),
          y: clamp(point.y, 0, prev.height),
        };
      } else if (handle === 'nailRight') {
        guide.nail.right = {
          x: clamp(point.x, 0, prev.width),
          y: clamp(point.y, 0, prev.height),
        };
      }

      return { ...prev, guide };
    });
  }

  const startAssistDrag = (handle, event) => {
    event.preventDefault();
    event.stopPropagation();
    const pointer = getAssistPoint(event);
    const anchor = getAssistHandleAnchor(handle);
    dragOffsetRef.current = pointer && anchor
      ? { x: anchor.x - pointer.x, y: anchor.y - pointer.y }
      : { x: 0, y: 0 };
    setDragHandle(handle);
    moveAssistHandle(handle, event);
  }

  const stopAssistDrag = () => {
    dragOffsetRef.current = { x: 0, y: 0 };
    setDragHandle(null);
  }

  const resetAssistGuide = () => {
    setAssistFrame(prev => prev ? {
      ...prev,
      guide: getDefaultAssistGuide(prev.width, prev.height),
      ai: { status: 'manual', label: 'MANUAL' },
    } : prev);
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
  }

  const applyAssistMeasurement = () => {
    const nextMeasurement = getAssistMeasurement(assistFrame);
    if (!nextMeasurement) {
      setMessage('Align quarter and nail guides');
      return;
    }

    setAssistFrame(null);
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
    advanceSequence(nextMeasurement);
  }

  // UI VIEWS
  const assistMeasurement = getAssistMeasurement(assistFrame);
  const assistGuide = assistFrame?.guide || null;
  const quarter = assistGuide?.quarter || null;
  const nail = assistGuide?.nail || null;
  const radiusHandle = quarter ? { x: quarter.x + quarter.r, y: quarter.y } : null;
  const assistZoom = assistFrame?.zoom || 1;
  const assistZoomStyle = { transform: `scale(${assistZoom})`, transformOrigin: 'center center' };
  const assistAi = assistFrame?.ai || { status: 'manual', label: 'MANUAL' };
  const assistAiClass = assistAi.status === 'suggested' || assistAi.status === 'saved'
     ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
     : assistAi.status === 'scanning'
        ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40 animate-pulse'
        : 'bg-slate-900 text-slate-400 border-slate-800';
  const trainingStatusClass = trainingStatus.status === 'saved'
     ? 'bg-emerald-500/90 text-slate-950 border-emerald-300'
     : trainingStatus.status === 'saving'
        ? 'bg-cyan-500/20 text-cyan-100 border-cyan-500/45 animate-pulse'
        : trainingStatus.status === 'error'
           ? 'bg-rose-500/20 text-rose-100 border-rose-500/45'
           : 'bg-slate-950/70 text-slate-500 border-slate-800';
  const customerSaveStatusClass = customerSaveStatus.status === 'saved'
     ? 'bg-emerald-500/90 text-slate-950 border-emerald-300'
     : customerSaveStatus.status === 'saving'
        ? 'bg-cyan-500/20 text-cyan-100 border-cyan-500/45 animate-pulse'
        : customerSaveStatus.status === 'error'
           ? 'bg-rose-500/20 text-rose-100 border-rose-500/45'
           : 'bg-slate-950/70 text-slate-500 border-slate-800';
  const renderAssistHandle = (handle, x, y, color) => (
     <g key={handle} onPointerDown={(event) => startAssistDrag(handle, event)} style={{ cursor: 'grab' }}>
        <circle cx={x} cy={y} r="30" fill="transparent" stroke="transparent" strokeWidth="1" />
        <circle cx={x} cy={y} r="10" fill="transparent" stroke={color} strokeWidth="2.25" strokeOpacity="0.72" />
        <circle cx={x} cy={y} r="3.5" fill="transparent" stroke={color} strokeWidth="1.5" strokeOpacity="0.58" />
     </g>
  );
  const renderNailEdgeHandle = (handle, x, y, color) => {
     const gripY = Math.max(18, y - NAIL_EDGE_HANDLE_DROP);

     return (
        <g key={handle} onPointerDown={(event) => startAssistDrag(handle, event)} style={{ cursor: 'grab' }}>
           <line x1={x} y1={gripY - 8} x2={x} y2={y} stroke="transparent" strokeWidth="34" strokeLinecap="round" />
           <circle cx={x} cy={gripY} r="30" fill="transparent" stroke="transparent" strokeWidth="1" />
           <line x1={x} y1={gripY + 11} x2={x} y2={y} stroke={color} strokeWidth="2.35" strokeOpacity="0.78" strokeLinecap="round" />
           <line x1={x - 11} y1={y} x2={x + 11} y2={y} stroke={color} strokeWidth="2.35" strokeOpacity="0.92" strokeLinecap="round" />
           <circle cx={x} cy={gripY} r="10" fill="transparent" stroke={color} strokeWidth="2.25" strokeOpacity="0.72" />
           <circle cx={x} cy={gripY} r="3.5" fill="transparent" stroke={color} strokeWidth="1.5" strokeOpacity="0.58" />
        </g>
     );
  };
  const handSideLabel = shotNumber > 5 ? 'RIGHT HAND' : 'LEFT HAND';
  const currentFingerName = steps[shotNumber - 1];
  const currentSavedMeasurement = getStoredMeasurement(results[currentFingerName]);
  const allFingersMeasured = steps.every(finger => results[finger]?.mm && results[finger]?.size);
  const topNavigationControls = (
     <div className="absolute top-4 left-4 z-[95] flex items-center gap-2">
        <button
           aria-label="Go to previous finger"
           onClick={() => goToShot(shotNumberRef.current - 1)}
           disabled={shotNumber <= 1}
           className={`w-12 h-12 flex items-center justify-center rounded-2xl border shadow-xl active:scale-95 transition-all ${shotNumber <= 1 ? 'bg-slate-950/55 border-slate-800 text-slate-700 cursor-not-allowed' : 'bg-slate-950/85 border-slate-700 text-white hover:border-emerald-500/50'}`}
        >
           <ChevronLeft className="w-6 h-6" strokeWidth={3} />
        </button>
        <button
           aria-label="Go to next finger"
           onClick={() => goToShot(shotNumberRef.current + 1)}
           disabled={shotNumber >= steps.length}
           className={`w-12 h-12 flex items-center justify-center rounded-2xl border shadow-xl active:scale-95 transition-all ${shotNumber >= steps.length ? 'bg-slate-950/55 border-slate-800 text-slate-700 cursor-not-allowed' : 'bg-slate-950/85 border-slate-700 text-white hover:border-emerald-500/50'}`}
        >
           <ChevronRight className="w-6 h-6" strokeWidth={3} />
        </button>
     </div>
  );
  const captureControl = (
     <button
        aria-label="Take snapshot for assisted measurement"
        onClick={startAssistMeasurement}
        disabled={!isCameraReady}
        className={`w-24 h-24 flex items-center justify-center rounded-[36px] transition-all shadow-2xl relative overflow-hidden ring-[12px] ${isCameraReady ? 'bg-emerald-500 text-slate-950 ring-emerald-500/20 cursor-pointer active:scale-90 active:bg-emerald-400 hover:bg-emerald-400' : 'bg-slate-800/80 text-slate-600 ring-slate-800/20 cursor-not-allowed opacity-80'}`}
     >
        <Camera className={`w-9 h-9 scale-110 ${!isCameraReady && 'opacity-50'}`} strokeWidth={3} />
     </button>
  );

  if (currentStep === 'finish') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
       <div className="absolute top-0 inset-x-0 h-64 bg-emerald-500/5 blur-3xl opacity-50" />
       
       <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
       <h2 className="text-3xl font-black text-white mb-1 tracking-tighter italic uppercase">NAIL PALETTE REPORT 🛡️</h2>
       <p className="text-slate-500 mb-8 text-[9px] font-black tracking-widest uppercase opacity-60">V30 SURGICAL PRECISION LOG</p>
       
       <div className="w-full max-w-sm flex flex-col gap-6 mb-10">
          {/* LEFT HAND */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 backdrop-blur-md">
             <div className="text-[10px] text-emerald-400 font-black tracking-widest uppercase mb-4 text-left border-b border-emerald-500/10 pb-2 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" /> LEFT HAND PALETTE
             </div>
             <div className="grid grid-cols-5 gap-2">
                {steps.slice(0, 5).map(f => (
                   <div key={f} className="flex flex-col items-center bg-black/40 p-2 rounded-xl border border-slate-800/80">
                      <span className="text-[7px] text-slate-500 font-bold mb-1 truncate w-full uppercase">{f.replace('Left ', '')}</span>
                      <span className="text-sm font-black text-white leading-none tracking-tighter">#{results[f]?.size || '0'}</span>
                      <span className="text-[7px] text-emerald-500/60 font-black mt-1 leading-none">{results[f]?.mm}mm</span>
                   </div>
                ))}
             </div>
          </div>

          {/* RIGHT HAND */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 backdrop-blur-md">
             <div className="text-[10px] text-emerald-400 font-black tracking-widest uppercase mb-4 text-left border-b border-emerald-500/10 pb-2 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" /> RIGHT HAND PALETTE
             </div>
             <div className="grid grid-cols-5 gap-2">
                {steps.slice(5, 10).map(f => (
                   <div key={f} className="flex flex-col items-center bg-black/40 p-2 rounded-xl border border-slate-800/80">
                      <span className="text-[7px] text-slate-500 font-bold mb-1 truncate w-full uppercase">{f.replace('Right ', '')}</span>
                      <span className="text-sm font-black text-white leading-none tracking-tighter">#{results[f]?.size || '0'}</span>
                      <span className="text-[7px] text-emerald-500/60 font-black mt-1 leading-none">{results[f]?.mm}mm</span>
                   </div>
                ))}
             </div>
          </div>
       </div>

       <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
             onClick={() => goToShot(1)}
             className="w-full py-5 bg-slate-900 border border-slate-700 text-slate-200 font-black rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-xs tracking-widest uppercase mb-1"
          >
             <ChevronLeft className="w-4 h-4" /> EDIT MEASUREMENTS
          </button>

          <button 
             onClick={() => {
                const text = steps.map(f => `${f}: Size ${results[f]?.size} (${results[f]?.mm}mm)`).join('\n');
                navigator.clipboard.writeText(`NAILSCALE REPORT:\n${text}`);
                alert("Nail Report Copied to Clipboard! 🛡️💅🏽");
             }}
             className="w-full py-5 bg-slate-900 border border-emerald-500/50 text-emerald-400 font-black rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-xs tracking-widest uppercase mb-1"
          >
             <ChevronRight className="w-4 h-4" /> COPY TEXT REPORT
          </button>
          
          <button onClick={() => setCurrentStep('welcome')} className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-2xl transition-all active:scale-95 text-lg shadow-emerald-500/20 ring-4 ring-emerald-500/10 uppercase">START NEW SESSION</button>
       </div>
    </div>
  )

  if (currentStep === 'welcome') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-12 overflow-hidden">
       <div className="absolute top-0 inset-x-0 h-96 bg-emerald-500/10 blur-[120px] rounded-full -translate-y-1/2" />
       <div className="relative z-10 w-24 h-24 bg-slate-900 border border-emerald-500/30 rounded-[32px] flex items-center justify-center mb-10 shadow-inner">
          <Scan className="w-10 h-10 text-emerald-400" />
       </div>
       <h1 className="text-4xl font-black text-white mb-3 tracking-tighter leading-none italic">NailScale <span className="text-emerald-500 underline decoration-4 decoration-emerald-500/20 underline-offset-8">AI</span></h1>
       <p className="text-slate-500 font-bold tracking-widest text-[9px] uppercase mb-16 opacity-70">V30.0 STRICT LOCK | PRECISION MASTER</p>
       
       <div className="w-full max-w-sm bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 mb-12 backdrop-blur-xl">
          <div className="flex items-center gap-4 mb-4">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
             <span className="text-xs text-slate-300 font-bold">PRECISION GRID SEQUENCE</span>
          </div>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-3">
             {steps.map(s => (
                <li key={s} className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-widest leading-none">
                   <ChevronRight className="w-3 h-3 text-emerald-500 shrink-0" /> {s.replace('Left ', 'L-').replace('Right ', 'R-')}
                </li>
             ))}
          </ul>
       </div>

       <div className="w-full max-w-sm mb-5">
          <label className="block text-[10px] text-slate-500 font-black tracking-widest uppercase mb-2">CUSTOMER EMAIL</label>
          <div className="relative">
             <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
             <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@email.com"
                className="w-full h-14 bg-slate-900/70 border border-slate-800 rounded-2xl pl-11 pr-4 text-sm font-bold text-white outline-none focus:border-emerald-500/70"
                autoComplete="email"
             />
          </div>
       </div>
       
       <button 
          onClick={startWizard}
          disabled={systemBooting}
          className={`w-full max-w-sm py-6 rounded-3xl font-black text-xl tracking-tighter shadow-2xl transition-all active:scale-95 ${systemBooting ? 'bg-slate-800 text-slate-500 grayscale' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30 ring-4 ring-emerald-500/10'}`}
       >
          {systemBooting ? 'SYSTEM BOOTING...' : 'INITIALIZE PRECISION GRID'}
       </button>

       <button
          onClick={() => { window.location.href = '/admin'; }}
          className="mt-5 text-[10px] font-black tracking-widest uppercase text-slate-600 hover:text-emerald-400"
       >
          ADMIN
       </button>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden select-none">
       {/* SHUTTER FLASH LAYER */}
       {shutterFlash && <div className="absolute inset-0 bg-white z-[100] animate-out fade-out duration-150" />}
       {topNavigationControls}

       {assistFrame && quarter && nail && radiusHandle && (
          <div className="absolute inset-0 z-[90] bg-slate-950 flex flex-col font-sans overflow-hidden">
             <div className="px-5 pt-20 pb-4 border-b border-slate-900/80 flex items-center justify-between gap-4">
                <div className="min-w-0">
                   <span className="text-[10px] text-slate-500 font-black tracking-[0.2em] uppercase opacity-70">ASSIST {shotNumber}/10</span>
                   <h3 className="text-xl font-black text-white tracking-widest leading-none uppercase italic truncate">{steps[shotNumber-1]}</h3>
                   <span className={`mt-2 inline-flex px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${assistAiClass}`}>
                      {assistAi.label}
                   </span>
                </div>
                <div className="text-right shrink-0">
                   <div className="text-[10px] text-slate-500 font-black tracking-widest uppercase">SIZE</div>
                   <div className="text-3xl font-black text-emerald-400 leading-none">#{assistMeasurement?.size || '-'}</div>
                   <div className="text-[10px] text-slate-400 font-black">{assistMeasurement?.mm || '0.00'}mm</div>
                </div>
             </div>

             <div className="flex-1 min-h-0 p-3 flex items-center justify-center bg-black">
                <div
                   ref={assistSurfaceRef}
                   className="relative max-w-3xl overflow-hidden border border-slate-800 bg-black touch-none"
                   style={{
                      aspectRatio: `${assistFrame.width} / ${assistFrame.height}`,
                      width: `min(100%, calc(72vh * ${assistFrame.width / assistFrame.height}))`,
                   }}
                   onPointerMove={(event) => dragHandle && moveAssistHandle(dragHandle, event)}
                   onPointerUp={stopAssistDrag}
                   onPointerCancel={stopAssistDrag}
                >
                   <img
                      src={assistFrame.image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={assistZoomStyle}
                      draggable="false"
                   />
                   <svg
                      className="absolute inset-0 w-full h-full"
                      style={assistZoomStyle}
                      viewBox={`0 0 ${assistFrame.width} ${assistFrame.height}`}
                      preserveAspectRatio="none"
                   >
                      <defs>
                         <filter id="assistGlow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                               <feMergeNode in="blur" />
                               <feMergeNode in="SourceGraphic" />
                            </feMerge>
                         </filter>
                      </defs>

                      <circle cx={quarter.x} cy={quarter.y} r={quarter.r} fill="rgba(16,185,129,0.06)" stroke="#10b981" strokeWidth="2.5" strokeDasharray="12 10" filter="url(#assistGlow)" />
                      <line x1={quarter.x - 10} y1={quarter.y} x2={quarter.x + 10} y2={quarter.y} stroke="#10b981" strokeWidth="2" />
                      <line x1={quarter.x} y1={quarter.y - 10} x2={quarter.x} y2={quarter.y + 10} stroke="#10b981" strokeWidth="2" />

                      <line x1={nail.left.x} y1={nail.left.y} x2={nail.right.x} y2={nail.right.y} stroke="#f8fafc" strokeWidth="5" strokeLinecap="round" opacity="0.25" filter="url(#assistGlow)" />
                      <line x1={nail.left.x} y1={nail.left.y} x2={nail.right.x} y2={nail.right.y} stroke="#10b981" strokeWidth="2.25" strokeLinecap="round" strokeDasharray="7 6" />

                      {renderAssistHandle('quarter', quarter.x, quarter.y, '#10b981')}
                      {renderAssistHandle('quarterRadius', radiusHandle.x, radiusHandle.y, '#22d3ee')}
                      {renderNailEdgeHandle('nailLeft', nail.left.x, nail.left.y, '#f8fafc')}
                      {renderNailEdgeHandle('nailRight', nail.right.x, nail.right.y, '#f8fafc')}
                   </svg>
                </div>
             </div>

             <div className="p-5 bg-slate-950 border-t border-slate-900/80 flex items-center gap-3">
                <button
                   aria-label="Reset assisted guides"
                   onClick={resetAssistGuide}
                   className="w-14 h-14 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-300 active:scale-95"
                >
                   <Scan className="w-6 h-6" />
                </button>

                <button
                   aria-label="Use assisted measurement"
                   onClick={applyAssistMeasurement}
                   disabled={!assistMeasurement}
                   className={`flex-1 h-16 rounded-2xl font-black tracking-widest text-xs uppercase flex items-center justify-center gap-2 active:scale-95 ${assistMeasurement ? 'bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                >
                   <CheckCircle2 className="w-5 h-5" /> USE MEASUREMENT
                </button>
             </div>
          </div>
       )}

       {/* HUD TOP: AI STATUS */}
       <div className="absolute top-12 inset-x-0 flex flex-col items-center gap-3 z-30 pointer-events-none">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase shadow-xl ${isStableSignal ? 'bg-emerald-500/90 text-slate-950 border-emerald-300' : 'bg-slate-950/80 text-slate-300 border-slate-700'}`}>
             {message}
          </div>

          <div className="flex gap-2">
             {[
                ['quarter', 'QTR'],
                ['finger', 'FINGER'],
                ['level', 'LEVEL'],
             ].map(([key, label]) => (
                <span
                   key={key}
                   className={`px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${detectionState[key] ? 'bg-emerald-500/90 text-slate-950 border-emerald-300' : 'bg-slate-950/70 text-slate-500 border-slate-800'}`}
                >
                   {label}
                </span>
             ))}
             {trainingStatus.status !== 'idle' && (
                <span className={`px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${trainingStatusClass}`}>
                   {trainingStatus.label}
                </span>
             )}
             {customerSaveStatus.status !== 'idle' && (
                <span className={`px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${customerSaveStatusClass}`}>
                   {customerSaveStatus.label}
                </span>
             )}
          </div>

          {isStableSignal && measurement && (
             <div className="bg-emerald-500 text-slate-950 px-5 py-1 rounded-full font-black text-[10px] tracking-tight shadow-xl animate-in fade-in slide-in-from-top-2 border-2 border-emerald-400">
                LOCKED: SIZE {measurement.size} (99% ACCURACY)
             </div>
          )}
       </div>

       {/* VISION LAYER */}
       <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-100 brightness-100 contrast-100 shadow-inner" playsInline muted />
          
          {/* Main Feed with High Contrast */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/80 pointer-events-none z-0" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 opacity-90" />

          {/* CRITICAL RECOVERY OVERLAY */}
          {isVisionCrashed && (
             <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center z-[200] animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-6 ring-4 ring-rose-500/20">
                   <ShieldAlert className="w-10 h-10 text-rose-500" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2 tracking-tighter uppercase italic">ENGINE LOCKDOWN</h2>
                <p className="text-slate-400 text-xs max-w-[280px] mb-8 font-medium leading-relaxed uppercase tracking-widest opacity-60">Surgical vision core stalled on Vercel Node. System logs below:</p>
                
                <div className="w-full max-w-sm bg-black border border-slate-800 rounded-2xl p-5 mb-10 text-left h-56 overflow-y-auto font-mono text-[10px] shadow-2xl relative">
                   <div className="absolute top-0 right-0 p-2 text-[8px] text-slate-700 font-black">V12 RELAY</div>
                   {debugLog.length > 0 ? debugLog.map((log, i) => (
                      <div key={i} className="text-emerald-500/80 mb-1.5 leading-tight tracking-tight border-l border-emerald-500/20 pl-2">{log}</div>
                   )) : <div className="text-slate-600 italic">Synchronizing Logs...</div>}
                </div>

                <button onClick={() => window.location.reload()} className="w-full max-w-[280px] py-5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.2em] ring-4 ring-rose-600/10">FORCE SYSTEM RESTART</button>
             </div>
          )}
       </div>

       {/* CONTROL SURFACE */}
       <div className="p-6 sm:p-10 bg-slate-950 border-t border-slate-900/50 flex flex-col items-center justify-center gap-5 z-40">
          <div className="min-w-0 flex flex-col gap-1.5 text-center w-full max-w-sm">
             <span className="text-[10px] text-slate-500 font-black tracking-[0.2em] uppercase opacity-70">{handSideLabel} {shotNumber}/10</span>
             <h3 className="text-xl sm:text-2xl font-black text-white tracking-widest leading-none uppercase italic truncate">{steps[shotNumber-1]}</h3>
             {currentSavedMeasurement && (
                <span className="text-[9px] text-emerald-400 font-black tracking-widest uppercase">SAVED #{currentSavedMeasurement.size} / {currentSavedMeasurement.mm}mm</span>
             )}
             {allFingersMeasured && (
                <button
                   onClick={() => setCurrentStep('finish')}
                   className="mx-auto mt-1 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-300 text-[9px] font-black tracking-widest uppercase active:scale-95"
                >
                   Review Report
                </button>
             )}
          </div>

          <div className="flex items-center justify-center">
             {captureControl}
          </div>
       </div>
    </div>
  )
}

export default App
