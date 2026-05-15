import React, { useState, useEffect, useRef } from 'react'
import { Camera, ShieldAlert, Scan, CheckCircle2, ChevronLeft, ChevronRight, KeyRound, Mail, RefreshCcw, Sparkles } from 'lucide-react'
import {
  DEFAULT_FIT_CONTEXT,
  NAIL_BED_CURVES,
  NAIL_FIT_PROFILES,
  getFullSizing,
  getNailSizeRecommendation,
  normalizeFitContext,
  calculateFingerWidthPixels,
  calculateMM,
} from './utils/sizing'
import AdminPortal from './AdminPortal.jsx'
import BrandDecor from './BrandArtwork.jsx'

// V30: Explicit 10-Finger Sequence Mapping
// L-Pinky(20), L-Ring(16), L-Mid(12), L-Index(8), L-Thumb(4)
// R-Thumb(4), R-Index(8), R-Mid(12), R-Ring(16), R-Pinky(20)
const getFingerIndexForShot = (shotNum) => [20, 16, 12, 8, 4, 4, 8, 12, 16, 20][shotNum - 1] || 8;

const LEVEL_TOLERANCE_DEGREES = 8;
const CAPTURE_LAYOUTS = {
  portrait: {
    key: 'portrait',
    label: 'Upright',
    shortLabel: 'UPRIGHT',
    quarter: { x: 0.5, y: 0.3, r: 0.19 },
    nailBox: { x: 0.14, y: 0.42, w: 0.72, h: 0.5 },
  },
};
const AI_GUIDE_ENDPOINT = '/api/vision-detect';
const TRAINING_LABEL_ENDPOINT = '/api/training-labels';
const CUSTOMER_NAILSET_ENDPOINT = '/api/customer-nailsets';
const CUSTOMER_LOGIN_ENDPOINT = '/api/customer-login';
const NAIL_EDGE_HANDLE_DROP = 112;
const ASSIST_FRAME_ZOOM = 1.25;
const APP_VERSION = 'upright-capture-only-v1';
const TRAINING_STATUS_IDLE = { status: 'idle', label: '' };
const CUSTOMER_SAVE_STATUS_IDLE = { status: 'idle', label: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOMER_PASSWORD_MIN_LENGTH = 8;
const MIN_VIDEO_WIDTH = 1280;
const MIN_VIDEO_HEIGHT = 720;
const MIN_QUARTER_PIXELS = 170;
const IDEAL_QUARTER_PIXELS = 220;
const MIN_CAPTURE_SHORT_EDGE = 720;
const MAX_CAPTURE_LONG_EDGE = 1800;
const BRAND_GUIDE = {
  coin: '#c9a56a',
  coinRadius: '#c9b4dc',
  nail: '#fff8ee',
  nailAccent: '#e8b7b3',
  cocoa: '#6f351f',
  ready: '#c9a56a',
  alert: '#cf5b70',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getCaptureLayout = (layoutKey) => CAPTURE_LAYOUTS[layoutKey] || CAPTURE_LAYOUTS.portrait;

const getQuarterTarget = (width, height, layoutKey) => {
  const layout = getCaptureLayout(layoutKey);
  const basis = Math.min(width, height);
  return {
    x: layout.quarter.x * width,
    y: layout.quarter.y * height,
    r: layout.quarter.r * basis,
  };
};

const getNailTargetBox = (width, height, layoutKey) => {
  const layout = getCaptureLayout(layoutKey);
  return {
    x: layout.nailBox.x * width,
    y: layout.nailBox.y * height,
    w: layout.nailBox.w * width,
    h: layout.nailBox.h * height,
  };
};

const getGuideMetrics = (width, height, layoutKey) => {
  const quarter = getQuarterTarget(width, height, layoutKey);
  const nailBox = getNailTargetBox(width, height, layoutKey);
  return {
    layout: getCaptureLayout(layoutKey).shortLabel,
    quarterDiameter: Math.round(quarter.r * 2),
    nailBoxWidth: Math.round(nailBox.w),
    nailBoxHeight: Math.round(nailBox.h),
  };
};

const getFingerTargetLabel = () => 'lower target';

const sanitizeForJson = (value, depth = 0) => {
  if (depth > 4 || value === undefined || typeof value === 'function') return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => sanitizeForJson(item, depth + 1)).filter(item => item !== undefined).slice(0, 40);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, sanitizeForJson(entry, depth + 1)])
        .filter(([, entry]) => entry !== undefined)
    );
  }
  return String(value);
};

const getVideoTrackMetadata = (stream, preferredFacingMode = 'environment') => {
  const track = stream?.getVideoTracks?.()?.[0];
  if (!track) return null;

  let settings = {};
  let capabilities = {};
  let constraints = {};

  try { settings = sanitizeForJson(track.getSettings?.() || {}) || {}; } catch (error) { settings = {}; }
  try { capabilities = sanitizeForJson(track.getCapabilities?.() || {}) || {}; } catch (error) { capabilities = {}; }
  try { constraints = sanitizeForJson(track.getConstraints?.() || {}) || {}; } catch (error) { constraints = {}; }

  return {
    label: track.label || '',
    kind: track.kind || 'video',
    readyState: track.readyState || '',
    preferredFacingMode,
    facingMode: settings.facingMode || '',
    width: settings.width || null,
    height: settings.height || null,
    aspectRatio: settings.aspectRatio || null,
    frameRate: settings.frameRate || null,
    deviceIdPresent: Boolean(settings.deviceId),
    groupIdPresent: Boolean(settings.groupId),
    supports: {
      zoom: Boolean(capabilities.zoom),
      torch: Boolean(capabilities.torch),
      focusMode: Boolean(capabilities.focusMode),
      exposureMode: Boolean(capabilities.exposureMode),
    },
    settings,
    capabilities,
    constraints,
  };
};

const buildFrameCameraMetadata = (video, streamMetadata) => ({
  track: streamMetadata || null,
  video: {
    width: video?.videoWidth || null,
    height: video?.videoHeight || null,
  },
  viewport: {
    width: Math.round(window.innerWidth || 0),
    height: Math.round(window.innerHeight || 0),
    devicePixelRatio: Number(window.devicePixelRatio || 1),
  },
  userAgent: window.navigator?.userAgent || '',
  capturedAt: new Date().toISOString(),
});

