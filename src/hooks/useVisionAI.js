import { useState, useEffect, useCallback, useRef } from 'react'

export const useVisionAI = () => {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const handsRef = useRef(null)

  useEffect(() => {
    // 1. Initialize OpenCV.js
    const checkCV = setInterval(() => {
      if (window.cv && window.cv.getBuildInformation) {
        clearInterval(checkCV)
        initMediaPipe()
      }
    }, 100)

    // 2. Initialize MediaPipe Hands
    const initMediaPipe = async () => {
      try {
        if (!window.Hands) {
          throw new Error('MediaPipe Hands not found in window')
        }
        
        handsRef.current = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        })

        handsRef.current.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7
        })

        await handsRef.current.initialize()
        setIsReady(true)
      } catch (err) {
        console.error('Vision AI Init Error:', err)
        setError(err.message)
      }
    }

    return () => clearInterval(checkCV)
  }, [])

  const detectHands = useCallback(async (videoElement) => {
    if (!handsRef.current || !isReady) return null
    
    return new Promise((resolve) => {
      handsRef.current.onResults((results) => {
        resolve(results)
      })
      handsRef.current.send({ image: videoElement })
    })
  }, [isReady])

  return { isReady, error, detectHands }
}
