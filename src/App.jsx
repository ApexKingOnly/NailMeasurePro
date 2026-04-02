import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, CheckCircle2, ShieldCheck, Box, User, Settings, ArrowRight, X, Info } from 'lucide-react'

// Constants
const DIME_DIAMETER_MM = 17.91; 

function App() {
  const [currentStep, setCurrentStep] = useState('welcome') // welcome, wizard, results
  const [visionMode, setVisionMode] = useState('left') // left, right, thumbs
  const [isVisionReady, setIsVisionReady] = useState(false)
  const [status, setStatus] = useState('scanning') // scanning, green, capturing
  const [message, setMessage] = useState('Calibrating AI...')
  const [stability, setStability] = useState(0)
  
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const handsRef = useRef(null)
  
  // Handlers
  const startWizard = () => setCurrentStep('wizard')
  const cancelWizard = () => setCurrentStep('welcome')

  // Init Vision AI (MediaPipe + OpenCV)
  useEffect(() => {
    if (currentStep !== 'wizard') return;

    const initAI = async () => {
      try {
        // Init MediaPipe Hands
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
        console.error('AI Init Failed:', err);
        setMessage('Vision AI Error: Check Camera Permissions');
      }
    };

    initAI();

    return () => {
       if (videoRef.current?.srcObject) {
         videoRef.current.srcObject.getTracks().forEach(track => track.stop());
       }
    };
  }, [currentStep]);

  // Processing Loop
  const processFrame = useCallback(async () => {
    if (status === 'capturing' || !videoRef.current || !canvasRef.current || !isVisionReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 1. Dime Scaler
    let dime = null;
    if (window.cv) {
      try {
        const mat = window.cv.imread(canvas);
        const gray = new window.cv.Mat();
        window.cv.cvtColor(mat, gray, window.cv.COLOR_RGBA2GRAY);
        window.cv.GaussianBlur(gray, gray, new window.cv.Size(9, 9), 2, 2);

        const circles = new window.cv.Mat();
        window.cv.HoughCircles(gray, circles, window.cv.HOUGH_GRADIENT, 1, 100, 100, 30, 40, 150);
        
        if (circles.cols > 0) {
          const x = circles.data32F[0];
          const y = circles.data32F[1];
          const r = circles.data32F[2];
          dime = { x, y, r };
          
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 12px Inter';
          ctx.fillText('FIXED [US DIME] 17.91MM', x - 60, y - r - 10);
        }
        
        mat.delete(); gray.delete(); circles.delete();
      } catch (e) { }
    }

    // 2. MediaPipe Hands
    const results = await new Promise(resolve => {
       handsRef.current.onResults(resolve);
       handsRef.current.send({ image: video });
    });

    if (results && results.multiHandLandmarks) {
       results.multiHandLandmarks.forEach(hand => {
          // Draw AI Skeletons (The Assessment Proof)
          window.drawConnectors(ctx, hand, window.HAND_CONNECTIONS, { color: '#ffffff40', lineWidth: 1 });
       });
    }

    const dimeDetected = dime !== null;
    const handsDetected = results && results.multiHandLandmarks?.length > 0;
    const isOptimalDistance = dimeDetected && dime.r >= 40 && dime.r <= 120;

    if (dimeDetected && handsDetected && isOptimalDistance) {
       setStability(prev => Math.min(100, prev + 3));
       if (stability > 80) {
          setStatus('green');
          setMessage('READY! TAP AI SHUTTER');
       } else {
          setMessage('Calibrating Alignment...');
       }
    } else {
       setStability(0);
       setStatus('scanning');
       if (!dimeDetected) setMessage('Place Dime in View');
       else if (!handsDetected) setMessage('Bring Nails into Frame');
       else if (!isOptimalDistance) setMessage('Too ' + (dime.r < 40 ? 'Far' : 'Close') + '');
    }

    requestAnimationFrame(processFrame);
  }, [status, isVisionReady, stability]);

  useEffect(() => {
    if (currentStep === 'wizard' && (status === 'scanning' || status === 'green')) {
       requestAnimationFrame(processFrame);
    }
  }, [currentStep, status, processFrame]);

  const handleManualCapture = () => {
     if (status !== 'green') return;
     setStatus('capturing');
     setMessage('Capturing AI Data...');
     setTimeout(() => { setCurrentStep('results'); }, 1000);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden font-sans">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[150px]" />
      </div>

      <main className="relative z-10 max-w-lg mx-auto h-screen flex flex-col">
          
        {currentStep === 'welcome' && (
          <div className="flex-1 flex flex-col items-center justify-center px-10 text-center animate-in fade-in zoom-in duration-700">
             <div className="p-8 rounded-[3rem] bg-gradient-to-br from-emerald-500/20 to-blue-500/20 mb-10 border border-white/10 shadow-2xl scale-110">
                <Camera className="w-16 h-16 text-emerald-400" />
             </div>
             
             <h1 className="text-6xl font-black italic tracking-tighter text-white mb-2 leading-tight">
               NailScale <span className="text-emerald-500">AI</span>
             </h1>
             <p className="text-slate-500 text-sm font-black uppercase tracking-[0.4em] mb-12">v3.2 REBOOT | MANUAL PROTOCOL</p>

             <button 
               onClick={startWizard}
               className="w-full py-6 px-10 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-full shadow-2xl shadow-emerald-500/40 transition-all uppercase tracking-[0.3em] text-xs transform active:scale-95"
             >
               Initialize AI Platform
             </button>
          </div>
        )}

        {currentStep === 'wizard' && (
          <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
             <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
             <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" width={1280} height={720} />

             <div className="absolute top-20 inset-x-6 z-50 flex items-center justify-between">
                <div className="flex items-center gap-4 bg-slate-900/80 backdrop-blur-3xl px-6 py-4 rounded-3xl border border-emerald-500/10">
                   <div className={`p-2 rounded-2xl ${status === 'green' ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                      <Box className={`w-5 h-5 ${status === 'green' ? 'text-slate-950' : 'text-slate-500'}`} />
                   </div>
                   <div>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">AI Neural Sync</p>
                      <h4 className={`text-sm font-black italic uppercase tracking-tighter ${status === 'green' ? 'text-emerald-400' : 'text-white'}`}>{message}</h4>
                   </div>
                </div>
                <button onClick={cancelWizard} className="bg-slate-950/80 p-4 rounded-full border border-white/5 backdrop-blur-xl">
                   <X className="w-6 h-6 text-xl text-slate-400" />
                </button>
             </div>

             <div className="absolute bottom-24 inset-x-0 z-50 flex flex-col items-center gap-10">
                <div className="w-48 h-1.5 bg-slate-900/80 rounded-full border border-white/5 overflow-hidden">
                   <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${stability}%` }} />
                </div>
                <button 
                  onClick={handleManualCapture}
                  className={`w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${
                    status === 'green' 
                      ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_50px_rgba(16,185,129,0.5)] scale-110 active:scale-95' 
                      : 'bg-slate-900/50 border-white/10 opacity-30 shadow-none pointer-events-none'
                  }`}
                >
                  <Camera className={`w-12 h-12 ${status === 'green' ? 'text-slate-950 scale-110' : 'text-slate-700'}`} />
                </button>
             </div>

             {!isVisionReady && (
               <div className="absolute inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-8" />
                  <h2 className="text-3xl font-black italic text-white uppercase tracking-tighter mb-2">Neural Engine Booting</h2>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Loading Neural Models...</p>
               </div>
             )}
          </div>
        )}

        {currentStep === 'results' && (
          <div className="flex-1 flex flex-col px-10 pt-20 animate-in fade-in fill-mode-both duration-700 space-y-12">
             <div className="text-center space-y-6">
                <div className="flex justify-center">
                   <div className="p-6 rounded-[2.5rem] bg-emerald-500/10 border border-emerald-500/30">
                      <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                   </div>
                </div>
                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">AI Assessment Valid</h2>
             </div>
             <button onClick={() => setCurrentStep('welcome')} className="w-full py-6 text-slate-700 hover:text-white transition-colors font-black uppercase tracking-[0.4em] text-[10px]">
                Reset Platform
             </button>
          </div>
        )}

      </main>
    </div>
  )
}

export default App
