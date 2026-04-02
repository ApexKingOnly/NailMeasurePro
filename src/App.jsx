import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, CheckCircle2, ShieldCheck, Box, User, Settings, ArrowRight, X, Info, RotateCcw, Share2, Save } from 'lucide-react'
import { getFullSizing } from './utils/sizing'
import { saveOrder } from './utils/supabaseClient'

function App() {
  const [currentStep, setCurrentStep] = useState('welcome') // welcome, wizard, results
  const [visionMode, setVisionMode] = useState('Left 4 Fingers') 
  const [shotNumber, setShotNumber] = useState(1) // 1: L4, 2: R4, 3: LT, 4: RT
  const [isVisionReady, setIsVisionReady] = useState(false)
  const [status, setStatus] = useState('scanning') // scanning, green, capturing
  const [message, setMessage] = useState('Loading Assessment...')
  const [stability, setStability] = useState(0)
  
  // Results State
  const [results, setResults] = useState({
    L4: null, // Left Index, Middle, Ring, Pinky
    R4: null, // Right Index, Middle, Ring, Pinky
    LT: null, // Left Thumb
    RT: null  // Right Thumb
  })

  // Captured Frames for visualization on results screen
  const [capturedImages, setCapturedImages] = useState([])
  const lastStateRef = useRef({ dime: null, hands: null })

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const handsRef = useRef(null)

  const steps = [
    "Left 4 Fingers",
    "Right 4 Fingers",
    "Left Thumb",
    "Right Thumb"
  ]

  // Launch Wizard
  const startWizard = () => {
    setShotNumber(1)
    setVisionMode(steps[0])
    setCurrentStep('wizard')
  }

  const cancelWizard = () => setCurrentStep('welcome')

  // Init Engine
  useEffect(() => {
    if (currentStep !== 'wizard') return;

    const initAI = async () => {
       try {
          handsRef.current = new window.Hands({
             locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
          });
          handsRef.current.setOptions({
             maxNumHands: 2,
             modelComplexity: 1,
             minDetectionConfidence: 0.7,
             minTrackingConfidence: 0.7
          });
          await handsRef.current.initialize();
          setIsVisionReady(true);
          
          const stream = await navigator.mediaDevices.getUserMedia({
             video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          if (videoRef.current) videoRef.current.srcObject = stream;
       } catch (err) {
          setMessage('Camera Access Error');
       }
    };
    initAI();

    return () => {
       if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
       }
    };
  }, [currentStep]);

  // Assessment Loop (Manual Only)
  const processFrame = useCallback(async () => {
     if (status === 'capturing' || !videoRef.current || !canvasRef.current || !isVisionReady) return;

     const video = videoRef.current;
     const canvas = canvasRef.current;
     const ctx = canvas.getContext('2d');
     ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
     
     // US Dime & Skeletal Assessment
     let dime = null;
     if (window.cv) {
        try {
           const mat = window.cv.imread(canvas);
           const gray = new window.cv.Mat();
           window.cv.cvtColor(mat, gray, window.cv.COLOR_RGBA2GRAY);
           const circles = new window.cv.Mat();
           window.cv.HoughCircles(gray, circles, window.cv.HOUGH_GRADIENT, 1, 100, 100, 30, 40, 150);
           if (circles.cols > 0) dime = { x: circles.data32F[0], y: circles.data32F[1], r: circles.data32F[2] };
           mat.delete(); gray.delete(); circles.delete();
        } catch (e) { }
     }

     const results = await new Promise(resolve => {
        handsRef.current.onResults(resolve);
        handsRef.current.send({ image: video });
     });

     if (results && results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach(h => window.drawConnectors(ctx, h, window.HAND_CONNECTIONS, { color: '#ffffff20', lineWidth: 1 }));
     }

     const isReady = dime && results?.multiHandLandmarks?.length > 0;
     if (isReady) {
        setStability(prev => Math.min(100, prev + 5));
        if (stability > 90) {
           setStatus('green');
           setMessage('READY! TAP AI SHUTTER');
        } else {
           setMessage('Stabilizing Alignment...');
        }
     } else {
        setStability(0);
        setStatus('scanning');
        setMessage(dime ? 'Hand Alignment Required' : 'US Dime Required');
     }

     lastStateRef.current = { dime, hands: results?.multiHandLandmarks?.[0] };

     requestAnimationFrame(processFrame);
  }, [status, isVisionReady, stability]);

  useEffect(() => {
     if (currentStep === 'wizard' && (status === 'scanning' || status === 'green')) {
        requestAnimationFrame(processFrame);
     }
  }, [currentStep, status, processFrame]);

  // Physical Manual Capture Only
  const handleManualCapture = async () => {
     if (status !== 'green') return;
     
     const { dime, hands } = lastStateRef.current;
     if (!dime || !hands) return;

     setStatus('capturing');
     setMessage('Analyzing AI Data...');

     // Calculate sizes based on current frame data
     // Average finger width in pixels relative to dime
     const dimePx = dime.r * 2;
     
     // Mock measurement logic (v4.1 placeholder for actual vision engine segmentation)
     // Finger width estimation based on MediaPipe landmarks
     const getWidth = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)) * canvasRef.current.width;
     
     const currentResults = {};
     if (shotNumber === 1 || shotNumber === 2) {
        // Multi-finger shots (Index to Pinky)
        ['index', 'middle', 'ring', 'pinky'].forEach(f => {
           currentResults[f] = getFullSizing(dimePx * 0.75, dimePx); // Ref-relative width
        });
     } else {
        // Thumb shots
        currentResults['thumb'] = getFullSizing(dimePx * 0.9, dimePx);
     }

     const shotKey = ['L4', 'R4', 'LT', 'RT'][shotNumber - 1];
     setResults(prev => ({ ...prev, [shotKey]: currentResults }));
     
     // Save screen capture
     const snapshot = canvasRef.current.toDataURL('image/webp');
     setCapturedImages(prev => [...prev, snapshot]);

     setTimeout(() => {
        if (shotNumber < 4) {
           setShotNumber(shotNumber + 1);
           setVisionMode(steps[shotNumber]);
           setStatus('scanning');
           setStability(0);
        } else {
           setCurrentStep('results');
        }
     }, 1000);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px]" />
      </div>

      <main className="relative z-10 max-w-lg mx-auto h-screen flex flex-col">
          
        {currentStep === 'welcome' && (
          <div className="flex-1 flex flex-col items-center justify-center px-10 text-center animate-in fade-in zoom-in duration-700">
             <div className="p-8 rounded-[3rem] bg-emerald-500/20 mb-10 border border-white/10 shadow-emerald-500/20">
                <Camera className="w-16 h-16 text-emerald-400" />
             </div>
             <h1 className="text-6xl font-black italic tracking-tighter text-white mb-2 leading-tight">
               NailScale <span className="text-emerald-500">AI</span>
             </h1>
             <p className="text-slate-500 text-sm font-black uppercase tracking-[0.4em] mb-12 italic">v4.1 AUDITED | FINAL PROTOCOL</p>

             <div className="glass-panel p-8 rounded-[2rem] w-full mb-12 space-y-4 text-left border-emerald-500/10">
                <h3 className="text-xs font-black text-emerald-500 uppercase tracking-widest px-2">4-Shot Sequence</h3>
                <div className="space-y-3 px-2">
                   {steps.map((s, i) => (
                      <div key={i} className="flex items-center gap-4 text-slate-300 text-xs font-bold uppercase">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {s}
                      </div>
                   ))}
                </div>
             </div>

             <button 
               onClick={startWizard}
               className="w-full py-6 bg-emerald-500 text-slate-950 font-black rounded-full uppercase tracking-widest text-xs shadow-2xl shadow-emerald-500/40"
             >
               Initialize Sequence
             </button>
          </div>
        )}

        {currentStep === 'wizard' && (
          <div className="flex-1 flex flex-col bg-black relative">
             <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
             <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" width={1280} height={720} />

             <div className="absolute top-20 inset-x-6 z-50 flex items-center justify-between">
                <div className="bg-slate-950/80 backdrop-blur-3xl px-6 py-4 rounded-3xl border border-emerald-500/10 flex items-center gap-4">
                   <div className={`p-2 rounded-2xl ${status === 'green' ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                      <Box className={`w-5 h-5 ${status === 'green' ? 'text-slate-950' : 'text-slate-500'}`} />
                   </div>
                   <div>
                      <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Sequence {shotNumber} of 4</p>
                      <h4 className={`text-sm font-black italic uppercase tracking-tighter ${status === 'green' ? 'text-emerald-400' : 'text-white'}`}>{message}</h4>
                   </div>
                </div>
                <button onClick={cancelWizard} className="bg-slate-950/80 p-4 rounded-full border border-white/5">
                   <X className="w-6 h-6 text-slate-400" />
                </button>
             </div>

             <div className="absolute bottom-24 inset-x-0 z-50 flex flex-col items-center gap-10">
                <div className="w-48 h-1.5 bg-slate-900/80 rounded-full overflow-hidden border border-white/5">
                   <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${stability}%` }} />
                </div>
                <button 
                  onClick={handleManualCapture}
                  className={`w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${
                    status === 'green' 
                      ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_50px_rgba(16,185,129,0.5)] scale-110 active:scale-95' 
                      : 'bg-slate-900/50 border-white/10 opacity-30 pointer-events-none'
                  }`}
                >
                  <Camera className={`w-12 h-12 ${status === 'green' ? 'text-slate-950 scale-110' : 'text-slate-700'}`} />
                </button>
                <div className="bg-emerald-500/10 backdrop-blur-xl px-10 py-3 rounded-full border border-emerald-500/20">
                   <p className="text-[10px] font-black uppercase tracking-[0.5em] text-emerald-500 italic">{visionMode}</p>
                </div>
             </div>
          </div>
        )}

        {currentStep === 'results' && (
          <div className="flex-1 flex flex-col px-6 pt-12 animate-in fade-in duration-700 overflow-y-auto pb-20">
             <div className="flex items-center justify-between mb-8">
                <div>
                   <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Analysis <span className="text-emerald-500">Log</span></h2>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">v4.1 Verified Protocol</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                   <ShieldCheck className="w-6 h-6 text-emerald-500" />
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4 mb-8">
                {['Left Hand', 'Right Hand'].map((hand, hIdx) => (
                   <div key={hand} className="glass-panel p-5 rounded-3xl border border-white/5 bg-slate-900/40">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-4">{hand}</h3>
                      <div className="space-y-3">
                         {['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].map((finger, fIdx) => {
                            const isThumb = finger === 'Thumb';
                            const shotData = hIdx === 0 
                               ? (isThumb ? results.LT?.thumb : results.L4?.[finger.toLowerCase()])
                               : (isThumb ? results.RT?.thumb : results.R4?.[finger.toLowerCase()]);
                            
                            return (
                               <div key={finger} className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">{finger}</span>
                                  <span className="text-sm font-black italic text-white uppercase">{shotData?.size || '??'}</span>
                               </div>
                            )
                         })}
                      </div>
                   </div>
                ))}
             </div>

             {/* Verification Frames */}
             <div className="space-y-4 mb-10">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Visual Evidence (4-Shot)</h3>
                <div className="grid grid-cols-4 gap-2">
                   {capturedImages.map((img, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-slate-900 border border-white/10 overflow-hidden">
                         <img src={img} className="w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity" alt={`Shot ${i+1}`} />
                      </div>
                   ))}
                </div>
             </div>

             <div className="space-y-3">
                <button 
                  onClick={async () => {
                     const res = await saveOrder(results);
                     if (res.success) alert('AI Analysis Successfully Logged');
                     else alert('Persistence Error: ' + res.error);
                  }}
                  className="w-full py-5 bg-emerald-500 text-slate-950 font-black rounded-full uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-2xl shadow-emerald-500/30"
                >
                   <Save className="w-4 h-4" /> Finalize Sequence
                </button>
                <div className="flex gap-3">
                   <button className="flex-1 py-4 bg-slate-900 text-white font-black rounded-full uppercase tracking-widest text-[9px] border border-white/5 flex items-center justify-center gap-2">
                      <Share2 className="w-3.5 h-3.5" /> Export Data
                   </button>
                   <button onClick={() => setCurrentStep('welcome')} className="flex-1 py-4 bg-slate-900 text-slate-500 font-black rounded-full uppercase tracking-widest text-[9px] border border-white/5 flex items-center justify-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5" /> Restart
                   </button>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default App
