const ROBOFLOW_API_URL = process.env.ROBOFLOW_API_URL || 'https://detect.roboflow.com';
const DEFAULT_CONFIDENCE = process.env.ROBOFLOW_CONFIDENCE || '35';
const DEFAULT_OVERLAP = process.env.ROBOFLOW_OVERLAP || '30';
const MAX_BASE64_LENGTH = 7_000_000;

const DEFAULT_QUARTER_RING = { x: 0.5, y: 0.35, r: 0.15 };
const DEFAULT_NAIL_BOX = { x: 0.275, y: 0.43625, w: 0.45, h: 0.4375 };

const parseModelIds = (value) => (
  String(value || '')
    .split(',')
    .map((modelId) => modelId.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
);

const unique = (items) => [...new Set(items)];

const parseRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const stripDataUrl = (image) => String(image || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

const classNameOf = (prediction) => String(
  prediction?.class ||
  prediction?.class_name ||
  prediction?.label ||
  prediction?.name ||
  ''
).toLowerCase();

const confidenceOf = (prediction) => {
  const confidence = Number(prediction?.confidence ?? prediction?.score ?? prediction?.probability ?? 0);
  return Number.isFinite(confidence) ? confidence : 0;
};

const getPayloadImageSize = (payload, fallback) => ({
  width: Number(payload?.image?.width || payload?.input?.width || fallback.width),
  height: Number(payload?.image?.height || payload?.input?.height || fallback.height),
});

const getPredictionBox = (prediction, sourceSize, targetSize) => {
  const points = prediction?.points || prediction?.polygon || prediction?.segmentation;
  let xMin;
  let yMin;
  let xMax;
  let yMax;

  if (Array.isArray(points) && points.length > 1) {
    const xs = points.map((point) => Number(point.x ?? point[0])).filter(Number.isFinite);
    const ys = points.map((point) => Number(point.y ?? point[1])).filter(Number.isFinite);
    if (xs.length && ys.length) {
      xMin = Math.min(...xs);
      xMax = Math.max(...xs);
      yMin = Math.min(...ys);
      yMax = Math.max(...ys);
    }
  }

  if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) {
    const rawWidth = Number(prediction?.width ?? prediction?.w ?? prediction?.bbox?.width ?? prediction?.bbox?.w);
    const rawHeight = Number(prediction?.height ?? prediction?.h ?? prediction?.bbox?.height ?? prediction?.bbox?.h);
    const centerX = Number(prediction?.x ?? prediction?.bbox?.x);
    const centerY = Number(prediction?.y ?? prediction?.bbox?.y);

    if ([rawWidth, rawHeight, centerX, centerY].every(Number.isFinite)) {
      xMin = centerX - rawWidth / 2;
      xMax = centerX + rawWidth / 2;
      yMin = centerY - rawHeight / 2;
      yMax = centerY + rawHeight / 2;
    }
  }

  if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) return null;

  const scaleX = targetSize.width / (sourceSize.width || targetSize.width || 1);
  const scaleY = targetSize.height / (sourceSize.height || targetSize.height || 1);

  return {
    xMin: xMin * scaleX,
    yMin: yMin * scaleY,
    xMax: xMax * scaleX,
    yMax: yMax * scaleY,
  };
};

const extractPredictions = (payload) => {
  const predictions = [];
  const seen = new Set();

  const collect = (node) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }

    const looksLikePrediction = (
      node.class ||
      node.class_name ||
      node.label ||
      Array.isArray(node.points) ||
      (Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y)) && Number.isFinite(Number(node.width ?? node.w)))
    );

    if (looksLikePrediction && !seen.has(node)) {
      seen.add(node);
      predictions.push(node);
    }

    if (Array.isArray(node.predictions)) {
      node.predictions.forEach((prediction) => {
        if (prediction && typeof prediction === 'object' && !seen.has(prediction)) {
          seen.add(prediction);
          predictions.push(prediction);
        }
      });
    }

    ['outputs', 'result', 'results', 'model_predictions', 'detections'].forEach((key) => collect(node[key]));
  };

  collect(payload);
  return predictions;
};

const postRoboflowModel = async ({ modelId, imageBase64, type, targetSize }) => {
  const params = new URLSearchParams({
    api_key: process.env.ROBOFLOW_API_KEY,
    format: 'json',
    confidence: DEFAULT_CONFIDENCE,
    overlap: DEFAULT_OVERLAP,
  });
  const url = `${ROBOFLOW_API_URL.replace(/\/+$/g, '')}/${modelId}?${params.toString()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: imageBase64,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Roboflow ${modelId} returned ${response.status}: ${message.slice(0, 180)}`);
  }

  const payload = await response.json();
  const sourceSize = getPayloadImageSize(payload, targetSize);
  const predictions = extractPredictions(payload)
    .map((prediction) => ({
      prediction,
      type,
      modelId,
      className: classNameOf(prediction),
      confidence: confidenceOf(prediction),
      box: getPredictionBox(prediction, sourceSize, targetSize),
    }))
    .filter((item) => item.box);

  return { modelId, type, predictions };
};

const centerOf = (box) => ({
  x: (box.xMin + box.xMax) / 2,
  y: (box.yMin + box.yMax) / 2,
});

