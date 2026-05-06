import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { get } from 'node:https';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const OPENCV_URL = 'https://unpkg.com/@techstark/opencv-js@4.7.0-release.1/dist/opencv.js';
const opencvPath = resolve('public', 'opencv.js');
const minExpectedBytes = 1_000_000;

const hasUsableLocalCopy = () => {
  if (!existsSync(opencvPath)) return false;
  return statSync(opencvPath).size >= minExpectedBytes;
};

if (hasUsableLocalCopy()) {
  console.log('OpenCV asset ready:', opencvPath);
  process.exit(0);
}

mkdirSync(dirname(opencvPath), { recursive: true });
console.log('Downloading OpenCV asset...');

await new Promise((resolveDownload, rejectDownload) => {
  const request = get(
    OPENCV_URL,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
    async (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        rejectDownload(new Error(`OpenCV download failed with HTTP ${response.statusCode}`));
        return;
      }

      try {
        await pipeline(response, createWriteStream(opencvPath));
        resolveDownload();
      } catch (error) {
        rejectDownload(error);
      }
    },
  );

  request.on('error', rejectDownload);
});

if (!hasUsableLocalCopy()) {
  throw new Error('OpenCV asset is missing or unexpectedly small after download.');
}

console.log('OpenCV asset downloaded:', opencvPath);
