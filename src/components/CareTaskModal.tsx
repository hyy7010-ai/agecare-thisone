import React, { useState } from "react";
import { X, Camera, Mic, Send, Clock } from "lucide-react";
import { Resident } from "../types";
import { useLanguage } from "../contexts/LanguageContext";

interface CareTaskModalProps {
  resident: Resident;
  taskType: "bath" | "meal" | "toilet" | "blood_glucose" | string;
  onClose: () => void;
  onSave: (updates: any) => void;
}

export function CareTaskModal({ resident, taskType, onClose, onSave }: CareTaskModalProps) {
  const { t } = useLanguage();
  const [content, setContent] = useState("");
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toTimeString().slice(0, 5); // HH:MM
  });
  const [status, setStatus] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const taskOptions: Record<string, { label: string, options: { value: string, label: string, color: string }[] }> = {
    bath: {
      label: t('bath'),
      options: [
        { value: "done", label: t('done') || "Done", color: "green" },
        { value: "due", label: t('due') || "Due", color: "yellow" },
      ]
    },
    meal: {
      label: t('meal'),
      options: [
        { value: "eaten", label: t('eaten') || "Eaten", color: "green" },
        { value: "assisted", label: t('assisted') || "Assisted", color: "yellow" },
        { value: "missed", label: t('missed') || "Missed", color: "red" },
      ]
    },
    toilet: {
      label: t('toilet'),
      options: [
        { value: "independent", label: t('independent') || "Independent", color: "green" },
        { value: "assisted", label: t('assisted') || "Assisted", color: "yellow" },
        { value: "pad-change", label: t('pad-change' as any) || "Pad Changed", color: "red" },
      ]
    },
    blood_glucose: {
      label: "Blood Glucose",
      options: [
        { value: "normal", label: "Normal", color: "green" },
        { value: "high", label: "High", color: "red" },
        { value: "low", label: "Low", color: "red" },
      ]
    }
  };

  const currentTask = taskOptions[taskType] || { label: taskType, options: [] };

  const handleSave = () => {
    // Generate updates based on selection
    const updates: any = {};
    if (taskType === "bath") updates.bathStatus = status;
    if (taskType === "meal") updates.mealStatus = status;
    if (taskType === "toilet") updates.toiletStatus = status;
    
    // Pass note and time back
    updates.note = `[${time}] ${currentTask.label} - ${status}: ${content}`;
    updates.photoUrl = photoUrl;
    
    onSave(updates);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-xl text-slate-800">{resident.name} - {currentTask.label}</h3>
            <p className="text-sm text-slate-500 font-medium">Log Care Task</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Status Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700">Status</label>
            <div className="flex flex-wrap gap-2">
              {currentTask.options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                    status === opt.value 
                      ? opt.color === 'green' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                        : opt.color === 'yellow' ? 'bg-amber-50 border-amber-500 text-amber-700'
                        : 'bg-rose-50 border-rose-500 text-rose-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Time</label>
            <input 
              type="time" 
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-medium text-slate-700"
            />
          </div>

          {/* Notes & Actions */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-700">Notes (Optional)</label>
            <textarea 
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Add details like what they ate, mood, etc..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[100px] resize-none text-slate-700"
            />
          </div>
          
          <div className="flex items-center gap-3 mt-2">
              <label className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex justify-center items-center gap-2 transition-colors cursor-pointer active:scale-95">
               <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const url = URL.createObjectURL(e.target.files[0]);
                    setPhotoUrl(url);
                  }
               }} />
               <Camera className="w-5 h-5" /> {photoUrl ? "Photo Added" : "Photo"}
             </label>
             <button className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex justify-center items-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-95" onClick={handleSave} disabled={!status} style={{ opacity: !status ? 0.5 : 1, cursor: !status ? "not-allowed" : "pointer" }}>
               <Send className="w-5 h-5" /> Save
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