const selectQuarter = (predictions, targetSize) => {
  const expected = {
    x: DEFAULT_QUARTER_RING.x * targetSize.width,
    y: DEFAULT_QUARTER_RING.y * targetSize.height,
  };
  const expectedRadius = DEFAULT_QUARTER_RING.r * targetSize.width;

  return predictions
    .filter((item) => item.type !== 'nail')
    .map((item) => {
      const center = centerOf(item.box);
      const boxWidth = item.box.xMax - item.box.xMin;
      const boxHeight = item.box.yMax - item.box.yMin;
      const radius = Math.max(8, (boxWidth + boxHeight) / 4);
      const classBonus = /quarter|coin|money/.test(item.className) ? 0.35 : 0;
      const distancePenalty = Math.hypot(center.x - expected.x, center.y - expected.y) / Math.max(expectedRadius, 1);
      return { ...item, center, radius, score: item.confidence + classBonus - distancePenalty * 0.2 };
    })
    .sort((a, b) => b.score - a.score)[0] || null;
};

const selectNail = (predictions, targetSize) => {
  const targetCenter = {
    x: (DEFAULT_NAIL_BOX.x + DEFAULT_NAIL_BOX.w / 2) * targetSize.width,
    y: (DEFAULT_NAIL_BOX.y + DEFAULT_NAIL_BOX.h / 2) * targetSize.height,
  };
  const targetScale = Math.max(DEFAULT_NAIL_BOX.w * targetSize.width, DEFAULT_NAIL_BOX.h * targetSize.height, 1);

  return predictions
    .filter((item) => item.type !== 'quarter')
    .map((item) => {
      const center = centerOf(item.box);
      const classBonus = /nail|fingernail/.test(item.className) ? 0.45 : 0;
      const distancePenalty = Math.hypot(center.x - targetCenter.x, center.y - targetCenter.y) / targetScale;
      return { ...item, center, score: item.confidence + classBonus - distancePenalty * 0.25 };
    })
    .sort((a, b) => b.score - a.score)[0] || null;
};

const buildGuide = ({ nail, quarter }) => {
  const guide = {};

  if (quarter) {
    guide.quarter = {
      x: quarter.center.x,
      y: quarter.center.y,
      r: quarter.radius,
      confidence: quarter.confidence,
      className: quarter.className,
      modelId: quarter.modelId,
    };
  }

  if (nail) {
    const y = nail.center.y;
    guide.nail = {
      left: { x: nail.box.xMin, y },
      right: { x: nail.box.xMax, y },
      confidence: nail.confidence,
      className: nail.className,
      modelId: nail.modelId,
    };
  }

  return guide;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST required' });
    return;
  }

  try {
    const body = parseRequestBody(req.body);
    const imageBase64 = stripDataUrl(body.image);
    const targetSize = {
      width: Number(body.width || 0),
      height: Number(body.height || 0),
    };

    if (!imageBase64 || imageBase64.length > MAX_BASE64_LENGTH || !targetSize.width || !targetSize.height) {
      res.status(400).json({ ok: false, error: 'Valid base64 image, width, and height are required' });
      return;
    }

    const genericModels = parseModelIds(process.env.ROBOFLOW_MODEL_ID);
    const nailModels = parseModelIds(process.env.ROBOFLOW_NAIL_MODEL_ID);
    const quarterModels = parseModelIds(process.env.ROBOFLOW_QUARTER_MODEL_ID);
    const modelJobs = [
      ...genericModels.map((modelId) => ({ modelId, type: 'combined' })),
      ...nailModels.map((modelId) => ({ modelId, type: 'nail' })),
      ...quarterModels.map((modelId) => ({ modelId, type: 'quarter' })),
    ];

    if (!process.env.ROBOFLOW_API_KEY || !modelJobs.length) {
      res.status(200).json({
        ok: false,
        configured: false,
        reason: 'Set ROBOFLOW_API_KEY and at least one ROBOFLOW_*_MODEL_ID env var to enable AI guide suggestions.',
      });
      return;
    }

    const uniqueJobs = unique(modelJobs.map((job) => `${job.type}:${job.modelId}`))
      .map((value) => {
        const [type, ...modelParts] = value.split(':');
        return { type, modelId: modelParts.join(':') };
      });

    const results = await Promise.all(uniqueJobs.map((job) => postRoboflowModel({
      ...job,
      imageBase64,
      targetSize,
    })));
    const predictions = results.flatMap((result) => result.predictions);
    const quarter = selectQuarter(predictions, targetSize);
    const nail = selectNail(predictions, targetSize);
    const guide = buildGuide({ nail, quarter });

    res.status(200).json({
      ok: Boolean(guide.quarter || guide.nail),
      configured: true,
      guide,
      detections: {
        quarter: quarter ? { confidence: quarter.confidence, className: quarter.className, modelId: quarter.modelId } : null,
        nail: nail ? { confidence: nail.confidence, className: nail.className, modelId: nail.modelId } : null,
      },
      predictionCount: predictions.length,
    });
  } catch (error) {
    res.status(502).json({ ok: false, configured: true, error: error.message || 'Vision inference failed' });
  }
}
