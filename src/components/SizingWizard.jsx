import React, { useState } from 'react'
import { Camera, CheckCircle2, ChevronRight, X, Info } from 'lucide-react'
import CameraOverlay from './CameraOverlay'

const SizingWizard = ({ onFinish, onCancel }) => {
  const [step, setStep] = useState(1) // 1: Left Hand, 2: Right Hand, 3: Thumbs
  const [photos, setPhotos] = useState({})
  
  const steps = [
    { 
      id: 'left', 
      title: 'Left Hand (4 Fingers)', 
      desc: 'Place Index through Pinky inside the box with the Dime beside them.',
      icon: '🧤' 
    },
    { 
      id: 'right', 
      title: 'Right Hand (4 Fingers)', 
      desc: 'Flip and place your other hand next to the Dime.',
      icon: '🧤' 
    },
    { 
      id: 'thumbs', 
      title: 'Both Thumbs', 
      desc: 'Place both thumbs together with the Dime between them.',
      icon: '👍' 
    }
  ]

  const handleCapture = (photo) => {
    const currentStepId = steps[step - 1].id
    const newPhotos = { ...photos, [currentStepId]: photo }
    setPhotos(newPhotos)
    
    if (step < 3) {
      setStep(step + 1)
    } else {
      onFinish(newPhotos)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col pt-safe animate-in fade-in duration-500">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-lg">
            {steps[step - 1].icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">{steps[step - 1].title}</h3>
            <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Step {step} of 3</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-white/5 transition-colors">
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 relative">
        <CameraOverlay 
          isActive={true} 
          onCapture={handleCapture}
          mode={steps[step -1].id} // Pass mode to HUD
        />
        
        {/* Instructions Overlay (Bottom) */}
        <div className="absolute top-4 inset-x-6 z-10 glass-panel p-4 rounded-3xl border-emerald-500/20 bg-emerald-500/5 backdrop-blur-xl">
           <div className="flex gap-3">
             <div className="mt-0.5">
               <Info className="w-4 h-4 text-emerald-500" />
             </div>
             <p className="text-xs text-slate-300 leading-relaxed font-medium">
               {steps[step - 1].desc}
             </p>
           </div>
        </div>
      </div>

      {/* Progress Bar (Bottom) */}
      <div className="bg-slate-950 px-8 py-6 space-y-4">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
              step >= i ? 'bg-emerald-500' : 'bg-slate-800'
            }`} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default SizingWizard
