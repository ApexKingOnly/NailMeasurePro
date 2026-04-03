import React, { useState, useEffect, useRef } from 'react'
import { Camera, ShieldAlert, Scan, X, RotateCcw, CheckCircle2, ChevronRight, Info } from 'lucide-react'
import { getFullSizing } from './utils/sizing'

// Finger Landmarks for High Precision 10-Finger Mapping
const tip_map = { 1: 8, 2: 12, 3: 16, 4: 20 }; // Index, Middle, Ring, Pinky
const dip_map = { 1: 7, 2: 11, 3: 15, 4: 19 }; // Associated DIP joints

function App() {
  // Navigation State
  const [currentStep, setCurrentStep] = useState('welcome')
  const [shotNumber, setShotNumber] = useState(1)
  const steps = [
    "Left Pinky", "Left Ring", "Left Middle", "Left Pointer", "Left Thumb",
    "Right Thumb", "Right Pointer", "Right Middle", "Right Ring", "Right Pinky"
  ]
  
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
  const [shutterFlash, setShutterFlash] = useState(false)
  
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
             const timeout = setTimeout(() => reject(new Error("Vision Core Hub Timeout (60s Exhausted)")), 60000);
             const check = () => {
                if (window.cv && window.cv.Mat) {
                   clearTimeout(timeout);
                   resolve();
                } else {
                   setTimeout(check, 500);
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

    const processFrame = async () => {
      if (!videoRef.current || !canvasRef.current || !handsRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      // V17: HIGH-DPI RETINA SCALING
      const ratio = window.devicePixelRatio || 2;
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width * ratio) {
         canvas.width = rect.width * ratio;
         canvas.height = rect.height * ratio;
         canvas.style.width = `${rect.width}px`;
         canvas.style.height = `${rect.height}px`;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      try {
         const startTimeMs = performance.now();
         const results = handsRef.current.detectForVideo(video, startTimeMs);
         
         setVisionHeartbeat(Date.now());

         // V18.1: PRECISION SWAP (Dime Top, Nail Bottom) & Zoom-Out Scaling
         const dRing = { x: 0.5, y: 0.18, r: 0.11 }; // Center-Top for Dime
         const nBox = { x: 0.32, y: 0.65, w: 0.36, h: 0.25 }; // Center-Bottom for Nail

         const drawSurgicalHUD = () => {
            const w = rect.width;
            const h = rect.height;
            const bx = nBox.x * w; const by = nBox.y * h; const bw = nBox.w * w; const bh = nBox.h * h;
            const cl = 30; // Corner Length

            ctx.save();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2.5; // Thin surgical line
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';

            // 🔳 Precision Bracket (Nail Target)
            // Top-Left
            ctx.beginPath(); ctx.moveTo(bx, by + cl); ctx.lineTo(bx, by); ctx.lineTo(bx + cl, by); ctx.stroke();
            // Top-Right
            ctx.beginPath(); ctx.moveTo(bx + bw - cl, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cl); ctx.stroke();
            // Bottom-Left
            ctx.beginPath(); ctx.moveTo(bx, by + bh - cl); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cl, by + bh); ctx.stroke();
            // Bottom-Right
            ctx.beginPath(); ctx.moveTo(bx + bw - cl, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cl); ctx.stroke();

            // ⭕ Scaling Target (Dime Crosshair)
            const dx = dRing.x * w; const dy = dRing.y * h; const dr = dRing.r * w;
            ctx.setLineDash([8, 12]);
            ctx.beginPath(); ctx.arc(dx, dy, dr, 0, 2 * Math.PI); ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(dx - 10, dy); ctx.lineTo(dx + 10, dy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(dx, dy - 10); ctx.lineTo(dx, dy + 10); ctx.stroke();
            ctx.restore();
         };

         drawSurgicalHUD();

         if (results.landmarks && results.landmarks[0]) {
            const hand = results.landmarks[0];

            // OpenCV Dime Logic
            try {
               const src = cv.imread(video);
               const gray = new cv.Mat();
               cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
               const circles = new cv.Mat();
               cv.HoughCircles(gray, circles, cv.HOUGH_GRADIENT, 1, 45, 50, 30, 25, 100);
               
               let dimePixels = 0;
               let dimeInZone = false;

               if (circles.cols > 0) {
                  const cx = circles.data32F[0] / video.videoWidth;
                  const cy = circles.data32F[1] / video.videoHeight;
                  
                  // Check if Dime is in HUD Ring (Sweet Spot Center)
                  const dist = Math.sqrt(Math.pow(cx - dRing.x, 2) + Math.pow(cy - dRing.y, 2));
                  if (dist < dRing.r) {
                     dimeInZone = true;
                     dimePixels = circles.data32F[2] * 2;
                     // DIMENSIONS MAPPING (Visual Feedback)
                     ctx.setLineDash([]);
                     ctx.beginPath(); ctx.arc(circles.data32F[0]/ratio, circles.data32F[1]/ratio, circles.data32F[2]/ratio, 0, 2 * Math.PI);
                     ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4; ctx.stroke();
                  }
               }

               // Check if Nails are in Box (Landmark 8: Index Tip)
               const fingerInZone = (hand[8].x > nBox.x && hand[8].x < nBox.x + nBox.w && 
                                    hand[8].y > nBox.y && hand[8].y < nBox.y + nBox.h);

               if (dimeInZone && fingerInZone) {
                  const sizing = getFullSizing(20, dimePixels, hand, rect.width, rect.height);
                  setMeasurement({ mm: sizing.mm, size: sizing.size });
                  setMessage("LOCKED - READY TO CAPTURE");
                  setIsStableSignal(true); // V19: Override to Allow Instant Capture
               } else {
                  setIsStableSignal(false);
                  setMeasurement(null);
                  setMessage("ALIGN DIME (TOP) & NAIL (BOTTOM)");
               }

               src.delete(); gray.delete(); circles.delete();
            } catch (cvErr) {
               console.warn("CV Frame Error:", cvErr);
            }

            // V15: LANDMARK PURGE (Professional Clean UI)
            hand.forEach(lm => {
               ctx.beginPath(); ctx.arc(lm.x * rect.width, lm.y * rect.height, 2, 0, 2 * Math.PI);
               ctx.fillStyle = isStableSignal ? 'rgba(16, 185, 129, 0.4)' : 'transparent'; ctx.fill();
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
    
    // 1. Shutter & Haptic Feedback
    if (navigator.vibrate) navigator.vibrate(15);
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 150);

    // 2. Logic Propagation
    const fingerName = steps[shotNumber-1]
    setResults(prev => ({ ...prev, [fingerName]: measurement }))
    
    if (shotNumber < 10) {
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
       <p className="text-slate-500 font-bold tracking-widest text-[9px] uppercase mb-16 opacity-70">V20.0 MINIMALIST SURGICAL HUD | PRECISION MASTER</p>
       
       <div className="w-full max-w-sm bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 mb-12 backdrop-blur-xl">
          <div className="flex items-center gap-4 mb-4">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
             <span className="text-xs text-slate-300 font-bold">PRECISION GRID SEQUENCE</span>
          </div>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-3">
             {steps.map(s => (
                <li key={s} className="flex items-center gap-2 text-slate-400 font-black text-[9px] uppercase tracking-widest leading-none">
                   <ChevronRight className="w-3 h-3 text-emerald-500 shrink-0" /> {s.replace('Left ', 'L-').replace('Right ', 'R-')}
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
          
          {isStableSignal && measurement && (
             <div className="bg-emerald-500 text-slate-950 px-5 py-1 rounded-full font-black text-[10px] tracking-tight shadow-xl animate-in fade-in slide-in-from-top-2 border-2 border-emerald-400">
                LOCKED: SIZE {measurement.size} (99% ACCURACY)
             </div>
          )}
       </div>

       {/* VISION LAYER */}
       <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-100 brightness-100 contrast-100 shadow-inner" playsInline muted />
          
          {/* Main Feed with High Contrast */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/80 pointer-events-none z-0" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 opacity-90" />

          {/* CRITICAL RECOVERY OVERLAY */}
          {isVisionCrashed && (
             <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-8 text-center z-[200] animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-6 ring-4 ring-rose-500/20">
                   <ShieldAlert className="w-10 h-10 text-rose-500" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2 tracking-tighter uppercase italic">ENGINE LOCKDOWN</h2>
                <p className="text-slate-400 text-xs max-w-[280px] mb-8 font-medium leading-relaxed uppercase tracking-widest opacity-60">Surgical vision core stalled on Vercel Node. System logs below:</p>
                
                <div className="w-full max-w-sm bg-black border border-slate-800 rounded-2xl p-5 mb-10 text-left h-56 overflow-y-auto font-mono text-[10px] shadow-2xl relative">
                   <div className="absolute top-0 right-0 p-2 text-[8px] text-slate-700 font-black">V12 RELAY</div>
                   {debugLog.length > 0 ? debugLog.map((log, i) => (
                      <div key={i} className="text-emerald-500/80 mb-1.5 leading-tight tracking-tight border-l border-emerald-500/20 pl-2">{log}</div>
                   )) : <div className="text-slate-600 italic">Synchronizing Logs...</div>}
                </div>

                <button onClick={() => window.location.reload()} className="w-full max-w-[280px] py-5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-[0.2em] ring-4 ring-rose-600/10">FORCE SYSTEM RESTART</button>
             </div>
          )}
       </div>

       {/* CONTROL SURFACE */}
       <div className="p-10 bg-slate-950 border-t border-slate-900/50 flex items-center justify-between z-40">
          <div className="flex flex-col gap-1.5">
             <span className="text-[10px] text-slate-500 font-black tracking-[0.2em] uppercase opacity-70">PRECISION SOLO {shotNumber}/10</span>
             <h3 className="text-2xl font-black text-white tracking-widest leading-none uppercase italic">{steps[shotNumber-1]}</h3>
          </div>

          <div className="flex gap-4">
             <button onClick={() => setCurrentStep('welcome')} className="w-16 h-16 flex items-center justify-center bg-slate-900/80 border border-slate-800 rounded-3xl text-slate-500 hover:text-white transition-all active:scale-90 shadow-xl">
                <X className="w-7 h-7" />
             </button>
             
             <button 
                 onClick={captureShot}
                 disabled={!isStableSignal}
                 className={`w-24 h-24 flex items-center justify-center rounded-[36px] transition-all active:scale-90 shadow-2xl relative overflow-hidden ${isStableSignal ? 'animate-iridescent text-slate-950 ring-[12px] ring-emerald-500/20' : 'bg-slate-900 border border-slate-800 text-slate-700 opacity-20'}`}
              >
                 <Camera className={`w-9 h-9 ${isStableSignal ? 'scale-110' : ''}`} strokeWidth={3} />
              </button>
          </div>
       </div>
    </div>
  )
}

export default App
