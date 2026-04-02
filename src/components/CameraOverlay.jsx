import React, { useRef, useEffect, useState } from 'react'
import { Camera, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'

const CameraOverlay = ({ onCapture, isActive }) => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState('initializing') // initializing, red, green, capturing
  const [message, setMessage] = useState('Starting camera...')
  const [stabilityCounter, setStabilityCounter] = useState(0)

  useEffect(() => {
    if (isActive) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [isActive])

  const startCamera = async () => {
    try {
      setStatus('initializing')
      setMessage('Requesting Camera...')
      
      const constraints = {
        video: { 
          facingMode: { ideal: 'environment' }, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        },
        audio: false
      }
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(newStream)
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream
        // Critical for iOS: ensuring play() is called explicitly
        try {
          await videoRef.current.play()
        } catch (e) {
          console.error("Video play failed:", e)
        }
      }
      
      setStatus('red')
      setMessage('Detecting Dime...')
    } catch (err) {
      console.error("Camera error:", err)
      setStatus('error')
      setMessage(err.name === 'NotAllowedError' ? 'Access Denied: Grant Permission' : 'Camera Error: Check Permissions')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  // Vision Loop (Conceptual for now, will integrate OpenCV.js calls later)
  useEffect(() => {
    let frameId;
    const processFrame = () => {
      if (status !== 'error' && status !== 'capturing' && status !== 'analyzing' && videoRef.current && videoRef.current.readyState === 4) {
        // Pseudo-logic for "Green Light"
        const isDimeDetected = true; 
        const dimeWidth = 200; 
        
        if (isDimeDetected && dimeWidth >= 150 && dimeWidth <= 300) {
          setStatus('green')
          setMessage('READY! TAKE THE PIC')
        } else {
          setStatus('red')
          setMessage(dimeWidth < 150 ? 'Move Closer' : dimeWidth > 300 ? 'Move Further' : 'Searching for Dime...')
        }
      }
      frameId = requestAnimationFrame(processFrame)
    }
    
    if (isActive && status !== 'capturing' && status !== 'analyzing') {
      frameId = requestAnimationFrame(processFrame)
    }
    return () => cancelAnimationFrame(frameId)
  }, [isActive, status, stabilityCounter])

  const handleCaptureClick = () => {
    if (status !== 'green' || status === 'analyzing') return
    
    setStatus('capturing')
    setMessage('Capturing...')

    const canvas = canvasRef.current
    const video = videoRef.current
    if (canvas && video) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg')
      
      // Verification Step
      setTimeout(() => {
        setStatus('analyzing')
        setMessage('Vision Guard: Analyzing quality...')
        
        // Simulating quality check
        setTimeout(() => {
          onCapture(dataUrl)
          setStatus('green')
        }, 1200)
      }, 500)
    }
  }

  return (
    <div className="relative w-full aspect-[3/4] rounded-[2.5rem] overflow-hidden bg-slate-900 border-2 border-white/5 shadow-2xl transition-all">
      {/* Background Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      
      {/* Error / Manual Start State */}
      {(status === 'error' || status === 'initializing') && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 text-center px-8">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
            <Camera className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Camera Access Required</h3>
          <p className="text-slate-400 text-sm mb-8">{message}</p>
          <button 
            onClick={startCamera}
            className="w-full py-4 px-6 bg-emerald-500 text-slate-950 font-bold rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
          >
            Allow Camera
          </button>
        </div>
      )}
      
      {/* High-Precision HUD & Placement Overlays */}
      <div className="absolute inset-0 pointer-events-none">
        
        {/* Dime Placement Target */}
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`w-36 h-36 rounded-full border-4 transition-all duration-500 flex flex-col items-center justify-center ${
            status === 'green' ? 'border-emerald-500 scale-110 green-glow' : 'border-white/30 bg-white/5'
          }`}>
             <div className="absolute -top-8 px-3 py-1 bg-slate-900 border border-white/10 rounded-full">
               <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap">Dime Target</span>
             </div>
             {status !== 'green' && <div className="w-2 h-2 rounded-full bg-white/20 animate-ping" />}
          </div>
        </div>

        {/* Finger Placement Target */}
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 translate-y-24">
           <div className={`w-32 h-52 border-2 border-dashed rounded-3xl transition-all duration-500 flex flex-col items-center justify-start pt-6 ${
             status === 'green' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/20'
           }`}>
             <div className="px-3 py-1 bg-slate-900 border border-white/10 rounded-full">
               <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap">Finger Zone</span>
             </div>
           </div>
        </div>

        {/* Orientation Hint */}
        <p className="absolute top-32 w-full text-center text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] opacity-40">
          Align Flat on Surface
        </p>
      </div>

      {/* Top Banner (Status) */}
      <div className={`absolute top-6 inset-x-6 py-3 px-6 rounded-2xl flex items-center gap-3 glass-panel border transition-all duration-500 ${
        status === 'green' ? 'border-emerald-500 bg-emerald-500/10' : 
        status === 'red' ? 'border-amber-500 bg-amber-500/10' : 'border-white/5'
      }`}>
        {status === 'green' ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-pulse" />
        ) : (
          <AlertCircle className={`w-5 h-5 ${status === 'red' ? 'text-amber-500' : 'text-slate-500'}`} />
        )}
        <span className={`text-sm font-bold tracking-wide uppercase ${
          status === 'green' ? 'text-emerald-500' : 
          status === 'red' ? 'text-amber-500' : 'text-slate-400'
        }`}>
          {message}
        </span>
      </div>

      {/* Hidden Capture Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Manual Capture HUD (Bottom) */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full px-8 flex flex-col items-center gap-6">
        <div className="flex items-center justify-center gap-8">
          {/* Main Capture Button */}
          <button 
            onClick={handleCaptureClick}
            disabled={status !== 'green'}
            className={`group relative p-6 rounded-full transition-all transform active:scale-90 ${
              status === 'green' 
                ? 'bg-emerald-500 scale-110 shadow-2xl shadow-emerald-500/50' 
                : 'bg-slate-800 opacity-40 cursor-not-allowed'
            }`}
          >
            {status === 'green' && (
              <div className="absolute -inset-2 bg-emerald-500 rounded-full animate-ping opacity-20" />
            )}
            <Camera className={`w-8 h-8 ${status === 'green' ? 'text-slate-950' : 'text-slate-500'}`} />
          </button>
        </div>

        {/* Reset Button */}
        <button 
          onClick={startCamera}
          className="p-3 rounded-full bg-slate-950/50 backdrop-blur-md border border-white/10 text-white hover:bg-slate-800 transition-all pointer-events-auto"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Analyzing Overlay */}
      {status === 'analyzing' && (
        <div className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
           <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
           <p className="text-emerald-500 font-black uppercase tracking-[0.2em] text-xs">Analyzing Scan...</p>
        </div>
      )}

      {/* Version Watermark (For Cache Verification) */}
      <div className="absolute bottom-2 left-4 opacity-20 pointer-events-none">
        <span className="text-[8px] text-white font-bold uppercase tracking-widest">Manual Mode v1.1</span>
      </div>
    </div>
  )
}

export default CameraOverlay