const getCaptureQuality = (frame) => {
  if (!frame?.width || !frame?.height || !frame?.guide?.quarter) {
    return {
      status: 'check',
      label: 'QUALITY CHECK',
      score: 0,
      blocking: ['Frame unavailable'],
      warnings: ['Capture frame unavailable'],
      metrics: {},
    };
  }

  const videoWidth = Number(frame.camera?.video?.width || frame.camera?.track?.width || frame.width);
  const videoHeight = Number(frame.camera?.video?.height || frame.camera?.track?.height || frame.height);
  const videoLongEdge = Math.max(videoWidth, videoHeight);
  const videoShortEdge = Math.min(videoWidth, videoHeight);
  const quarterPixels = Number(frame.guide.quarter.r || 0) * 2;
  const facingMode = String(frame.camera?.track?.facingMode || frame.camera?.track?.preferredFacingMode || '').toLowerCase();
  const scoreParts = [];
  const warnings = [];
  const blocking = [];

  if (videoLongEdge >= MIN_VIDEO_WIDTH && videoShortEdge >= MIN_VIDEO_HEIGHT) {
    scoreParts.push(30);
  } else {
    scoreParts.push(12);
    warnings.push('Use rear camera or move closer for more pixels');
  }

  if (quarterPixels >= IDEAL_QUARTER_PIXELS) {
    scoreParts.push(35);
  } else if (quarterPixels >= MIN_QUARTER_PIXELS) {
    scoreParts.push(24);
    warnings.push('Quarter is usable but should be larger');
  } else {
    scoreParts.push(6);
    blocking.push('Move closer so the quarter is larger');
  }

  if (!facingMode || facingMode.includes('environment') || facingMode.includes('back')) {
    scoreParts.push(15);
  } else {
    scoreParts.push(6);
    warnings.push('Rear camera is preferred');
  }

  if (frame.camera?.track?.supports?.focusMode || frame.camera?.track?.supports?.zoom || videoWidth >= 1600) {
    scoreParts.push(10);
  } else {
    scoreParts.push(6);
  }

  if (Number(frame.width) >= 360 && Number(frame.height) >= 540) {
    scoreParts.push(10);
  } else {
    scoreParts.push(4);
    warnings.push('Screen capture area is small');
  }

  const score = clamp(Math.round(scoreParts.reduce((sum, value) => sum + value, 0)), 0, 100);
  const status = blocking.length ? 'retake' : score >= 82 ? 'good' : score >= 62 ? 'check' : 'retake';

  return {
    status,
    label: status === 'good' ? 'GOOD CAPTURE' : status === 'check' ? 'CHECK CAPTURE' : 'RETAKE PHOTO',
    score,
    blocking,
    warnings,
    metrics: {
      videoWidth,
      videoHeight,
      quarterPixels: Math.round(quarterPixels),
      facingMode: facingMode || 'unknown',
    },
  };
};

const isCustomerPasswordValid = (password) => String(password || '').length >= CUSTOMER_PASSWORD_MIN_LENGTH;

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

const getHighResolutionCaptureSize = (video, rect) => {
  const viewWidth = Math.max(1, Number(rect.width || video.videoWidth || 720));
  const viewHeight = Math.max(1, Number(rect.height || video.videoHeight || 1280));
  const aspect = viewWidth / viewHeight;
  const naturalWidth = Math.max(1, Number(video.videoWidth || viewWidth));
  const naturalHeight = Math.max(1, Number(video.videoHeight || viewHeight));
  const naturalAspect = naturalWidth / naturalHeight;

  let width;
  let height;

  if (aspect >= naturalAspect) {
    width = Math.min(naturalWidth, MAX_CAPTURE_LONG_EDGE);
    height = width / aspect;
  } else {
    height = Math.min(naturalHeight, MAX_CAPTURE_LONG_EDGE);
    width = height * aspect;
  }

  if (Math.min(width, height) < MIN_CAPTURE_SHORT_EDGE) {
    const upscale = MIN_CAPTURE_SHORT_EDGE / Math.min(width, height);
    width *= upscale;
    height *= upscale;
  }

  if (Math.max(width, height) > MAX_CAPTURE_LONG_EDGE) {
    const downscale = MAX_CAPTURE_LONG_EDGE / Math.max(width, height);
    width *= downscale;
    height *= downscale;
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
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

const findQuarterInFrame = (video, rect, transform, quarterTarget) => {
  const cv = window.cv;
  if (!cv?.Mat || !video.videoWidth || !video.videoHeight || !rect.width || !rect.height) return null;

  const ringCenter = {
    x: quarterTarget.x,
    y: quarterTarget.y,
  };
  const ringRadius = quarterTarget.r;
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

const getDefaultAssistGuide = (width, height, layoutKey = 'portrait') => {
  const quarter = getQuarterTarget(width, height, layoutKey);
  const nailBox = getNailTargetBox(width, height, layoutKey);
  return {
    quarter,
    nail: {
      left: { x: nailBox.x + nailBox.w * 0.36, y: nailBox.y + nailBox.h * 0.55 },
      right: { x: nailBox.x + nailBox.w * 0.64, y: nailBox.y + nailBox.h * 0.55 },
    },
  };
};

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

const requestAssistGuide = async ({ image, width, height, fingerName, captureLayout }) => {
  const response = await fetch(AI_GUIDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, width, height, fingerName, captureLayout }),
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

const requestCustomerLogin = async ({ customerEmail, password }) => {
  const response = await fetch(CUSTOMER_LOGIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerEmail, password }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Customer login endpoint unavailable');
  }

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.reason || data?.error || 'Customer login failed');
  }

  return data;
};

const getAssistMeasurement = (frame) => {
  if (!frame?.guide) return null;

  const { quarter, nail } = frame.guide;
  const quarterPixels = quarter.r * 2;
  const nailPixels = Math.hypot(nail.right.x - nail.left.x, nail.right.y - nail.left.y);
  const mm = calculateMM(nailPixels, quarterPixels);
  const fitContext = normalizeFitContext(frame.fitContext || DEFAULT_FIT_CONTEXT);
  const sizing = getNailSizeRecommendation(mm, fitContext);
  const size = sizing.size;

  if (!Number.isFinite(mm) || mm <= 0 || size === 'N/A') return null;

  const baseQuality = getCaptureQuality(frame);
  const captureQuality = {
    ...baseQuality,
    warnings: [
      ...(baseQuality.warnings || []),
      sizing.rangeCheck?.warning,
    ].filter(Boolean),
    sizing,
  };

  return {
    mm: mm.toFixed(2),
    size,
    method: 'assist',
    quarterPixels,
    nailPixels,
    adjustedMM: sizing.adjustedMM.toFixed(2),
    recommendedSize: sizing.recommendedSize,
    alternateSize: sizing.alternateSize,
    sizeRange: sizing.sizeRange,
    isBetween: sizing.isBetween,
    sizing,
    fitContext,
    captureQuality,
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
    camera: cloneJson(frame.camera),
    quality: cloneJson(frame.quality),
    fitContext: normalizeFitContext(frame.fitContext || DEFAULT_FIT_CONTEXT),
    captureLayout: getCaptureLayout(frame.captureLayout).key,
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
    adjustedMM: result.adjustedMM,
    recommendedSize: result.recommendedSize,
    alternateSize: result.alternateSize,
    sizeRange: result.sizeRange,
    isBetween: result.isBetween,
    sizing: cloneJson(result.sizing),
    fitContext: result.fitContext ? normalizeFitContext(result.fitContext) : null,
    captureQuality: cloneJson(result.captureQuality),
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

const formatCustomerDate = (value) => {
  if (!value) return 'Saved session';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved session';
  return date.toLocaleString();
};

const formatSizeDisplay = (size, { compact = false } = {}) => {
  const value = String(size || '').trim();
  if (!value) return compact ? '-' : 'Size -';
  if (value.includes('-')) return compact ? value : `Between ${value}`;
  return compact ? `#${value}` : `Size ${value}`;
};

const getStoredFitContext = () => {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem('nailmeasure_fit_context') || '{}');
    return normalizeFitContext({ ...DEFAULT_FIT_CONTEXT, ...parsed });
  } catch (error) {
    return normalizeFitContext(DEFAULT_FIT_CONTEXT);
  }
};

