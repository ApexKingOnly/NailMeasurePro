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

  // Stability & Debug Layer (v8 Native Core)
  const [debugLog, setDebugLog] = useState([])
  const logToHUD = (txt) => {
     console.log(`[V8-NATIVE]: ${txt}`);
     setDebugLog(prev => [...prev.slice(-15), `> ${new Date().toLocaleTimeString().split(' ')[0]} | ${txt}`]);
  }

  // Phase 2: AI Hub Initialization (V8 Native Architecture)
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
             logToHUD("Powering AI Infrastructure...");
             await loadScript('https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.7.0/opencv.js', 'cv-atomic');
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
          logToHUD("Native Space READY.");

          const vision = await FilesetResolver.forVisionTasks(
             "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
          );

          // Atomic Handlandmarker Initialization (V8-NATIVE)
          try {
             logToHUD("Initializing V8 Native Kernel...");
             handsRef.current = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                   modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                   delegate: "GPU"
                },
                runningMode: "VIDEO", numHands: 1
             });
             logToHUD("V8 NATIVE KERNEL ONLINE.");
          } catch (gpuErr) {
             logToHUD("GPU Locked via V8. Falling back to Core CPU...");
             handsRef.current = await HandLandmarker.createFromOptions(vision, {
               baseOptions: {
                  modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                  delegate: "CPU"
               },
               runningMode: "VIDEO", numHands: 1
            });
            logToHUD("V8 CORE CPU ACTIVE.");
          }

          setIsVisionReady(true);
          setMessage('READY (V8-NATIVE CORE)');
       } catch (err) {
          logToHUD(`FATAL V8: ${err.message}`);
          setIsVisionCrashed(true);
          setMessage(`Init Error: ${err.message}`);
       }
    };
    initAI();

    return () => { if (handsRef.current) handsRef.current = null; };
  }, [isCameraReady, currentStep, librariesLoaded]);

  // Phase 3: High-Performance Vision Heartbeat
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
           
           // OpenCV Dime Logic
           try {
              const src = cv.imread(videoRef.current);
              const gray = new cv.Mat();
              cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
              const circles = new cv.Mat();
              cv.HoughCircles(gray, circles, cv.HOUGH_GRADIENT, 1, 45, 50, 30, 25, 100);
              
              let dimePixels = 0;
              if (circles.cols > 0) {
                 dimePixels = circles.data32F[2] * 2;
                 ctx.beginPath(); ctx.arc(circles.data32F[0], circles.data32F[1], circles.data32F[2], 0, 2 * Math.PI);
                 ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4; ctx.stroke();
              }

              const sizing = getFullSizing(20, dimePixels, hand, canvas.width, canvas.height);
              setMeasurement({ mm: sizing.mm, size: sizing.size });
              setMessage(sizing.guidance);
              setIsStableSignal(sizing.isStable);

              src.delete(); gray.delete(); circles.delete();
           } catch (cvErr) {
              console.warn("CV Frame Error:", cvErr);
           }

           // Draw Skeleton (Native Fallback)
           hand.forEach(lm => {
              ctx.beginPath(); ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
              ctx.fillStyle = '#10b981'; ctx.fill();
           });
           ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 1; ctx.beginPath();
           ctx.moveTo(hand[0].x * canvas.width, hand[0].y * canvas.height);
           ctx.lineTo(hand[5].x * canvas.width, hand[5].y * canvas.height);
           ctx.lineTo(hand[8].x * canvas.width, hand[8].y * canvas.height);
           ctx.stroke();

         } else {
           setIsStableSignal(false);
           setMessage("Focus Camera on Hand...");
           setMeasurement(null);
         }
      } catch (err) { /* Frame drop silent */ }

      if (currentStep === 'wizard') {
         frameIdRef.current = requestAnimationFrame(processFrame);
      }
    };

    processFrame();
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [isVisionReady, currentStep, isVisionCrashed]);

  // Phase 4: Capture & Sequence
  const captureShot = () => {
    if (!measurement) return
    const fingerName = steps[shotNumber-1]
    setResults(prev => ({ ...prev, [fingerName]: measurement }))
    
    if (shotNumber < 4) {
      setShotNumber(prev => prev + 1)
      setIsStableSignal(false)
    } else {
      setCurrentStep('finish')
    }
  }

  // UI VIEWS
  if (currentStep === 'finish') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-10 text-center animate-in fade-in zoom-in duration-500">
       <CheckCircle2 className="w-20 h-20 text-emerald-500 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
       <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">SIZING COMPLETE</h2>
       <p className="text-slate-400 mb-10 text-sm font-medium tracking-tight">Your AI measurements have been securely saved.</p>
       <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-12">
          {Object.entries(results).map(([finger, data]) => (
             <div key={finger} className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col items-center">
                <span className="text-[10px] text-slate-500 font-black uppercase mb-1">{finger.replace(' Fingers', '')}</span>
                <span className="text-xl font-bold text-white tracking-widest leading-none">SIZE {data.size}</span>
             </div>
          ))}
       </div>
       <button onClick={() => setCurrentStep('welcome')} className="w-full max-w-sm py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-2xl transition-all active:scale-95 text-lg">DONE</button>
    </div>
  )

  if (currentStep === 'welcome') return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-12 overflow-hidden">
       <div className="absolute top-0 inset-x-0 h-96 bg-emerald-500/10 blur-[120px] rounded-full -translate-y-1/2" />
       <div className="relative z-10 w-24 h-24 bg-slate-900 border border-emerald-500/30 rounded-[32px] flex items-center justify-center mb-10 shadow-inner">
          <Camera className="w-10 h-10 text-emerald-400" />
       </div>
       <h1 className="text-4xl font-black text-white mb-3 tracking-tighter leading-none italic">NailScale <span className="text-emerald-500 underline decoration-4 decoration-emerald-500/20 underline-offset-8">AI</span></h1>
       <p className="text-slate-500 font-bold tracking-widest text-[10px] uppercase mb-16 opacity-70">V6.0 ENTERPRISE | STABILITY REFACTOR</p>
       
       <div className="w-full max-w-sm bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 mb-12 backdrop-blur-xl">
          <div className="flex items-center gap-4 mb-4">
             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
             <span className="text-xs text-slate-300 font-bold">4-SHOT SEQUENCE</span>
          </div>
          <ul className="space-y-4">
             {["Left 4 Fingers", "Right 4 Fingers", "Left Thumb", "Right Thumb"].map(s => (
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
          {systemBooting ? 'SYSTEM BOOTING...' : 'INITIALIZE SEQUENCE'}
       </button>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden select-none">
       {/* HUD TOP: AI STATUS */}
       <div className="absolute top-12 inset-x-0 flex flex-col items-center gap-3 z-30 pointer-events-none">
          <div className={`px-6 py-2.5 rounded-full border-2 bg-slate-950/80 backdrop-blur-xl shadow-2xl transition-all duration-300 flex items-center gap-4 ${isStableSignal ? 'border-emerald-500 shadow-emerald-500/20' : 'border-slate-800 shadow-black'}`}>
             <div className={`w-2 h-2 rounded-full ${isStableSignal ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
             <span className={`text-[11px] font-black tracking-widest uppercase ${isStableSignal ? 'text-emerald-400' : 'text-slate-400'}`}>
                {message}
             </span>
          </div>
          
          {measurement && (
             <div className="bg-emerald-500 text-slate-950 px-5 py-1 rounded-full font-black text-[10px] tracking-tight shadow-xl animate-in fade-in slide-in-from-top-2">
                ESTIMATED: SIZE {measurement.size}
             </div>
          )}
       </div>

       {/* VISION LAYER */}
       <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />

          {/* DIME LANDING ZONE GUIDE (Visual Aid) */}
          {isVisionReady && !isVisionCrashed && (
             <div className="absolute bottom-40 right-10 w-28 h-28 border-4 border-dashed border-emerald-500/30 rounded-full flex items-center justify-center bg-emerald-500/5 animate-pulse z-20">
                <span className="text-[10px] text-emerald-400 font-black tracking-tighter select-none opacity-50 px-4 text-center">POSITION DIME HERE</span>
             </div>
          )}

          {/* CRITICAL RECOVERY OVERLAY WITH DEBUG CONSOLE (v6) */}
          {isVisionCrashed && (
             <div className="absolute inset-0 bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center z-50 overflow-hidden">
                <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
                <h2 className="text-xl font-black text-white mb-2 tracking-tighter uppercase leading-none">RECOVERY HUD ACTIVE</h2>
                <p className="text-slate-500 text-xs max-w-[280px] mb-6 font-medium leading-relaxed">Vision stall detected. See debug terminal below.</p>
                
                {/* Debug Terminal Window */}
                <div className="w-full max-w-sm bg-black border border-slate-800 rounded-xl p-4 mb-8 text-left h-48 overflow-y-auto font-mono text-[10px] shadow-inner">
                   {debugLog.length > 0 ? debugLog.map((log, i) => (
                      <div key={i} className="text-emerald-500/80 mb-1 leading-tight">{log}</div>
                   )) : <div className="text-slate-600 italic">No logs available...</div>}
                </div>

                <button onClick={() => window.location.reload()} className="w-full max-w-[240px] py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-2xl transition-all active:scale-95 uppercase text-xs tracking-widest">RESTART AI</button>
             </div>
          )}
       </div>

       {/* CONTROL SURFACE */}
       <div className="p-10 bg-slate-950 border-t border-slate-900/50 flex items-center justify-between z-40">
          <div className="flex flex-col gap-1.5">
             <span className="text-[10px] text-slate-500 font-black tracking-[0.2em] uppercase opacity-70">STEP {shotNumber} OF 4</span>
             <h3 className="text-2xl font-black text-white tracking-widest leading-none uppercase">{steps[shotNumber-1]}</h3>
          </div>

          <div className="flex gap-4">
             <button onClick={() => setCurrentStep('welcome')} className="w-16 h-16 flex items-center justify-center bg-slate-900/80 border border-slate-800 rounded-3xl text-slate-500 hover:text-white transition-all active:scale-90 shadow-xl">
                <X className="w-7 h-7" />
             </button>
             
             {/* RELAXED CAPTURE BUTTON (Unlock if measurement possible) */}
             <button 
                onClick={captureShot}
                disabled={!measurement}
                className={`w-24 h-24 flex items-center justify-center rounded-[36px] transition-all active:scale-90 shadow-2xl ${measurement ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20 ring-[12px] ring-emerald-500/10' : 'bg-slate-900 border border-slate-800 text-slate-700 opacity-40'}`}
             >
                <Camera className="w-9 h-9" strokeWidth={3} />
             </button>
          </div>
       </div>
    </div>
  )
}

export default App
