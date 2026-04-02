import { useState, useEffect } from 'react';

/**
 * useOpenCV - Hook to manage OpenCV.js lifecycle
 * @returns {object} - { ready, error, cv }
 */
const useOpenCV = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [cv, setCv] = useState(null);

  useEffect(() => {
    const checkCV = () => {
      if (window.cv && window.cv.Mat) {
        // OpenCV is already loaded or initialized
        setCv(window.cv);
        setReady(true);
        return true;
      }
      return false;
    };

    if (checkCV()) return;

    // Listen for OpenCV's own 'onRuntimeInitialized' callback
    // Note: We injected the script in index.html with 'async'
    window.Module = {
      onRuntimeInitialized: () => {
        console.log('OpenCV.js Runtime Initialized');
        setCv(window.cv);
        setReady(true);
      }
    };

    // Fallback polling if the event is missed or for already loaded scripts
    const interval = setInterval(() => {
      if (checkCV()) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return { ready, error, cv };
};

export default useOpenCV;
