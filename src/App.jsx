import React, { useState, useEffect, useRef } from 'react'
import { Camera, ShieldAlert, Scan, X, RotateCcw, CheckCircle2, ChevronRight, Info } from 'lucide-react'
import { getFullSizing } from './utils/sizing'

// Finger Landmarks for High Precision 10-Finger Mapping
const tip_map = { 1: 8, 2: 12, 3: 16, 4: 20 }; // Index, Middle, Ring, Pinky
const dip_map = { 1: 7, 2: 11, 3: 15, 4: 19 }; // Associated DIP joints

function App() {
  // Navigation State
  const [currentStep, setCurrentStep] = useState('welcome') // welcome, wizard, finish
  const [shotNumber, setShotNumber] = useState(1) // 1: L4, 2: R4, 3: LT, 4: RT
  const steps = ["Left 4 Fingers", "Right 4 Fingers", "Left Thumb", "Right Thumb"]
  
  // Vision Health & Stability
  const [systemBooting, setSystemBooting] = useState(true)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isVisionReady, setIsVisionReady] = useState(false)
  const [isVisionCrashed, setIsVisionCrashed] = useState(false)
  const [librariesLoaded, setLibrariesLoaded] = useState(false)
  const [visionHeartbeat, setVisionHeartbeat] = useState(Date.now())
  const [message, setMessage] = useState('System Booting...')
  const [isStableSignal, setIsStableSignal] = useState(false)
  
  // Results & Temporary Data
  const [results, setResults] = useState({})
  const [measurement, setMeasurement] = useState(null)
  
  // Refs
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const handsRef = useRef(null)
  const frameIdRef = useRef(null)

  // Launch Protocol
  const startWizard = () => {
    if (window.innerWidth <= 10) {
       alert("Viewport too small/stalled. Please resize or refresh.");
       return; 
    }
    setShotNumber(1)
    setCurrentStep('wizard')
    setIsCameraReady(false)
    setIsVisionReady(false)
    setIsVisionCrashed(false)
  }

  // Phase 0: Environment Lockdown (2s)
  useEffect(() => {
     const timer = setTimeout(() => setSystemBooting(false), 2000);
     return () => clearTimeout(timer);
  }, []);

  // Phase 1: Hardware Activation (10s Polling)
  useEffect(() => {
    if (currentStep !== 'wizard') return;

    let pollCount = 0;
    const maxPolls = 100; // 10 seconds

    const checkDimensions = () => {
       if (videoRef.current?.videoWidth > 0) {
          setIsCameraReady(true);
       } else if (pollCount < maxPolls && currentStep === 'wizard') {
          pollCount++;
          setTimeout(checkDimensions, 100);
       } else {
          setMessage('Camera Hardware Timeout');
       }
    };

    const startCamera = async () => {
       try {
          setMessage('Activating Hardware...');
          const stream = await navigator.mediaDevices.getUserMedia({
             video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          if (videoRef.current) {
             videoRef.current.srcObject = stream;
             videoRef.current.onloadedmetadata = () => {
                videoRef.current.play();
                checkDimensions();
             }
          }
       } catch (err) {
          // Fallback to front camera if environment fails
          try {
             const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
             if (videoRef.current) {
                videoRef.current.srcObject = fallbackStream;
                videoRef.current.onloadedmetadata = () => { videoRef.current.play(); checkDimensions(); }
             }
          } catch (e) {
             setMessage('Camera Permission Required');
          }
       }
    };
    startCamera();

    return () => {
       if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
       }
    };
  }, [currentStep]);

  // Stability & Debug Layer (v11 Precision HUD)
  const [debugLog, setDebugLog] = useState([])
  const logToHUD = (txt) => {
     console.log(`[V11-PRECISION]: ${txt}`);
     setDebugLog(prev => [...prev.slice(-15), `> ${new Date().toLocaleTimeString().split(' ')[0]} | ${txt}`]);
  }

  // Phase 2: AI Hub Initialization (V11 Precision Architecture)
  useEffect(() => {
    if (!isCameraReady || currentStep !== 'wizard') return;

    const loadScript = (url, id) => new Promise((resolve, reject) => {
       if (document.getElementById(id)) return resolve();
       logToHUD(`Syncing ${id}...`);
       const script = document.createElement('script');
       script.src = url;
       script.id = id;
       script.crossOrigin = 'anonymous';
       script.onload = resolve;
       script.onerror = () => reject(new Error(`Failed ${id}`));
       document.head.appendChild(script);
    });

    const initAI = async () => {
       try {
          if (!librariesLoaded) {
             setLibrariesLoaded(true);
             logToHUD("Powering Surgical Infrastructure...");
             // Local assets served from /public/ during build (v9 fix)
             await loadScript('/opencv.js', 'cv-atomic');
          }

          logToHUD("Native script handshake successful.");
          const readiness = new Promise((resolve, reject) => {
             const timeout = setTimeout(() => reject(new Error("Vision Core Hub Timeout")), 15000);
             const check = () => {
                if (window.cv && window.cv.Mat) {
                   clearTimeout(timeout);
                   resolve();
                } else {
                   setTimeout(check, 300);
                }
             };
             check();
          });

          await readiness;
          logToHUD("Precision Space READY.");

          logToHUD("V11.1: Summoning Vision Core...");
          const visionLib = await import("@mediapipe/tasks-vision");
          const { FilesetResolver, HandLandmarker } = visionLib;
          
          if (!FilesetResolver || !HandLandmarker) {
             throw new Error("V11.1: Vision Modules Undefined");
          }

          // V11.1: TOTAL SAME-ORIGIN ISOLATION
          logToHUD("V11.1: Virtualizing Local Brain...");
          const vision = await FilesetResolver.forVisionTasks("/wasm");

          // Atomic Handlandmarker Initialization (V11.1-SURGICAL)
          try {
             logToHUD("Initializing V11.1 Local Kernel...");
             handsRef.current = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                   modelAssetPath: `/hand_landmarker.task`,
                   delegate: "GPU"
                },
                runningMode: "VIDEO", numHands: 1
             });
             logToHUD("V11.1 LOCAL KERNEL ONLINE.");
          } catch (gpuErr) {
             logToHUD("GPU Locked via V11.1. Falling back to Local CPU...");
             handsRef.current = await HandLandmarker.createFromOptions(vision, {
               baseOptions: {
                  modelAssetPath: `/hand_landmarker.task`,
                  delegate: "CPU"
               },
               runningMode: "VIDEO", numHands: 1
            });
            logToHUD("V11.1 LOCAL CPU ACTIVE.");
          }

          setIsVisionReady(true);
          setMessage('READY (V11-PRECISION)');
       } catch (err) {
          logToHUD(`FATAL V11: ${err.message}`);
          setIsVisionCrashed(true);
          setMessage(`Init Error: ${err.message}`);
       }
    };
    initAI();

    return () => { if (handsRef.current) handsRef.current = null; };
  }, [isCameraReady, currentStep, librariesLoaded]);

  // Phase 3: High-Performance Vision Heartbeat (Precision Zone Check)
  useEffect(() => {
    if (!isVisionReady || !videoRef.current || currentStep !== 'wizard') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const processFrame = async () => {
      if (!handsRef.current || !videoRef.current || isVisionCrashed) return;

      try {
         const startTimeMs = performance.now();
         const results = handsRef.current.detectForVideo(videoRef.current, startTimeMs);
         
         setVisionHeartbeat(Date.now());
         ctx.clearRect(0, 0, canvas.width, canvas.height);

         if (results.landmarks && results.landmarks[0]) {
            const hand = results.landmarks[0];
            
            // HUD Target Zone Logic (Fixed Boxes)
            const dRing = { x: 0.75, y: 0.7, r: 0.1 }; // Bottom-Right for Dime
            const nBox = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }; // Top-Left for Nails
            
            // Draw Target Guides for User
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#ffffff40';
            ctx.strokeRect(nBox.x * canvas.width, nBox.y * canvas.height, nBox.w * canvas.width, nBox.h * canvas.height);
            ctx.beginPath();
            ctx.arc(dRing.x * canvas.width, dRing.y * canvas.height, dRing.r * canvas.width, 0, 2 * Math.PI);
            ctx.stroke();

            // OpenCV Dime Logic
            try {
               const src = cv.imread(videoRef.current);
               const gray = new cv.Mat();
               cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
               const circles = new cv.Mat();
               cv.HoughCircles(gray, circles, cv.HOUGH_GRADIENT, 1, 45, 50, 30, 25, 100);
               
               let dimePixels = 0;
               let dimeInZone = false;

               if (circles.cols > 0) {
                  const cx = circles.data32F[0] / canvas.width;
                  const cy = circles.data32F[1] / canvas.height;
                  
                  // Check if Dime is in HUD Ring
                  const dist = Math.sqrt(Math.pow(cx - dRing.x, 2) + Math.pow(cy - dRing.y, 2));
                  if (dist < dRing.r) {
                     dimeInZone = true;
                     dimePixels = circles.data32F[2] * 2;
                     ctx.setLineDash([]);
                     ctx.beginPath(); ctx.arc(circles.data32F[0], circles.data32F[1], circles.data32F[2], 0, 2 * Math.PI);
                     ctx.strokeStyle = '#10b981'; ctx.lineWidth = 6; ctx.stroke();
                  }
               }

               // Check if Nails are in Box (Landmark 8: Index Tip)
               const fingerInZone = (hand[8].x > nBox.x && hand[8].x < nBox.x + nBox.w && 
                                    hand[8].y > nBox.y && hand[8].y < nBox.y + nBox.h);

               if (dimeInZone && fingerInZone) {
                  const sizing = getFullSizing(20, dimePixels, hand, canvas.width, canvas.height);
                  setMeasurement({ mm: sizing.mm, size: sizing.size });
                  setMessage("LOCKED - READY TO CAPTURE");
                  setIsStableSignal(true);
               } else {
                  setIsStableSignal(false);
                  if (!dimeInZone) setMessage("Place Dime in Ring ⭕");
                  else if (!fingerInZone) setMessage("Place Nails in Box 🔳");
                  setMeasurement(null);
               }

               src.delete(); gray.delete(); circles.delete();
            } catch (cvErr) {
               console.warn("CV Frame Error:", cvErr);
            }

            // Draw Skeleton (Native Fallback)
            hand.forEach(lm => {
               ctx.beginPath(); ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
               ctx.fillStyle = isStableSignal ? '#10b981' : '#f43f5e'; ctx.fill();
            });
         } else {
            setIsStableSignal(false);
            setMessage("Focus on Nail Target Box 🔳");
            setMeasurement(null);
         }
      } catch (err) { /* Frame drop silent */ }

      if (currentStep === 'wizard') {
         frameIdRef.current = requestAnimationFrame(processFrame);
      }
    };

    processFrame();
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [isVisionReady, currentStep, isVisionCrashed, isStableSignal]);

  // Phase 4: Capture & Sequence (Surgical Refactor)
  const captureShot = () => {
    if (!measurement || !isStableSignal) return
    
    // 1. Shutter Feedback
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 150);

    // 2. Logic Propagation
    const fingerName = steps[shotNumber-1]
    setResults(prev => ({ ...prev, [fingerName]: measurement }))
    
    if (shotNumber < 4) {
      setShotNumber(prev => prev + 1)
      setIsStableSignal(false)
    } else {
      setTimeout(() => setCurrentStep('finish'), 300);
    }
  }

  // UI VIEWS
  if (currentStep === 'finish') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-10 text-center animate-in fade-in zoom-in duration-500">
       <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
       <h2 className="text-3xl font-black text-white mb-2 tracking-tighter italic uppercase">SIZING COMPLETE 🛡️</h2>
       <p className="text-slate-400 mb-10 text-sm font-medium tracking-tight">Your V11 surgical measurements have been finalized.</p>
       <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-12">
          {Object.entries(results).map(([finger, data]) => (
             <div key={finger} className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col items-center shadow-lg">
                <span className="text-[10px] text-slate-500 font-black uppercase mb-1 tracking-widest">{finger.replace(' Fingers', '')}</span>
                <span className="text-xl font-black text-white tracking-widest leading-none underline decoration-emerald-500/20 underline-offset-4">SIZE {data.size}</span>
             </div>
          ))}
       </div>
       <button onClick={() => setCurrentStep('welcome')} className="w-full max-w-sm py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-2xl transition-all active:scale-95 text-lg shadow-emerald-500/20 ring-4 ring-emerald-500/10 uppercase">FINISH SESSION</button>
    </div>
  )

  if (currentStep === 'welcome') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-12 overflow-hidden">
       <div className="absolute top-0 inset-x-0 h-96 bg-emerald-500/10 blur-[120px] rounded-full -translate-y-1/2" />
       <div className="relative z-10 w-24 h-24 bg-slate-900 border border-emerald-500/30 rounded-[32px] flex items-center justify-center mb-10 shadow-inner">
          <Scan className="w-10 h-10 text-emerald-400" />
       </div>
       <h1 className="text-4xl font-black text-white mb-3 tracking-tighter leading-none italic">NailScale <span className="text-emerald-500 underline decoration-4 decoration-emerald-500/20 underline-offset-8">AI</span></h1>
       <p className="text-slate-500 font-bold tracking-widest text-[9px] uppercase mb-16 opacity-70">V11.0 SURGICAL HUD | PRECISION MASTER</p>
       
       <div className="w-full max-w-sm bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 mb-12 backdrop-blur-xl">
          <div className="flex items-center gap-4 mb-4">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
             <span className="text-xs text-slate-300 font-bold">PRECISION GRID SEQUENCE</span>
          </div>
          <ul className="space-y-4">
             {["Left Fingers", "Right Fingers", "Left Thumb", "Right Thumb"].map(s => (
                <li key={s} className="flex items-center gap-4 text-slate-400 font-black text-[11px] uppercase tracking-widest">
                   <ChevronRight className="w-4 h-4 text-emerald-500" /> {s}
                </li>
             ))}
          </ul>
       </div>
       
       <button 
          onClick={startWizard}
          disabled={systemBooting}
          className={`w-full max-w-sm py-6 rounded-3xl font-black text-xl tracking-tighter shadow-2xl transition-all active:scale-95 ${systemBooting ? 'bg-slate-800 text-slate-500 grayscale' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30 ring-4 ring-emerald-500/10'}`}
       >
          {systemBooting ? 'SYSTEM BOOTING...' : 'INITIALIZE PRECISION GRID'}
       </button>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden select-none">
       {/* SHUTTER FLASH LAYER */}
       {shutterFlash && <div className="absolute inset-0 bg-white z-[100] animate-out fade-out duration-150" />}

       {/* HUD TOP: AI STATUS */}
       <div className="absolute top-12 inset-x-0 flex flex-col items-center gap-3 z-30 pointer-events-none">
          <div className={`px-6 py-2.5 rounded-full border-2 bg-slate-950/80 backdrop-blur-xl shadow-2xl transition-all duration-300 flex items-center gap-4 ${isStableSignal ? 'border-emerald-500 shadow-emerald-500/20' : 'border-slate-800 shadow-black'}`}>
             <div className={`w-2.5 h-2.5 rounded-full ${isStableSignal ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
             <span className={`text-[11px] font-black tracking-widest uppercase ${isStableSignal ? 'text-emerald-400' : 'text-slate-400'}`}>
                {message}
             </span>
          </div>
          
          {isStableSignal && measurement && (
             <div className="bg-emerald-500 text-slate-950 px-5 py-1 rounded-full font-black text-[10px] tracking-tight shadow-xl animate-in fade-in slide-in-from-top-2 border-2 border-emerald-400">
                LOCKED: SIZE {measurement.size} (99% ACCURACY)
             </div>
          )}
       </div>

       {/* VISION LAYER */}
       <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover grayscale opacity-40 brightness-50 contrast-125" playsInline muted />
          
          {/* Main Feed with High Contrast */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/80 pointer-events-none z-0" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 opacity-90" />

          {/* CRITICAL RECOVERY OVERLAY */}
          {isVisionCrashed && (
             <div className="absolute inset-0 bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center z-50 overflow-hidden">
                <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
                <h2 className="text-xl font-black text-white mb-2 tracking-tighter uppercase leading-none">RECOVERY HUD ACTIVE</h2>
                <div className="w-full max-w-sm bg-black border border-slate-800 rounded-xl p-4 mb-8 text-left h-48 overflow-y-auto font-mono text-[10px] shadow-inner">
                   {debugLog.length > 0 ? debugLog.map((log, i) => (
                      <div key={i} className="text-emerald-500/80 mb-1 leading-tight">{log}</div>
                   )) : <div className="text-slate-600 italic">No logs available...</div>}
                </div>
                <button onClick={() => window.location.reload()} className="w-full max-w-[240px] py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-widest">RESTART PRECISION KERNEL</button>
             </div>
          )}
       </div>

       {/* CONTROL SURFACE */}
       <div className="p-10 bg-slate-950 border-t border-slate-900/50 flex items-center justify-between z-40">
          <div className="flex flex-col gap-1.5">
             <span className="text-[10px] text-slate-500 font-black tracking-[0.2em] uppercase opacity-70">PRECISION GAP {shotNumber}/4</span>
             <h3 className="text-2xl font-black text-white tracking-widest leading-none uppercase italic">{steps[shotNumber-1]}</h3>
          </div>

          <div className="flex gap-4">
             <button onClick={() => setCurrentStep('welcome')} className="w-16 h-16 flex items-center justify-center bg-slate-900/80 border border-slate-800 rounded-3xl text-slate-500 hover:text-white transition-all active:scale-90 shadow-xl">
                <X className="w-7 h-7" />
             </button>
             
             <button 
                onClick={captureShot}
                disabled={!isStableSignal}
                className={`w-24 h-24 flex items-center justify-center rounded-[36px] transition-all active:scale-90 shadow-2xl ${isStableSignal ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20 ring-[12px] ring-emerald-500/10' : 'bg-slate-900 border border-slate-800 text-slate-700 opacity-20'}`}
             >
                <Camera className="w-9 h-9" strokeWidth={3} />
             </button>
          </div>
       </div>
    </div>
  )
}

export default App