const storeFitContext = (fitContext) => {
  try {
    window.localStorage?.setItem('nailmeasure_fit_context', JSON.stringify(normalizeFitContext(fitContext)));
  } catch (error) {
    // Local storage is only for convenience.
  }
};

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
      camera: cloneJson(frame.camera),
      quality: cloneJson(frame.quality || getCaptureQuality(frame)),
      fitContext: normalizeFitContext(frame.fitContext || DEFAULT_FIT_CONTEXT),
      captureLayout: getCaptureLayout(frame.captureLayout).key,
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
      adjustedMM: Number(measurement.adjustedMM),
      recommendedSize: measurement.recommendedSize || null,
      alternateSize: measurement.alternateSize || null,
      sizeRange: measurement.sizeRange || null,
      isBetween: Boolean(measurement.isBetween),
      sizing: cloneJson(measurement.sizing),
      fitContext: normalizeFitContext(measurement.fitContext || frame.fitContext || DEFAULT_FIT_CONTEXT),
      captureQuality: cloneJson(measurement.captureQuality || frame.quality || getCaptureQuality(frame)),
    },
    source: 'assist-correction',
    appVersion: APP_VERSION,
  };
};

const buildCustomerNailsetPayload = ({ customerEmail, password, fitContext, sessionId, results, steps, status }) => {
  const normalizedEmail = normalizeEmail(customerEmail);
  if (!EMAIL_PATTERN.test(normalizedEmail)) return null;

  if (!isCustomerPasswordValid(password)) return null;
  const normalizedFitContext = normalizeFitContext(fitContext || DEFAULT_FIT_CONTEXT);

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
        adjustedMM: result.adjustedMM,
        recommendedSize: result.recommendedSize,
        alternateSize: result.alternateSize,
        sizeRange: result.sizeRange,
        isBetween: result.isBetween,
        sizing: cloneJson(result.sizing),
        fitContext: normalizeFitContext(result.fitContext || normalizedFitContext),
        captureQuality: cloneJson(result.captureQuality),
        guide: cloneAssistGuide(result.frame?.guide),
        image: result.frame?.image || null,
        frame: result.frame
          ? {
              width: result.frame.width,
              height: result.frame.height,
              zoom: result.frame.zoom || ASSIST_FRAME_ZOOM,
              camera: cloneJson(result.frame.camera),
              quality: cloneJson(result.captureQuality || result.frame.quality),
              fitContext: normalizeFitContext(result.frame.fitContext || result.fitContext || normalizedFitContext),
              captureLayout: getCaptureLayout(result.frame.captureLayout).key,
            }
          : null,
        capturedAt: result.capturedAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (!measurements.length) return null;

  return {
    sessionId,
    customerEmail: normalizedEmail,
    password,
    fitContext: normalizedFitContext,
    status,
    measurements,
    source: 'customer-measurement-flow',
    appVersion: APP_VERSION,
  };
};

