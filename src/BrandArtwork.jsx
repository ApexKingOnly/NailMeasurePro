import React from 'react';

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
};

const nailProps = {
  fill: 'var(--liz-blush-soft)',
  stroke: 'currentColor',
  strokeWidth: 4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
};

function BottleHand() {
  return (
    <svg viewBox="0 0 420 360" role="img" aria-label="">
      <g opacity="0.95">
        <path {...strokeProps} d="M18 349c36-44 54-90 66-142 7-31 19-56 42-72 21-15 43-14 55 1 10 13 7 34-7 54" />
        <path {...strokeProps} d="M96 230c38-55 61-85 76-111 10-17 28-19 41-8 14 13 13 31 0 54l-53 97" />
        <path {...strokeProps} d="M151 272c28-54 54-103 74-145 8-17 27-23 43-12 16 11 17 32 6 53l-55 109" />
        <path {...strokeProps} d="M212 282c22-43 44-80 62-116 9-17 27-20 41-9 15 12 13 31 2 51l-43 83" />
        <path {...strokeProps} d="M268 297c17-29 31-56 45-78 9-14 26-15 37-6 12 11 11 28 1 43-18 29-41 67-72 88" />
        <path {...strokeProps} d="M67 344c41 9 94 8 148 0 42-7 78-20 111-45" />
        <path {...strokeProps} d="M98 210c21 36 48 63 89 80 27 11 62 13 94 6" />

        <path {...nailProps} d="M104 124c10-33 20-57 31-68 8 17 6 42-5 70-8 20-16 28-26-2Z" />
        <path {...nailProps} d="M197 103c16-33 31-52 46-58 4 18-3 42-19 69-12 19-23 26-27-11Z" />
        <path {...nailProps} d="M258 118c18-25 35-38 50-40 1 16-9 34-30 56-15 16-24 18-20-16Z" />
        <path {...nailProps} d="M318 204c15-17 30-24 42-21-2 13-13 27-31 40-13 9-20 7-11-19Z" />

        <g transform="rotate(23 192 184)">
          <rect x="162" y="111" width="74" height="126" rx="16" fill="rgba(255,248,238,0.48)" stroke="currentColor" strokeWidth="5" />
          <rect x="169" y="119" width="60" height="42" rx="8" fill="var(--liz-gold-light)" stroke="currentColor" strokeWidth="4" />
          <path {...strokeProps} d="M168 244c20 12 45 13 64 0" />
        </g>
      </g>
    </svg>
  );
}

function BrushHand() {
  return (
    <svg viewBox="0 0 430 310" role="img" aria-label="">
      <g opacity="0.95">
        <path {...strokeProps} d="M419 196c-48-9-82-37-111-78-25-35-53-58-91-70-34-10-67-5-84 15-14 17-11 39 6 51" />
        <path {...strokeProps} d="M282 55c-20 29-36 58-48 88-6 16-22 20-35 11-13-9-15-26-6-43l31-58" />
        <path {...strokeProps} d="M220 49c-27 22-49 47-67 74-10 15-27 17-39 6-11-11-10-28 2-42 18-22 42-41 72-59" />
        <path {...strokeProps} d="M167 79c-23 4-43 14-60 30-12 11-28 9-36-3-8-13-3-27 12-39 18-13 40-22 66-26" />
        <path {...strokeProps} d="M303 117c-20 19-42 28-67 27" />
        <path {...strokeProps} d="M327 128c-18 30-42 45-72 45" />

        <path {...nailProps} d="M130 61c-25 4-45 13-56 28 19 7 41 2 62-13 14-10 16-17-6-15Z" />
        <path {...nailProps} d="M189 28c-25 15-44 33-55 54 21 0 42-12 60-33 12-15 12-24-5-21Z" />
        <path {...nailProps} d="M237 40c-18 24-30 48-33 72 19-6 36-24 48-53 8-19 5-26-15-19Z" />
        <path {...nailProps} d="M152 111c-16 15-25 31-27 49 16-4 30-17 39-37 7-14 3-19-12-12Z" />

        <g transform="rotate(24 230 146)">
          <rect x="202" y="93" width="58" height="54" rx="8" fill="var(--liz-gold-light)" stroke="currentColor" strokeWidth="5" />
          <path {...strokeProps} d="M231 146v66" />
          <path {...strokeProps} d="M216 213h30" />
          <path {...strokeProps} d="M216 213l-7 43" />
          <path {...strokeProps} d="M246 213l7 43" />
        </g>

        <circle cx="257" cy="238" r="10" fill="var(--liz-gold)" />
        <path d="M288 242c13 22 19 37 19 48 0 13-9 20-19 20s-19-7-19-20c0-11 6-26 19-48Z" fill="var(--liz-gold)" opacity="0.82" />
      </g>
    </svg>
  );
}

export default function BrandDecor({ soft = false }) {
  return (
    <>
      <div className={`brand-artwork brand-artwork-brush ${soft ? 'brand-artwork-soft' : ''}`} aria-hidden="true">
        <BrushHand />
      </div>
      <div className={`brand-artwork brand-artwork-bottle ${soft ? 'brand-artwork-soft' : ''}`} aria-hidden="true">
        <BottleHand />
      </div>
    </>
  );
}
