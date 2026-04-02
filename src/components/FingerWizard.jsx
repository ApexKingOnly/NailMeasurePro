import React, { useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Fingerprint } from 'lucide-react'
import CameraOverlay from './CameraOverlay'

const FINGERS = [
  { id: 'l1', label: 'Left Thumb', side: 'left', name: 'Thumb' },
  { id: 'l2', label: 'Left Index', side: 'left', name: 'Index' },
  { id: 'l3', label: 'Left Middle', side: 'left', name: 'Middle' },
  { id: 'l4', label: 'Left Ring', side: 'left', name: 'Ring' },
  { id: 'l5', label: 'Left Pinky', side: 'left', name: 'Pinky' },
  { id: 'r1', label: 'Right Thumb', side: 'right', name: 'Thumb' },
  { id: 'r2', label: 'Right Index', side: 'right', name: 'Index' },
  { id: 'r3', label: 'Right Middle', side: 'right', name: 'Middle' },
  { id: 'r4', label: 'Right Ring', side: 'right', name: 'Ring' },
  { id: 'r5', label: 'Right Pinky', side: 'right', name: 'Pinky' }
]

const FingerWizard = ({ onFinish, onCancel }) => {
  const [step, setStep] = useState(0)
  const [results, setResults] = useState({})
  const [showCamera, setShowCamera] = useState(false)
  const [currentPhoto, setCurrentPhoto] = useState(null)

  const currentFinger = FINGERS[step]

  const handleCapture = (photo) => {
    setCurrentPhoto(photo)
    setShowCamera(false)
  }

  const handleConfirm = () => {
    const newResults = {
      ...results,
      [currentFinger.id]: {
        photo: currentPhoto,
        widthMM: 12.5 + Math.random() * 5 // Mock width for now
      }
    }
    setResults(newResults)
    setCurrentPhoto(null)
    
    if (step < FINGERS.length - 1) {
      setStep(prev => prev + 1)
    } else {
      onFinish(newResults)
    }
  }

  return (
    <div className="space-y-8 mt-4">
      {/* Progress Header */}
      <div className="flex items-center justify-between px-2">
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 px-8">
          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500" 
              style={{ width: `${((step + 1) / FINGERS.length) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 text-center uppercase tracking-widest font-bold">
            Step {step + 1} of {FINGERS.length}
          </p>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {!showCamera && !currentPhoto ? (
        <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse" />
            <div className="relative p-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 glass-panel">
              <Fingerprint className="w-16 h-16 text-emerald-500" />
            </div>
          </div>
          
          <div className="space-y-2 px-4">
            <h2 className="text-2xl font-bold text-white leading-tight">
              Capture your <br/>
              <span className="text-emerald-500">{currentFinger.label}</span>
            </h2>
            <p className="text-slate-400 text-sm">
              Place your {currentFinger.name.toLowerCase()} next to the US Dime on a flat surface.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-3xl space-y-4 text-left border-white/5 mx-2">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-slate-400">1</div>
              <p className="text-sm text-slate-300">Align the Dime inside the <span className="text-white font-bold">Inner Circle</span>.</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-slate-400">2</div>
              <p className="text-sm text-slate-300">Place your finger inside the <span className="text-white font-bold">Dashed Box</span>.</p>
            </div>
          </div>

          <button
            onClick={() => setShowCamera(true)}
            className="w-full py-4 px-6 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded-2xl transition-all transform hover:scale-[1.02] shadow-xl"
          >
            Open Camera
          </button>
        </div>
      ) : showCamera ? (
        <div className="animate-in fade-in zoom-in-95 duration-500">
          <CameraOverlay isActive={showCamera} onCapture={handleCapture} />
          <button 
            onClick={() => setShowCamera(false)}
            className="w-full mt-6 py-4 px-6 bg-slate-900 text-slate-400 font-medium rounded-2xl border border-white/5"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative group">
             <img 
              src={currentPhoto} 
              alt="Captured" 
              className="w-full aspect-[3/4] object-cover rounded-[2.5rem] border-2 border-emerald-500/50 shadow-2xl scale-x-[-1]"
            />
            <div className="absolute inset-0 rounded-[2.5rem] border-2 border-emerald-500 shadow-emerald-500/20" />
            <div className="absolute top-6 right-6 p-2 rounded-full bg-emerald-500 text-slate-950">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="px-4 text-center space-y-4">
            <h3 className="text-xl font-bold">Perfect Shot!</h3>
            <p className="text-slate-400 text-sm">Review your photo. Make sure the Dime and Fingernail are clearly visible.</p>
            
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setCurrentPhoto(null)}
                className="flex-1 py-4 px-6 bg-slate-900 text-slate-300 font-bold rounded-2xl border border-white/5 hover:bg-slate-800 transition-all"
              >
                Retake
              </button>
              <button
                onClick={handleConfirm}
                className="flex-[2] py-4 px-6 bg-emerald-500 text-slate-950 font-bold rounded-2xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                Next Finger <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnails of Progress */}
      {Object.keys(results).length > 0 && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[calc(100%-2rem)] py-2 no-scrollbar">
          {FINGERS.map((f) => {
            const hasRes = !!results[f.id];
            return (
              <div 
                key={f.id}
                className={`w-10 h-14 rounded-lg flex-shrink-0 border transition-all ${
                  hasRes ? 'border-emerald-500 bg-emerald-500/10' : 
                  f.id === currentFinger.id ? 'border-white/40 bg-white/5 animate-pulse' : 'border-white/5 bg-slate-950 opacity-40'
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  )
}

export default FingerWizard
