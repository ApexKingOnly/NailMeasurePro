import assert from 'node:assert/strict';
import {
  DEFAULT_FIT_CONTEXT,
  SIZING_CHART,
  calculateMM,
  getFitAdjustmentMM,
  getNailSizeRecommendation,
  mmToNailSize,
} from '../src/utils/sizing.js';

const flatStandard = {
  manufacturer: 'Nails By Liz default',
  productProfile: 'standard',
  nailBedCurve: 'flat',
};

assert.deepEqual(
  SIZING_CHART.map(({ size, mm }) => [size, mm]),
  [
    ['0', 14],
    ['1', 13],
    ['2', 12],
    ['3', 11],
    ['4', 10.5],
    ['5', 10],
    ['6', 9.5],
    ['7', 9],
    ['8', 8.5],
    ['9', 8],
    ['10', 7.5],
  ],
  'uses the supplied Nails By Liz size chart',
);

assert.equal(getFitAdjustmentMM(DEFAULT_FIT_CONTEXT), 0, 'default medium fit must not hide a 1mm sizing bump');
assert.equal(mmToNailSize(9.0, flatStandard), '7');
assert.equal(mmToNailSize(8.5, flatStandard), '8');
assert.equal(mmToNailSize(8.0, flatStandard), '9');
assert.equal(mmToNailSize(7.5, flatStandard), '10');

const betweenEightNine = getNailSizeRecommendation(8.25, flatStandard);
assert.equal(betweenEightNine.size, '8-9');
assert.equal(betweenEightNine.recommendedSize, '8');
assert.equal(betweenEightNine.alternateSize, '9');
assert.equal(betweenEightNine.isBetween, true);

const exactEight = getNailSizeRecommendation(8.51, flatStandard);
assert.equal(exactEight.size, '8');
assert.equal(exactEight.isBetween, false);

const exactNine = getNailSizeRecommendation(8.02, flatStandard);
assert.equal(exactNine.size, '9');
assert.equal(exactNine.isBetween, false);

const betweenSevenEight = getNailSizeRecommendation(8.74, flatStandard);
assert.equal(betweenSevenEight.size, '7-8');
assert.equal(betweenSevenEight.recommendedSize, '7');
assert.equal(betweenSevenEight.alternateSize, '8');

const quarterPixels = 180;
const nailPixelsForSizeEight = 8.5 / (24.26 / quarterPixels);
assert.equal(calculateMM(nailPixelsForSizeEight, quarterPixels).toFixed(2), '8.50');
assert.equal(mmToNailSize(calculateMM(nailPixelsForSizeEight, quarterPixels), flatStandard), '8');

console.log('Sizing tests passed');
