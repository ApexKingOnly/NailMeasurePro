import React from 'react';

const artPieces = [
  ['brand-card-art-brush', '/brand/card-brush-hand.png'],
  ['brand-card-art-bottle', '/brand/card-bottle-hand.png'],
  ['brand-card-art-nails-top', '/brand/circle-nails-top-right.png'],
  ['brand-card-art-nails-bottom', '/brand/circle-nails-bottom-left.png'],
];

export default function BrandDecor({ soft = false }) {
  return (
    <div className={`brand-card-art-layer ${soft ? 'brand-card-art-layer-soft' : ''}`} aria-hidden="true">
      {artPieces.map(([className, src]) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`brand-card-art ${className}`}
          draggable="false"
        />
      ))}
    </div>
  );
}
