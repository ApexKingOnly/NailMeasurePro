# NailMeasurePro AI Model Setup

## Goal

Use AI to suggest the quarter circle and nail-width guide on a frozen camera frame. The app should stay fast and reliable by keeping manual guide adjustment as the fallback.

## Current Integration

- Frontend calls `POST /api/vision-detect` after the user taps the assist/scan button.
- The Vercel API route sends the frozen frame to Roboflow when model env vars are configured.
- The API returns guide geometry in the same coordinate space as the frozen frame:
  - `guide.quarter`: `{ x, y, r }`
  - `guide.nail.left`: `{ x, y }`
  - `guide.nail.right`: `{ x, y }`
- If no model is configured, the endpoint returns `configured: false` and the app falls back to manual guides.

## Vercel Env Vars

Set these in Vercel Project Settings, or with `vercel env add`.

```bash
ROBOFLOW_API_KEY=your_key_here

# Use one combined model if it detects both nails and quarters.
ROBOFLOW_MODEL_ID=workspace-project/version

# Or use separate models.
ROBOFLOW_NAIL_MODEL_ID=workspace-nail-project/version
ROBOFLOW_QUARTER_MODEL_ID=workspace-quarter-project/version

# Optional tuning.
ROBOFLOW_CONFIDENCE=35
ROBOFLOW_OVERLAP=30
```

Do not expose `ROBOFLOW_API_KEY` to Vite client env vars. Keep it server-side only.

## Suggested Training Path

1. Start with public-safe sample images only.
2. Test public nail/quarter datasets and models:
   - Roboflow Universe fingernail segmentation datasets/models.
   - Roboflow US coins/quarter detection datasets/models.
   - Kaggle Nails Segmentation dataset, after checking license.
   - Hugging Face nail segmentation models, after checking license and conversion needs.
3. Fine-tune with NailMeasurePro frames captured from the actual app flow.
4. Label:
   - `nail` as a segmentation mask or tight object box around the visible nail plate.
   - `quarter` as a circle-like segmentation mask or tight object box.
5. Use the assisted guide corrections as high-quality labels.
6. Keep manual assist in production even after AI lands.

The app now has a human-in-the-loop capture endpoint for step 5. See `docs/TRAINING_DATA_SETUP.md` for the Supabase table, storage bucket, and Vercel env vars needed to store accepted guide corrections.

## Privacy Notes

Roboflow free/Public workspaces can publish datasets/models publicly. Use only demo or public-safe images there. Real customer hand/nail images should use a private paid workspace or a private training pipeline.

## Measurement Logic

The model does not directly predict nail size. It predicts geometry:

```text
quarter diameter pixels -> known 24.26mm scale
nail width pixels / quarter diameter pixels * 24.26 -> nail width mm
width mm + sizing buffer -> press-on nail size
```

AI improves the pixel geometry. The existing sizing math remains the source of truth.
