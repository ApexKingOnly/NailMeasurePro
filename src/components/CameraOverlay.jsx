import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, AlertCircle, CheckCircle2, RotateCcw, Box, ArrowRight } from 'lucide-react'
import { useVisionAI } from '../hooks/useVisionAI'
import { detectDimeAndCalibrate } from '../utils/VisionEngine'

const CameraOverlay = ({ onCapture, mode }) => {
  const { isReady, error, detectHands } = useVisionAI()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('initializing') // initializing, prompt, scanning, green, capturing
  const [message, setMessage] = useState('Calibrating Vision AI...')
  const [stabilityCounter, setStabilityCounter] = useState(0)

  // Start Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setStatus('scanning')
        }
      } catch (err) {
        console.error('Camera Error:', err)
        setStatus('error')
        setMessage('Camera access denied. Please check settings.')
      }
    }
    startCamera()
  }, [])

  // The Vision Processing Loop
  const processFrame = useCallback(async () => {
    if (status === 'capturing' || !videoRef.current || !canvasRef.current || !isReady) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // 1. Detect Dime with OpenCV.js (Dime Scaler)
    let dime = null;
    if (window.cv) {
      const mat = window.cv.imread(canvas)
      dime = detectDimeAndCalibrate(window.cv, mat)
      
      if (dime) {
        ctx.beginPath()
        ctx.arc(dime.x, dime.y, dime.r, 0, 2 * Math.PI)
        ctx.strokeStyle = '#10b981'
        ctx.lineWidth = 4
        ctx.stroke()
        
        ctx.font = 'bold 12px Inter'
        ctx.fillStyle = '#10b981'
        ctx.fillText('FIXED SCALE [US DIME]', dime.x - 50, dime.y - dime.r - 10)
      }
      mat.delete()
    }

    // 2. Detect Hands with MediaPipe (AI Segmentation)
    const results = await detectHands(video)
    if (results && results.multiHandLandmarks) {
      // Draw minimal hand skeleton for status
      results.multiHandLandmarks.forEach(hand => {
        window.drawConnectors(ctx, hand, window.HAND_CONNECTIONS, { color: '#ffffff20', lineWidth: 1 })
      })
    }

    // 3. GREEN LIGHT LOGIC (NailScale AI Protocol)
    const dimeDetected = dime !== null;
    const handsDetected = results && results.multiHandLandmarks?.length > 0;
    const isOptimalDistance = dimeDetected && dime.r >= 40 && dime.r <= 80;

    if (dimeDetected && handsDetected && isOptimalDistance) {
      setStabilityCounter(prev => prev + 1)
      if (stabilityCounter > 30) { 
        setStatus('green')
        setMessage('READY! TAP BUTTON')
      } else {
        setMessage('Hold Still...')
      }
    } else {
      setStabilityCounter(0)
      setStatus('scanning')
      if (!dimeDetected) setMessage('Bring the US Dime into view')
      else if (!handsDetected) setMessage('Insert hand inside the box')
      else if (!isOptimalDistance) setMessage('Adjust distance (Too ' + (dime.r < 40 ? 'Far' : 'Close') + ')')
    }

    requestAnimationFrame(processFrame)
  }, [status, isReady, detectHands, stabilityCounter])

  useEffect(() => {
    if (status === 'scanning' || status === 'green') {
      const frameId = requestAnimationFrame(processFrame)
      return () => cancelAnimationFrame(frameId)
    }
  }, [status, processFrame])

  const handleManualCapture = () => {
     if (status !== 'green') return; // Enforce calibration
     
     setStatus('capturing')
     setMessage('Captured! Saving...')
     
     // 1s Delay before callback
     setTimeout(() => {
       const canvas = canvasRef.current
       onCapture(canvas.toDataURL('image/jpeg'))
       setStatus('scanning')
       setStabilityCounter(0)
     }, 1000)
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full hidden" width={1280} height={720} />

      {/* Real-time HUD Layer */}
      <div className="absolute inset-0">
        
        {/* Alignment Guide (NailScale AI 3-Shot Zones) */}
        {mode === 'left' || mode === 'right' ? (
          <div className="absolute inset-0 border-[60px] border-slate-950/60 pointer-events-none">
            <div className="w-full h-full border-2 border-dashed border-white/20 rounded-[2rem] relative">
              
              {/* Dime Zone */}
              <div className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-emerald-500/30 rounded-full flex items-center justify-center">
                <p className="text-[10px] text-emerald-500 font-black tracking-widest uppercase">Place Dime</p>
              </div>

              {/* Finger Zone */}
              <div className="absolute top-1/3 right-1/4 w-1/3 h-1/2 border-2 border-blue-500/30 rounded-3xl flex items-center justify-center">
                <p className="text-[10px] text-blue-500 font-black tracking-widest uppercase mb-auto mt-4 px-2 text-center italic">Insert 4 Fingers [Tips Only]</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 border-[60px] border-slate-950/60 pointer-events-none">
            <div className="w-full h-full border-2 border-dashed border-white/20 rounded-[2rem] flex flex-col items-center justify-center gap-12">
               <div className="w-48 h-32 border-2 border-blue-500/30 rounded-3xl flex items-center justify-center">
                 <p className="text-[10px] text-blue-500 font-black tracking-widest uppercase italic">Both Thumbs Here</p>
               </div>
               <div className="w-32 h-32 border-2 border-emerald-500/30 rounded-full flex items-center justify-center">
                 <p className="text-[10px] text-emerald-500 font-black tracking-widest uppercase">Place Dime</p>
               </div>
            </div>
          </div>
        )}

        {/* Global Status HUD */}
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[calc(100%-4rem)] px-6 py-4 glass-panel rounded-3xl border border-white/5 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 pointer-events-none">
           <div className={`p-2 rounded-2xl ${status === 'green' ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-slate-800'}`}>
             {status === 'green' ? <CheckCircle2 className="w-6 h-6 text-slate-950 animate-pulse" /> : <Box className="w-6 h-6 text-slate-400" />}
           </div>
           <div className="flex-1">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-0.5">NailScale AI Scan Mode</p>
              <h4 className={`text-sm font-bold tracking-tight uppercase ${status === 'green' ? 'text-emerald-400' : 'text-white'}`}>{message}</h4>
           </div>
        </div>

        {/* MANUAL CAPTURE BUTTON (NailScale AI PRO) */}
        <div className="absolute inset-x-0 bottom-32 flex justify-center">
          <button 
            onClick={handleManualCapture}
            className={`relative w-24 h-24 rounded-full border-4 transition-all duration-500 flex items-center justify-center group ${
              status === 'green' 
                ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.4)] scale-110' 
                : 'bg-slate-900/40 border-white/10 opacity-50 scale-100'
            }`}
          >
             <div className="absolute inset-0 bg-white/20 rounded-full scale-0 group-active:scale-100 transition-transform duration-300" />
             <Camera className={`w-10 h-10 ${status === 'green' ? 'text-slate-950' : 'text-slate-500'} transition-colors`} />
             
             {/* Progress Border (Only visible when tracking stability) */}
             {status === 'scanning' && stabilityCounter > 0 && (
                <div className="absolute inset-0 border-4 border-emerald-500 rounded-full transition-all duration-300" 
                     style={{ clipPath: `inset(${100 - (stabilityCounter * 3)}% 0 0 0)` }} />
             )}
          </button>
        </div>

      </div>

      {status === 'initializing' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center text-center px-12">
           <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6" />
           <h2 className="text-2xl font-black text-white italic mb-2 tracking-tight uppercase underline decoration-emerald-500 decoration-3">Initializing Vision AI</h2>
           <p className="text-xs text-slate-500 font-bold tracking-widest uppercase leading-relaxed">Loading MediaPipe Models & OpenCV.js Runtime...</p>
        </div>
      )}
    </div>
  )
}

export default CameraOverlay
