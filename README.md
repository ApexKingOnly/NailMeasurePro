# NailMeasure Pro 💅

A high-precision mobile web application for press-on nail sizing using OpenCV.js and real-time vision guidance.

## Core Features
- **Computer Vision Engine**: Automated US Dime detection (17.91mm) for pixel-to-metric calibration.
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
- **Reference Object**: US Dime (17.91mm).
- **Calibration**: `Ratio = 17.91 / DimeWidthPixels`.
- **Nail Measurement**: `NailWidthMM = NailWidthPixels * Ratio`.
- **Sizing**: Includes a 1.0mm buffer for nail curvature.

## Admin Features
Access the `/admin` route (mocked in the current demo) to view incoming orders and verify AI detections.