function App() {
  const hostname = window.location.hostname.toLowerCase();
  if (window.location.pathname.startsWith('/admin') || hostname.startsWith('admin.') || hostname.startsWith('admin-')) {
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
  const [customerPassword, setCustomerPassword] = useState('')
  const [customerPortalStatus, setCustomerPortalStatus] = useState({ type: 'idle', text: '' })
  const [customerSessions, setCustomerSessions] = useState([])
  const [fitContext, setFitContext] = useState(getStoredFitContext)
  const captureLayout = 'portrait'
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth || 390,
    height: window.innerHeight || 844,
  }))
  const [cameraProfile, setCameraProfile] = useState(null)
  
  // Vision Health & Stability
  const [systemBooting, setSystemBooting] = useState(true)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isVisionReady, setIsVisionReady] = useState(false)
  const [isVisionCrashed, setIsVisionCrashed] = useState(false)
  const [librariesLoaded, setLibrariesLoaded] = useState(false)
  const [message, setMessage] = useState('Getting camera ready...')
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
  const cameraProfileRef = useRef(null)
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
  useEffect(() => { storeFitContext(fitContext) }, [fitContext])
  useEffect(() => {
    const updateViewport = () => {
      setViewportSize({
        width: window.innerWidth || 390,
        height: window.innerHeight || 844,
      });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, [])
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

  const updateFitContext = (field, value) => {
    setFitContext(prev => normalizeFitContext({ ...prev, [field]: value }));
  }

  const loadCustomerPortal = async () => {
    const normalizedEmail = normalizeEmail(customerEmail);

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setCustomerPortalStatus({ type: 'error', text: 'Enter a valid email address' });
      return;
    }

    if (!isCustomerPasswordValid(customerPassword)) {
      setCustomerPortalStatus({ type: 'error', text: 'Enter your account password' });
      return;
    }

    setCustomerPortalStatus({ type: 'loading', text: 'Checking saved nail sizes' });

    try {
      const data = await requestCustomerLogin({
        customerEmail: normalizedEmail,
        password: customerPassword,
      });
      setCustomerEmail(normalizedEmail);
      storeCustomerEmail(normalizedEmail);
      setCustomerSessions(data.sessions || []);
      setCurrentStep('customerReview');
      setCustomerPortalStatus({
        type: 'success',
        text: `${data.sessions?.length || 0} saved session${data.sessions?.length === 1 ? '' : 's'} found`,
      });
    } catch (error) {
      setCustomerSessions([]);
      setCustomerPortalStatus({ type: 'error', text: error.message || 'Saved sizes unavailable' });
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
    if (!isCustomerPasswordValid(customerPassword)) {
       alert(`Create an account password with at least ${CUSTOMER_PASSWORD_MIN_LENGTH} characters.`);
       return;
    }
    setCustomerEmail(normalizedEmail)
    storeCustomerEmail(normalizedEmail)
    setFitContext(normalizeFitContext(fitContext))
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
    setMessage('Opening camera...')
    lastHandRef.current = null
    lastQuarterRef.current = 0
    videoDimsRef.current = { w: 0, h: 0 }
    cameraProfileRef.current = null
    setCameraProfile(null)
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
      setMessage(`Place ${fingerName} in ${getFingerTargetLabel(captureLayout)}`);
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
      password: customerPassword,
      fitContext,
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

    const attachStream = (stream, preferredFacingMode) => {
       const profile = getVideoTrackMetadata(stream, preferredFacingMode);
       cameraProfileRef.current = profile;
       setCameraProfile(profile);

       if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
             videoRef.current.play().catch(() => setMessage('Tap to Allow Camera Playback'));
             checkDimensions();
          }
       }
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
          setMessage('Opening camera...');
          const stream = await requestStream({
             video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
                advanced: [
                  { focusMode: 'continuous' },
                  { exposureMode: 'continuous' },
                ],
             }
          });
          if (!stream) return;
          if (cancelled) {
             stream.getTracks().forEach(track => track.stop());
             return;
          }
          attachStream(stream, 'environment');
       } catch (err) {
          // Fallback to front camera if environment fails
          try {
             const fallbackStream = await requestStream({ video: true });
             if (!fallbackStream) return;
             if (cancelled) {
                 fallbackStream.getTracks().forEach(track => track.stop());
                 return;
              }
              attachStream(fallbackStream, 'user');
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
          setMessage('Ready to measure');
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
          const activeLayout = captureLayout;
          const quarterTarget = getQuarterTarget(rect.width, rect.height, activeLayout);
          const nBox = getNailTargetBox(rect.width, rect.height, activeLayout);
          const activeFingerTargetLabel = getFingerTargetLabel(activeLayout);

         const drawSurgicalHUD = () => {
             const w = rect.width;
             const h = rect.height;
             const bx = nBox.x; const by = nBox.y; const bw = nBox.w; const bh = nBox.h;
            const cl = 30; // Corner Length

            ctx.save();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 248, 238, 0.78)';
            ctx.lineWidth = 2.5; // Thin surgical line
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(201, 180, 220, 0.35)';

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
             const dx = quarterTarget.x; const dy = quarterTarget.y; const dr = quarterTarget.r;
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
            ctx.strokeStyle = currentlyLeveled ? BRAND_GUIDE.ready : 'rgba(255,248,238,0.24)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 2 * Math.PI); ctx.stroke(); // Static Target
            ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy); ctx.stroke(); // Static Horizontal
            ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30); ctx.stroke(); // Static Vertical

            // Dynamic Leveling Dot
            const dotX = cx + (currentOrientation.roll * 2.5); // Sensitivity 2.5x
            const dotY = cy + (currentOrientation.pitch * 2.5);
            ctx.beginPath(); 
            ctx.arc(dotX, dotY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = currentlyLeveled ? BRAND_GUIDE.ready : BRAND_GUIDE.alert;
            ctx.fill();
            if (currentlyLeveled) {
               ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(201,165,106,0.7)';
               ctx.stroke();
            }
            ctx.restore();
         };

         drawSurgicalHUD();

         let quarter = null;
         try {
            quarter = findQuarterInFrame(video, rect, transform, quarterTarget);
         } catch (cvErr) {
            console.warn("CV Frame Error:", cvErr);
         }

         const hand = results.landmarks?.[0] || null;
         const viewHand = hand ? toViewLandmarks(hand, transform, rect) : null;
         const fingerIndex = getFingerIndexForShot(shotNumberRef.current);
         const activeTip = viewHand?.[fingerIndex]
            ? { x: viewHand[fingerIndex].x * rect.width, y: viewHand[fingerIndex].y * rect.height }
            : null;
          const nailBox = nBox;
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
            ctx.strokeStyle = BRAND_GUIDE.ready;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 16;
            ctx.shadowColor = 'rgba(201, 165, 106, 0.72)';
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
               ctx.fillStyle = fingerDetected ? 'rgba(201, 165, 106, 0.86)' : 'rgba(255,248,238,0.5)';
               ctx.fill();
            });
         }

         if (!quarterDetected) {
            setIsStableSignal(false);
            setMessage("Move quarter into top circle");
            setMeasurement(null);
         } else if (!viewHand) {
            setIsStableSignal(false);
            setMessage(`Place ${steps[shotNumberRef.current - 1]} in ${activeFingerTargetLabel}`);
            setMeasurement(null);
         } else if (!fingerDetected) {
            setIsStableSignal(false);
            setMessage(`Move ${steps[shotNumberRef.current - 1]} into ${activeFingerTargetLabel}`);
            setMeasurement(null);
         } else if (!levelDetected) {
            setIsStableSignal(false);
            setMessage("Hold phone level");
            setMeasurement(null);
         } else {
            const fingerPx = calculateFingerWidthPixels(viewHand, fingerIndex, rect.width, rect.height);
             const sizing = getFullSizing(fingerPx, quarter.diameter, viewHand, rect.width, rect.height, fitContext);
            const hasSizing = sizing.size !== 'N/A' && Number.parseFloat(sizing.mm) > 0;

            if (hasSizing) {
               setIsStableSignal(true);
               setMessage(`${formatSizeDisplay(sizing.size)} ready`);
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
  }, [isVisionReady, currentStep, fitContext]);

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
      ? { ...nextMeasurement, frame: savedFrame, capturedAt: new Date().toISOString() }
      : { ...nextMeasurement, capturedAt: new Date().toISOString() };
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
      setMessage(nextSavedFrame ? `Review saved ${nextFingerName}` : `Place ${nextFingerName} in ${getFingerTargetLabel(captureLayout)}`);
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
    const captureSize = getHighResolutionCaptureSize(video, rect);
    const width = captureSize.width;
    const height = captureSize.height;
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
    const guide = getDefaultAssistGuide(width, height, captureLayout);
    const frameFitContext = normalizeFitContext(fitContext);
    const camera = buildFrameCameraMetadata(video, cameraProfileRef.current);
    const baseFrame = {
      image,
      width,
      height,
      zoom: ASSIST_FRAME_ZOOM,
      camera,
      fitContext: frameFitContext,
      captureLayout,
      guide,
      aiGuide: null,
      ai: { status: 'scanning', label: 'AI SCAN' },
    };
    const quality = getCaptureQuality(baseFrame);
    const requestId = assistRequestRef.current + 1;
    assistRequestRef.current = requestId;

    setAssistFrame({
      ...baseFrame,
      quality,
    });
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
    setIsStableSignal(false);
    setMeasurement(null);
    setMessage(quality.status === 'retake' ? quality.blocking[0] || 'Retake photo closer' : 'Checking frame with AI guide');

    try {
      const aiResult = await requestAssistGuide({
        image,
        width,
        height,
        fingerName: steps[shotNumberRef.current - 1],
        captureLayout,
      });

      if (assistRequestRef.current !== requestId) return;

      if (aiResult?.guide && (aiResult.guide.quarter || aiResult.guide.nail)) {
        setAssistFrame(prev => {
          if (!prev) return prev;
          const nextGuide = mergeAssistGuide(prev.guide, aiResult.guide, prev.width, prev.height);
          const nextFrame = {
            ...prev,
            guide: nextGuide,
            aiGuide: cloneJson(aiResult.guide),
            ai: {
              status: 'suggested',
              label: 'AI GUIDE',
              configured: aiResult.configured !== false,
              detections: aiResult.detections || null,
              predictionCount: aiResult.predictionCount || 0,
            },
          };
          return {
            ...nextFrame,
            quality: getCaptureQuality(nextFrame),
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

      const nextFrame = { ...prev, guide };
      return { ...nextFrame, quality: getCaptureQuality(nextFrame) };
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
    setAssistFrame(prev => {
      if (!prev) return prev;
      const nextFrame = {
        ...prev,
        guide: getDefaultAssistGuide(prev.width, prev.height, prev.captureLayout || captureLayout),
        ai: { status: 'manual', label: 'MANUAL' },
      };
      return { ...nextFrame, quality: getCaptureQuality(nextFrame) };
    });
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
  }

  const applyAssistMeasurement = () => {
    const nextMeasurement = getAssistMeasurement(assistFrame);
    if (!nextMeasurement) {
      setMessage('Align quarter and nail guides');
      return;
    }

    if (nextMeasurement.captureQuality?.blocking?.length) {
      setMessage(nextMeasurement.captureQuality.blocking[0]);
      setAssistFrame(prev => prev ? ({ ...prev, quality: nextMeasurement.captureQuality }) : prev);
      return;
    }

    setAssistFrame(null);
    setDragHandle(null);
    dragOffsetRef.current = { x: 0, y: 0 };
    advanceSequence(nextMeasurement);
  }

  // UI VIEWS
  const assistMeasurement = getAssistMeasurement(assistFrame);
  const assistQuality = assistFrame ? getCaptureQuality(assistFrame) : null;
  const assistGuide = assistFrame?.guide || null;
  const quarter = assistGuide?.quarter || null;
  const nail = assistGuide?.nail || null;
  const radiusHandle = quarter ? { x: quarter.x + quarter.r, y: quarter.y } : null;
  const assistZoom = assistFrame?.zoom || 1;
  const assistZoomStyle = { transform: `scale(${assistZoom})`, transformOrigin: 'center center' };
  const assistAi = assistFrame?.ai || { status: 'manual', label: 'MANUAL' };
  const assistAiClass = assistAi.status === 'suggested' || assistAi.status === 'saved'
     ? 'brand-chip-active'
     : assistAi.status === 'scanning'
        ? 'brand-chip animate-pulse'
        : 'brand-chip';
  const trainingStatusClass = trainingStatus.status === 'saved'
     ? 'brand-live-badge-on'
     : trainingStatus.status === 'saving'
        ? 'brand-chip-active animate-pulse'
        : trainingStatus.status === 'error'
           ? 'brand-status-error'
           : 'brand-live-badge';
  const customerSaveStatusClass = customerSaveStatus.status === 'saved'
     ? 'brand-live-badge-on'
     : customerSaveStatus.status === 'saving'
        ? 'brand-chip-active animate-pulse'
        : customerSaveStatus.status === 'error'
            ? 'brand-status-error'
            : 'brand-live-badge';
  const customerPortalStatusClass = customerPortalStatus.type === 'success'
     ? 'brand-status-success'
     : customerPortalStatus.type === 'error'
        ? 'brand-status-error'
        : 'brand-status-neutral';
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
  const activeLayoutMetrics = getGuideMetrics(viewportSize.width, viewportSize.height, captureLayout);
  const topNavigationControls = (
     <div className="live-nav-controls absolute top-4 left-4 z-[95] flex items-center gap-2">
        <button
           aria-label="Go to previous finger"
           onClick={() => goToShot(shotNumberRef.current - 1)}
           disabled={shotNumber <= 1}
           className={`w-12 h-12 brand-icon-button flex items-center justify-center rounded-2xl border shadow-xl active:scale-95 transition-all ${shotNumber <= 1 ? 'cursor-not-allowed opacity-45' : 'hover:opacity-90'}`}
        >
           <ChevronLeft className="w-6 h-6" strokeWidth={3} />
        </button>
        <button
           aria-label="Go to next finger"
           onClick={() => goToShot(shotNumberRef.current + 1)}
           disabled={shotNumber >= steps.length}
           className={`w-12 h-12 brand-icon-button flex items-center justify-center rounded-2xl border shadow-xl active:scale-95 transition-all ${shotNumber >= steps.length ? 'cursor-not-allowed opacity-45' : 'hover:opacity-90'}`}
        >
           <ChevronRight className="w-6 h-6" strokeWidth={3} />
        </button>
     </div>
  );
  const captureControl = (
     <button
        type="button"
        aria-label="Take snapshot for assisted measurement"
        onClick={startAssistMeasurement}
        disabled={!isCameraReady}
        className={`live-capture-button w-24 h-24 brand-camera-button flex items-center justify-center rounded-[36px] transition-all shadow-2xl relative overflow-hidden ring-[12px] ${isCameraReady ? 'ring-amber-200/25 cursor-pointer active:scale-90 hover:brightness-105' : 'ring-white/10 cursor-not-allowed opacity-80'}`}
     >
        <Camera className={`w-9 h-9 scale-110 ${!isCameraReady && 'opacity-50'}`} strokeWidth={3} />
     </button>
  );

  if (currentStep === 'finish') return (
    <div className="brand-shell fixed inset-0 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
       <BrandDecor />
       <CheckCircle2 className="w-16 h-16 brand-accent mb-4" />
       <div className="brand-wordmark-small text-5xl mb-1">Nails By Liz</div>
       <h2 className="text-2xl font-black brand-heading mb-2 uppercase">Sizing Report</h2>
       <p className="brand-eyebrow mb-8 text-[10px] font-black tracking-widest uppercase">Professional nail art services</p>
       <div className="brand-panel w-full max-w-sm p-4 mb-6 text-left">
          <div className="grid grid-cols-2 gap-3 text-[9px] font-black uppercase tracking-widest">
             <div>
                <div className="brand-eyebrow mb-1">Account</div>
                <div className="brand-heading text-sm">{customerEmail}</div>
             </div>
             <div>
                <div className="brand-eyebrow mb-1">Fit Context</div>
                <div className="brand-heading text-sm">{fitContext.nailBedCurve.replace('-', ' ')}</div>
             </div>
          </div>
       </div>
       
       <div className="w-full max-w-sm flex flex-col gap-6 mb-10">
          {/* LEFT HAND */}
          <div className="brand-panel p-5">
             <div className="text-[10px] brand-accent font-black tracking-widest uppercase mb-4 text-left border-b brand-divider pb-2 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" /> LEFT HAND PALETTE
             </div>
             <div className="grid grid-cols-5 gap-2">
                {steps.slice(0, 5).map(f => (
                   <div key={f} className="brand-tile flex flex-col items-center p-2">
                      <span className="text-[7px] brand-eyebrow font-bold mb-1 truncate w-full uppercase">{f.replace('Left ', '')}</span>
                      <span className="text-sm font-black brand-heading leading-none">{formatSizeDisplay(results[f]?.size, { compact: true })}</span>
                      <span className="text-[7px] brand-accent font-black mt-1 leading-none">{results[f]?.mm}mm</span>
                   </div>
                ))}
             </div>
          </div>

          {/* RIGHT HAND */}
          <div className="brand-panel p-5">
             <div className="text-[10px] brand-accent font-black tracking-widest uppercase mb-4 text-left border-b brand-divider pb-2 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" /> RIGHT HAND PALETTE
             </div>
             <div className="grid grid-cols-5 gap-2">
                {steps.slice(5, 10).map(f => (
                   <div key={f} className="brand-tile flex flex-col items-center p-2">
                      <span className="text-[7px] brand-eyebrow font-bold mb-1 truncate w-full uppercase">{f.replace('Right ', '')}</span>
                      <span className="text-sm font-black brand-heading leading-none">{formatSizeDisplay(results[f]?.size, { compact: true })}</span>
                      <span className="text-[7px] brand-accent font-black mt-1 leading-none">{results[f]?.mm}mm</span>
                   </div>
                ))}
             </div>
          </div>
       </div>

       <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
             onClick={() => goToShot(1)}
             className="brand-secondary w-full py-5 font-black rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-xs tracking-widest uppercase mb-1"
          >
             <ChevronLeft className="w-4 h-4" /> EDIT MEASUREMENTS
          </button>

          <button 
             onClick={() => {
                const text = steps.map(f => `${f}: ${formatSizeDisplay(results[f]?.size)} (${results[f]?.mm}mm)`).join('\n');
                navigator.clipboard.writeText(`NAILS BY LIZ SIZING REPORT:\n${text}`);
                alert("Nail report copied to clipboard.");
             }}
             className="brand-secondary w-full py-5 font-black rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-xs tracking-widest uppercase mb-1"
          >
             <ChevronRight className="w-4 h-4" /> COPY TEXT REPORT
          </button>
          
          <button onClick={() => setCurrentStep('welcome')} className="brand-primary w-full py-5 font-black rounded-2xl shadow-2xl transition-all active:scale-95 text-lg uppercase">START NEW SESSION</button>
       </div>
    </div>
  )

  if (currentStep === 'customerReview') return (
    <div className="brand-shell fixed inset-0 flex flex-col items-center p-6 sm:p-10 text-center overflow-y-auto">
       <BrandDecor />
       <div className="brand-wordmark-small text-5xl mb-1 mt-4">Nails By Liz</div>
       <h2 className="text-2xl font-black brand-heading mb-2 uppercase">Saved Nail Sizes</h2>
       <p className="brand-eyebrow mb-6 text-[10px] font-black tracking-widest uppercase">{customerEmail}</p>

       {customerPortalStatus.text && (
          <div className={`w-full max-w-md mb-5 rounded-2xl border px-4 py-3 text-[10px] font-black tracking-widest uppercase ${customerPortalStatusClass}`}>
             {customerPortalStatus.text}
          </div>
       )}

       <div className="w-full max-w-md flex flex-col gap-5 mb-8">
          {customerSessions.length ? customerSessions.map(session => (
             <section key={session.session_id} className="brand-panel p-5 text-left">
                <div className="flex items-start justify-between gap-3 mb-4 border-b brand-divider pb-3">
                   <div>
                      <p className="text-[9px] brand-eyebrow font-black tracking-widest uppercase">{session.status || 'draft'} set</p>
                      <h3 className="text-sm font-black brand-heading">{formatCustomerDate(session.updated_at || session.created_at)}</h3>
                   </div>
                   <span className="brand-chip-active rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest">
                      {session.measurements?.length || 0}/10
                   </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                   {(session.measurements || []).map(measurement => (
                      <div key={measurement.id || `${session.session_id}-${measurement.finger_name}`} className="brand-tile p-3">
                         <div className="text-[8px] brand-eyebrow font-black uppercase tracking-widest truncate">{measurement.finger_name}</div>
                         <div className="text-lg font-black brand-heading leading-none mt-1">{formatSizeDisplay(measurement.nail_size, { compact: true })}</div>
                         <div className="text-[9px] brand-accent font-black">{measurement.measurement_mm}mm</div>
                      </div>
                   ))}
                </div>
             </section>
          )) : (
             <div className="brand-panel p-6 text-center text-[10px] brand-eyebrow font-black uppercase tracking-widest">
                No saved sessions found
             </div>
          )}
       </div>

       <div className="flex flex-col gap-3 w-full max-w-md">
          <button
             onClick={startWizard}
             disabled={systemBooting}
             className="brand-primary w-full py-5 font-black rounded-2xl shadow-2xl transition-all active:scale-95 text-sm uppercase flex items-center justify-center gap-2"
          >
             <RefreshCcw className="w-4 h-4" /> REDO NAIL SIZING
          </button>
          <button
             onClick={() => setCurrentStep('welcome')}
             className="brand-secondary w-full py-4 font-black rounded-2xl transition-all active:scale-95 text-xs uppercase"
          >
             BACK
          </button>
       </div>
    </div>
  )

  if (currentStep === 'welcome') return (
    <div className="welcome-screen brand-shell fixed inset-0 flex flex-col items-center justify-start sm:justify-center p-6 sm:p-12 overflow-y-auto overflow-x-hidden">
       <BrandDecor />
       <div className="welcome-icon brand-icon-card relative z-10 w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mb-6 sm:mb-8 shadow-inner">
          <Sparkles className="w-10 h-10 brand-accent" />
       </div>
       <h1 className="welcome-logo brand-logo mb-3">Nails By Liz</h1>
       <p className="welcome-tagline brand-eyebrow font-bold tracking-widest text-[10px] uppercase mb-6 sm:mb-10 opacity-80 text-center">Professional Nail Art Services</p>
       
       <div className="welcome-measure-list brand-panel hidden sm:block w-full max-w-[300px] sm:max-w-sm p-5 sm:p-8 mb-8">
          <div className="flex items-center gap-4 mb-4">
             <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: BRAND_GUIDE.coin }} />
             <span className="text-xs brand-heading font-bold uppercase tracking-widest">Measure all 10 nails</span>
          </div>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-3">
             {steps.map(s => (
                <li key={s} className="flex items-center gap-2 brand-eyebrow font-black text-[9px] uppercase tracking-widest leading-none">
                   <ChevronRight className="w-3 h-3 brand-accent shrink-0" /> {s.replace('Left ', 'L-').replace('Right ', 'R-')}
                </li>
             ))}
          </ul>
       </div>

       <div className="w-full max-w-[300px] sm:max-w-sm mb-5">
          <label className="block text-[10px] brand-eyebrow font-black tracking-widest uppercase mb-2">CUSTOMER EMAIL</label>
          <div className="relative">
             <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 brand-accent" />
             <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="customer@email.com"
                className="brand-input w-full h-14 border rounded-2xl pl-11 pr-4 text-sm font-bold outline-none"
                autoComplete="email"
             />
          </div>
       </div>

       <div className="w-full max-w-[300px] sm:max-w-sm mb-5">
          <label className="block text-[10px] brand-eyebrow font-black tracking-widest uppercase mb-2">ACCOUNT PASSWORD</label>
          <div className="relative">
             <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 brand-accent" />
             <input
                type="password"
                value={customerPassword}
                onChange={(event) => setCustomerPassword(event.target.value)}
                placeholder="create or enter password"
                className="brand-input w-full h-14 border rounded-2xl pl-11 pr-4 text-sm font-bold outline-none"
                autoComplete="current-password"
             />
          </div>
       </div>

       <div className="brand-panel w-full max-w-[300px] sm:max-w-sm p-4 mb-5">
          <div className="grid grid-cols-1 gap-3">
             <label className="block">
                <span className="block text-[9px] brand-eyebrow font-black tracking-widest uppercase mb-2">Nail set / manufacturer</span>
                <input
                   value={fitContext.manufacturer}
                   onChange={(event) => updateFitContext('manufacturer', event.target.value)}
                   className="brand-input w-full h-11 border rounded-xl px-3 text-xs font-bold outline-none"
                   placeholder="Nails By Liz default"
                />
             </label>
             <div className="grid grid-cols-2 gap-3">
                <label className="block">
                   <span className="block text-[9px] brand-eyebrow font-black tracking-widest uppercase mb-2">Fit</span>
                   <select
                      value={fitContext.productProfile}
                      onChange={(event) => updateFitContext('productProfile', event.target.value)}
                      className="brand-input brand-select w-full h-11 border rounded-xl px-3 text-xs font-bold outline-none"
                   >
                      {NAIL_FIT_PROFILES.map(profile => (
                         <option key={profile.key} value={profile.key}>{profile.label}</option>
                      ))}
                   </select>
                </label>
                <label className="block">
                   <span className="block text-[9px] brand-eyebrow font-black tracking-widest uppercase mb-2">Nail bed</span>
                   <select
                      value={fitContext.nailBedCurve}
                      onChange={(event) => updateFitContext('nailBedCurve', event.target.value)}
                      className="brand-input brand-select w-full h-11 border rounded-xl px-3 text-xs font-bold outline-none"
                   >
                      {NAIL_BED_CURVES.map(curve => (
                         <option key={curve.key} value={curve.key}>{curve.label}</option>
                      ))}
                   </select>
                </label>
             </div>
          </div>
       </div>

       {customerPortalStatus.text && currentStep === 'welcome' && (
          <div className={`w-full max-w-[300px] sm:max-w-sm mb-5 rounded-2xl border px-4 py-3 text-[10px] font-black tracking-widest uppercase ${customerPortalStatusClass}`}>
             {customerPortalStatus.text}
          </div>
       )}
       
       <button 
          onClick={startWizard}
          disabled={systemBooting}
          className={`brand-primary w-full max-w-[300px] sm:max-w-sm py-6 rounded-3xl font-black text-xl shadow-2xl transition-all active:scale-95 ${systemBooting ? 'grayscale' : ''}`}
       >
          {systemBooting ? 'GETTING CAMERA READY...' : 'CREATE ACCOUNT & START'}
       </button>

       <button
          onClick={loadCustomerPortal}
          disabled={systemBooting || customerPortalStatus.type === 'loading'}
          className="brand-secondary mt-3 w-full max-w-[300px] sm:max-w-sm py-4 rounded-2xl font-black text-xs tracking-widest uppercase flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
       >
          <RefreshCcw className="w-4 h-4" /> CHECK SAVED SIZES
       </button>
    </div>
  )

  return (
    <div className="live-camera-shell brand-camera-shell fixed inset-0 flex flex-col font-sans overflow-hidden select-none">
       {/* SHUTTER FLASH LAYER */}
       {shutterFlash && <div className="absolute inset-0 bg-white z-[100] animate-out fade-out duration-150" />}
       {topNavigationControls}

       {assistFrame && quarter && nail && radiusHandle && (
          <div className="brand-assist-shell absolute inset-0 z-[90] flex flex-col font-sans overflow-hidden">
             <div className="brand-assist-header px-5 pt-20 pb-4 border-b flex items-center justify-between gap-4">
                <div className="min-w-0">
                   <span className="text-[10px] brand-eyebrow font-black tracking-[0.2em] uppercase opacity-80">ASSIST {shotNumber}/10</span>
                   <h3 className="text-xl font-black brand-heading leading-none uppercase truncate">{steps[shotNumber-1]}</h3>
                   <span className={`mt-2 inline-flex px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${assistAiClass}`}>
                      {assistAi.label}
                   </span>
                   {assistQuality && (
                      <span className={`ml-2 mt-2 inline-flex px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${
                         assistQuality.status === 'good' ? 'brand-chip-active' : assistQuality.status === 'retake' ? 'brand-status-error' : 'brand-chip'
                      }`}>
                         {assistQuality.label} {assistQuality.score}
                      </span>
                   )}
                </div>
                <div className="text-right shrink-0">
                   <div className="text-[10px] brand-eyebrow font-black tracking-widest uppercase">SIZE</div>
                   <div className="brand-measure-readout text-3xl font-black leading-none">{formatSizeDisplay(assistMeasurement?.size, { compact: true })}</div>
                   <div className="text-[10px] brand-eyebrow font-black">{assistMeasurement?.mm || '0.00'}mm</div>
                   {assistMeasurement?.adjustedMM && (
                      <div className="text-[9px] brand-accent font-black">{assistMeasurement.adjustedMM}mm fit</div>
                   )}
                </div>
             </div>

             <div className="brand-assist-stage flex-1 min-h-0 p-3 flex items-center justify-center">
                <div
                   ref={assistSurfaceRef}
                   className="brand-assist-surface relative max-w-3xl overflow-hidden border bg-black touch-none"
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

                      <circle cx={quarter.x} cy={quarter.y} r={quarter.r} fill="rgba(201,165,106,0.06)" stroke={BRAND_GUIDE.coin} strokeWidth="2.5" strokeDasharray="12 10" filter="url(#assistGlow)" />
                      <line x1={quarter.x - 10} y1={quarter.y} x2={quarter.x + 10} y2={quarter.y} stroke={BRAND_GUIDE.coin} strokeWidth="2" />
                      <line x1={quarter.x} y1={quarter.y - 10} x2={quarter.x} y2={quarter.y + 10} stroke={BRAND_GUIDE.coin} strokeWidth="2" />

                      <line x1={nail.left.x} y1={nail.left.y} x2={nail.right.x} y2={nail.right.y} stroke={BRAND_GUIDE.nail} strokeWidth="5" strokeLinecap="round" opacity="0.28" filter="url(#assistGlow)" />
                      <line x1={nail.left.x} y1={nail.left.y} x2={nail.right.x} y2={nail.right.y} stroke={BRAND_GUIDE.nailAccent} strokeWidth="2.25" strokeLinecap="round" strokeDasharray="7 6" />

                      {renderAssistHandle('quarter', quarter.x, quarter.y, BRAND_GUIDE.coin)}
                      {renderAssistHandle('quarterRadius', radiusHandle.x, radiusHandle.y, BRAND_GUIDE.coinRadius)}
                      {renderNailEdgeHandle('nailLeft', nail.left.x, nail.left.y, BRAND_GUIDE.nail)}
                      {renderNailEdgeHandle('nailRight', nail.right.x, nail.right.y, BRAND_GUIDE.nail)}
                   </svg>
                </div>
             </div>

             <div className="brand-assist-footer p-5 border-t flex items-center gap-3">
                {assistQuality?.warnings?.length > 0 && (
                   <div className="absolute left-5 right-5 -top-12 rounded-2xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest brand-status-neutral">
                      {assistQuality.blocking[0] || assistQuality.warnings[0]}
                   </div>
                )}
                <button
                   aria-label="Reset assisted guides"
                   onClick={resetAssistGuide}
                   className="brand-secondary w-14 h-14 flex items-center justify-center rounded-2xl active:scale-95"
                >
                   <Scan className="w-6 h-6" />
                </button>

                <button
                   aria-label="Use assisted measurement"
                   onClick={applyAssistMeasurement}
                   disabled={!assistMeasurement}
                   className={`flex-1 h-16 rounded-2xl font-black tracking-widest text-xs uppercase flex items-center justify-center gap-2 active:scale-95 ${assistMeasurement ? 'brand-primary shadow-xl' : 'brand-secondary cursor-not-allowed opacity-50'}`}
                >
                   <CheckCircle2 className="w-5 h-5" /> USE MEASUREMENT
                </button>
             </div>
          </div>
       )}

       {/* HUD TOP: AI STATUS */}
       <div className="live-camera-hud absolute top-12 inset-x-0 flex flex-col items-center gap-3 z-30 pointer-events-none">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black tracking-widest uppercase shadow-xl ${isStableSignal ? 'brand-live-badge-on' : 'brand-live-badge'}`}>
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
                   className={`px-2 py-1 rounded-full border text-[8px] font-black tracking-widest ${detectionState[key] ? 'brand-live-badge-on' : 'brand-live-badge'}`}
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
             <div className="brand-live-badge-on px-5 py-1 rounded-full font-black text-[10px] shadow-xl animate-in fade-in slide-in-from-top-2 border-2">
                {formatSizeDisplay(measurement.size).toUpperCase()} READY
             </div>
          )}
       </div>

       {/* VISION LAYER */}
       <div className="live-vision-stage relative flex-1 overflow-hidden bg-black flex items-center justify-center">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-100 brightness-100 contrast-100 shadow-inner" playsInline muted />
          
          {/* Main Feed with High Contrast */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-t from-[#130704]/80 via-transparent to-[#130704]/80 pointer-events-none z-0" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 opacity-90" />

          {/* CRITICAL RECOVERY OVERLAY */}
          {isVisionCrashed && (
             <div className="brand-assist-shell absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-[200] animate-in fade-in duration-500">
                <div className="brand-icon-card w-20 h-20 flex items-center justify-center mb-6">
                   <ShieldAlert className="w-10 h-10 text-rose-500" />
                </div>
                <h2 className="text-2xl font-black brand-heading mb-2 uppercase">Camera Check Needed</h2>
                <p className="brand-eyebrow text-xs max-w-[280px] mb-8 font-medium leading-relaxed uppercase tracking-widest opacity-80">The guide system stalled. Refresh the page and allow camera access.</p>
                
                <div className="w-full max-w-sm bg-black border border-slate-800 rounded-2xl p-5 mb-10 text-left h-56 overflow-y-auto font-mono text-[10px] shadow-2xl relative">
                   <div className="absolute top-0 right-0 p-2 text-[8px] text-slate-700 font-black">V12 RELAY</div>
                   {debugLog.length > 0 ? debugLog.map((log, i) => (
                      <div key={i} className="text-amber-200/90 mb-1.5 leading-tight tracking-tight border-l border-amber-200/25 pl-2">{log}</div>
                   )) : <div className="text-stone-400 italic">Checking logs...</div>}
                </div>

                <button onClick={() => window.location.reload()} className="brand-primary w-full max-w-[280px] py-5 font-black rounded-2xl shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.2em]">REFRESH CAMERA</button>
             </div>
          )}
       </div>

       {/* CONTROL SURFACE */}
       <div className="live-control-layer portrait-hand brand-control-surface p-6 sm:p-10 border-t flex flex-col items-center justify-center gap-5 z-40">
          <div className="live-info-panel flex flex-col items-center justify-center gap-5 w-full max-w-sm">
             <div className="live-shot-info min-w-0 flex flex-col gap-1.5 text-center w-full max-w-sm">
                <span className="text-[10px] brand-eyebrow font-black tracking-[0.2em] uppercase opacity-80">{handSideLabel} {shotNumber}/10</span>
                <h3 className="text-xl sm:text-2xl font-black brand-heading leading-none uppercase truncate">{steps[shotNumber-1]}</h3>
                {currentSavedMeasurement && (
                   <span className="text-[9px] brand-accent font-black tracking-widest uppercase">SAVED {formatSizeDisplay(currentSavedMeasurement.size)} / {currentSavedMeasurement.mm}mm</span>
                )}
                {cameraProfile && (
                   <span className="text-[8px] brand-eyebrow font-black tracking-widest uppercase">
                      CAM {cameraProfile.width || videoDimsRef.current.w || '-'}x{cameraProfile.height || videoDimsRef.current.h || '-'} {cameraProfile.facingMode || cameraProfile.preferredFacingMode || ''}
                   </span>
                )}
                <span className="text-[8px] brand-accent font-black tracking-widest uppercase">
                   UPRIGHT GUIDE / QTR {activeLayoutMetrics.quarterDiameter}px
                </span>
                {allFingersMeasured && (
                   <button
                      type="button"
                      onClick={() => setCurrentStep('finish')}
                      className="brand-secondary mx-auto mt-1 px-4 py-2 rounded-xl text-[9px] font-black tracking-widest uppercase active:scale-95"
                   >
                      Review Report
                   </button>
                )}
             </div>
          </div>

          <div className="live-capture-dock flex items-center justify-center">
             {captureControl}
          </div>
       </div>
    </div>
  )
}

export default App
