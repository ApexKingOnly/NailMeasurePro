# NailMeasure Pro 💅

A high-precision mobile web application for press-on nail sizing using OpenCV.js and real-time vision guidance.

## Core Features
- **Computer Vision Engine**: Automated US quarter detection (24.26mm) for pixel-to-metric calibration.
- **Green Light UX**: Real-time feedback loop ensures the user is at the perfect distance and stable before auto-capturing.
- **10-Finger Mapping**: Guided wizard to capture and identify sizes for all 10 fingers.
- **Admin Dashboard**: Secure order review interface with photo verification and sizing data.

## Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS
- **Icons**: Lucide React
- **Vision**: OpenCV.js (Circle Detection & Geometry)
- **Backend**: Supabase (Planned)

## Getting Started
1. **Clone & Install**:
   ```bash
   npm install
   ```
2. **Run Dev Server**:
   ```bash
   npm run dev
   ```
3. **Open on Mobile**:
   Ensure you use HTTPS or a local network tunnel (e.g., Ngrok) to access camera permissions.

## Vision Logic
- **Reference Object**: US quarter (24.26mm).
- **Calibration**: `Ratio = 24.26 / QuarterWidthPixels`.
- **Nail Measurement**: `NailWidthMM = NailWidthPixels * Ratio`.
- **Sizing**: Includes a 1.0mm buffer for nail curvature.
- **AI Guide Bridge**: Optional `/api/vision-detect` endpoint can call a Roboflow model to suggest quarter and nail guide geometry on frozen assist frames. See `docs/AI_MODEL_SETUP.md`.
- **Training Labels**: Accepted assisted measurements can be saved as human-corrected training examples through `/api/training-labels`. See `docs/TRAINING_DATA_SETUP.md`.
- **Customer/Admin Records**: Customer measurements can be saved by email and reviewed or edited in `/admin`. See `docs/CUSTOMER_ADMIN_SETUP.md`.

## Admin Features
Access the `/admin` route (mocked in the current demo) to view incoming orders and verify AI detections.
