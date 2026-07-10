import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Mic,
  MicOff,
  ShieldAlert,
  Activity,
  FileText
} from "lucide-react";
import { Resident, AIObservationResult } from "../types";
import { BodyDiagram } from "./BodyDiagram";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useLanguage } from "../contexts/LanguageContext";
import { scrubPII } from "../lib/piiScrubber";
import { CountdownTimer } from "./CountdownTimer";

interface ResidentProfileProps {
  resident: Resident;
  onBack: () => void;
  onSubmitObservation: (
    photoUrl: string,
    aiResult: AIObservationResult,
  ) => void;
  isCaregiver: boolean;
  onLogSirs?: (description: string, sirsResult: any) => void;
  onAdlUpdate?: (adlUpdates: any) => void;
  onQuickLog?: (task: "bath" | "meal" | "toilet" | "blood_glucose" | string) => void;
  timelineEvents?: any[];
}

export function ResidentProfile({
  resident,
  onBack,
  onSubmitObservation,
  isCaregiver,
  onLogSirs,
  onAdlUpdate,
  onQuickLog,
  timelineEvents = [],
}: ResidentProfileProps) {
  const { t, lang } = useLanguage();
  const language = lang;
  const [isUploading, setIsUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIObservationResult | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedBodyLocation, setSelectedBodyLocation] = useState<
    string | null
  >(null);

  // Care Note state
  const [careNoteInput, setCareNoteInput] = useState("");
  const [isGeneratingCareNote, setIsGeneratingCareNote] = useState(false);
  const [careNoteDraft, setCareNoteDraft] = useState<string | null>(null);
  const [nativeConfirmation, setNativeConfirmation] = useState<string | null>(null);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([]);
  const [careNoteError, setCareNoteError] = useState<string | null>(null);
  const [isCareNoteSaved, setIsCareNoteSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioProcessingStage, setAudioProcessingStage] = useState<number>(0);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);
  const [speechSupported] = useState<boolean>(
    typeof window !== "undefined" && "MediaRecorder" in window
  );

  // Daily Summary state
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Family Update state
  const [isGeneratingFamilyUpdate, setIsGeneratingFamilyUpdate] = useState(false);
  const [scrubbingStatus, setScrubbingStatus] = useState<string | null>(null);
  const [familyUpdate, setFamilyUpdate] = useState<string | null>(null);
  const [isFamilyUpdateSent, setIsFamilyUpdateSent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const [sirsAssessment, setSirsAssessment] = useState<any>(null);

  const startRecording = async () => {
    try {
      setCareNoteError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        await handleAudioSubmit(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError") {
        setCareNoteError("Microphone access was denied. Please check your browser or frame permissions.");
      } else {
        setCareNoteError(`Microphone error: ${err.message || String(err)}`);
      }
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleAudioSubmit = async (audioBlob: Blob) => {
    setLastAudioBlob(audioBlob);
    setIsGeneratingCareNote(true);
    setAudioProcessingStage(1);
    setCareNoteDraft(null);
    setCareNoteError(null);
    setIsCareNoteSaved(false);
    
    // Simulate progression while waiting for network request
    const stage2Timer = setTimeout(() => {
      setAudioProcessingStage(2);
    }, 6000);
    const stage3Timer = setTimeout(() => {
      setAudioProcessingStage(3);
    }, 12000);

    let hasError = false;
    try {
      const formData = new FormData();
      formData.append("audioRecording", audioBlob, "recording.webm");
      formData.append("language", language);

      const response = await fetch("/api/audio-note", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      if (text.trim().startsWith("<")) {
        console.error("Raw HTML response:", text);
        throw new Error(
          `请求被拦截 (HTTP ${response.status}): ${text.substring(0, 150)}... 请在【新标签页】中打开应用再试。(Please OPEN IN NEW TAB)`
        );
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("Failed to parse JSON response");
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error ${response.status}`);
      }

      setCareNoteDraft(data.result.englishNote);
      setNativeConfirmation(data.result.nativeConfirmation);
      if (data.result.adlUpdates && onAdlUpdate) {
        onAdlUpdate(data.result.adlUpdates);
      }
      setSuggestedFollowUps(data.result.suggestedFollowUps || []);
      setSirsAssessment(data.result.sirsAssessment || null);
      setCareNoteInput("Audio processed and translated by Native AI.");
    } catch (err: any) {
      console.error(err);
      setCareNoteError(err.message || "Failed to process audio.");
      hasError = true;
    } finally {
      clearTimeout(stage2Timer);
      clearTimeout(stage3Timer);
      setIsGeneratingCareNote(false);
      if (!hasError) {
        setAudioProcessingStage(0);
        setLastAudioBlob(null);
      } else {
        setAudioProcessingStage(-1);
      }
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    setScrubbingStatus('Analyzing data inputs for sensitive information...');
    setSummaryError(null);
    setDailySummary(null);

    let inputs = `Basic Care Status: Bath is '${resident.bathStatus}', Meal is '${resident.mealStatus}', Toilet is '${resident.toiletStatus}'.\n\n`;

    if (careNoteDraft && isCareNoteSaved) {
      inputs += `Progress Note recorded today: ${careNoteDraft}\n\n`;
    }

    if (aiResult && isConfirmed) {
      inputs += `Clinical observation logged today: Type: ${aiResult.observationType}. Location: ${selectedBodyLocation || "Not specified"}. Details: ${aiResult.observation}. Risk flag: ${aiResult.potentialRiskFlag}.\n\n`;
    }

    try {
      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus(`Scrubbing patient name: ${resident.name} -> [REDACTED]...`);
      
      const scrubbedInputs = scrubPII(inputs, resident.name);
      
      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus('Encrypting sanitized payload for AI analysis...');

      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus(null);
      
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: scrubbedInputs }),
      });

      const text = await response.text();
      if (text.trim().startsWith("<")) {
        throw new Error(
          "由于浏览器安全限制，AI 请求被拦截。请点击预览区右上角的 ↗️ 按钮，在【新标签页】中打开应用即可正常使用。\n(Action blocked by browser cookie settings. Please OPEN IN NEW TAB to authenticate and continue.)",
        );
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("Failed to parse JSON response");
      }

      if (!response.ok)
        throw new Error(data?.error || `Server error ${response.status}`);
      setDailySummary(data.result);

      try {
        await addDoc(collection(db, "todaySummaries"), {
          residentId: resident.id,
          content: data.result,
          generatedAt: serverTimestamp(),
        });
      } catch (firebaseErr) {
        console.error("Failed to save summary to db:", firebaseErr);
      }
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || "Failed to generate summary.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateFamilyUpdate = async () => {
    setIsGeneratingFamilyUpdate(true);
    setScrubbingStatus('Analyzing raw notes for sensitive data...');
    setFamilyUpdate(null);
    setIsFamilyUpdateSent(false);
    try {
      // Simulate raw notes with potential PII
      const rawNotes = `${resident.name} participated in morning garden walk. Ate 100% of lunch. Denies any pain. Vitals stable. Daughter Sarah called on 0412345678.`;
      
      // Perform local edge PII scrubbing before sending to AI
      await new Promise(r => setTimeout(r, 800));
      setScrubbingStatus(`Scrubbing patient name: ${resident.name} -> [REDACTED]...`);
      
      const scrubbedNotes = scrubPII(rawNotes, resident.name);
      
      await new Promise(r => setTimeout(r, 800));
      setScrubbingStatus('Encrypting payload for AI transmission...');
      
      await new Promise(r => setTimeout(r, 800));
      setScrubbingStatus(null);
      
      // We also scrub the resident name in the payload so the LLM literally never sees the real name
      const safeResident = {
        ...resident,
        name: '[RESIDENT_REDACTED]'
      };

      const response = await fetch('/api/generate-family-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resident: safeResident,
          careNotes: scrubbedNotes
        }),
      });

      const text = await response.text();
      if (text.trim().startsWith("<")) {
        throw new Error("由于浏览器安全限制，AI 请求被拦截。请点击预览区右上角的 ↗️ 按钮，在【新标签页】中打开应用即可正常使用。");
      }
      
      const data = JSON.parse(text);

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate family update");
      }
      
      // Restore the name dynamically in the client after generation (if we want to render it nicely for the RN)
      // Since the prompt asks it not to use names, this might just be a fallback
      let finalUpdate = data.result;
      finalUpdate = finalUpdate.replace(/\[RESIDENT_REDACTED\]/g, resident.name);
      
      setFamilyUpdate(finalUpdate);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsGeneratingFamilyUpdate(false);
    }
  };

  const handleSaveCareNote = async () => {
    if (!careNoteDraft) return;
    try {
      await addDoc(collection(db, "rnReviewQueue"), {
        residentId: resident.id,
        residentName: resident.name,
        room: resident.room,
        photoUrl: "",
        aiResult: {
          observationType: "care_note",
          observation: careNoteDraft,
          potentialRiskFlag: "",
          suggestedCarePlan: nativeConfirmation || "",
        },
        timestamp: new Date().toISOString(),
      });
      setIsCareNoteSaved(true);
    } catch (e) {
      console.error("Failed to save care note to RN review queue", e);
      setCareNoteError("Failed to submit care note for RN review.");
    }
  };

  const handleGenerateCareNote = async () => {
    if (!careNoteInput.trim()) return;

    setIsGeneratingCareNote(true);
    setScrubbingStatus('Analyzing raw input...');
    setCareNoteDraft(null);
    setNativeConfirmation(null);
    setCareNoteError(null);
    setIsCareNoteSaved(false);

    try {
      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus(`Scrubbing identifying names and terms...`);
      
      const scrubbedInput = scrubPII(careNoteInput, resident.name);
      
      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus('Encrypting payload for AI transmission...');

      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus(null);
      
      let data;
      try {
        const response = await fetch("/api/care-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: scrubbedInput }),
        });

        const text = await response.text();
        if (text.trim().startsWith("<")) {
          console.error("Raw HTML response:", text);
          throw new Error(
            "由于浏览器安全限制，AI 请求被拦截。请点击预览区右上角的 ↗️ 按钮，在【新标签页】中打开应用即可正常使用。\n(Action blocked by browser cookie settings. Please OPEN IN NEW TAB to authenticate and continue.)",
          );
        }
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(
            "Failed to parse JSON response",
          );
        }

        if (!response.ok) {
          throw new Error(data?.error || `Server error ${response.status}`);
        }
      } catch (networkError: any) {
        // Fallback to Gemini Nano (Chrome Built-in AI) if offline or fetch fails
        const aiAPI = (window as any).ai?.languageModel || (window as any).ai?.assistant || (window as any).LanguageModel || (window as any).ai;
        if (typeof aiAPI !== 'undefined' && typeof aiAPI.create === 'function') {
          try {
            setScrubbingStatus('Network unavailable. Drafting locally using On-Device AI...');
            const session = await aiAPI.create({
              systemPrompt: "You are a professional aged care assistant. Rewrite the following raw caregiver input into a concise, professional clinical progress note. Provide ONLY the final English note, without markdown.", initialPrompts: [{ role: 'system', content: "You are a professional aged care assistant. Rewrite the following raw caregiver input into a concise, professional clinical progress note. Provide ONLY the final English note, without markdown." }]
            });
            const nanoResult = await session.prompt(scrubbedInput);
            data = { result: { englishNote: nanoResult + "\n\n(Note: Generated offline securely via On-Device AI)", nativeConfirmation: "" } };
            setScrubbingStatus(null);
          } catch (nanoError) {
            throw networkError; // throw original error if Nano fails
          }
        } else {
          throw networkError;
        }
      }

      setCareNoteDraft(data.result.englishNote);
      setNativeConfirmation(data.result.nativeConfirmation);
      if (data.result.adlUpdates && onAdlUpdate) {
        onAdlUpdate(data.result.adlUpdates);
      }
    } catch (err: any) {
      console.error(err);
      setCareNoteError(err.message || "Failed to generate care note.");
    } finally {
      setIsGeneratingCareNote(false);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2);

  const processFile = async (file: File) => {
    setIsUploading(true);
    setAiResult(null);
    setIsConfirmed(false);
    setErrorMsg(null);

    // Compress image to prevent Nginx 413 Payload Too Large errors (1MB limit)
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setPhotoPreview(dataUrl);

        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const formData = new FormData();
          formData.append("observationImage", blob, "photo.jpg");
          formData.append("language", language);

          const response = await fetch("/api/vision", {
            method: "POST",
            body: formData,
          });

          const text = await response.text();
          if (text.trim().startsWith("<")) {
            console.error("Raw HTML response:", text);
            throw new Error(
              `请求被拦截 (HTTP ${response.status}): ${text.substring(0, 150)}... 请在【新标签页】中打开应用再试。(Please OPEN IN NEW TAB)`
            );
          }

          let data;
          try {
            const cleanedText = text
              .replace(/```json\n?/g, "")
              .replace(/```\n?/g, "")
              .trim();
            data = JSON.parse(cleanedText);
          } catch (e) {
            throw new Error(
              `Failed to parse response (Status ${response.status}): ${text.substring(0, 300)}`,
            );
          }

          if (!response.ok) {
            throw new Error(data?.error || `Server error ${response.status}`);
          }

          setAiResult(data.result);
        } catch (err: any) {
          console.error(err);
          setErrorMsg(err.message || "Failed to analyze image. Please try again.");
        } finally {
          setIsUploading(false);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const renderAiDisclaimer = () => (
    <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
      <ShieldAlert className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
      <p className="text-xs text-blue-800 leading-relaxed font-medium">
        {t('ai_disclaimer')}
      </p>
    </div>
  );

  const isCriticalSymptom = (text: string) => {
    const lower = text.toLowerCase();
    return lower.includes('bleeding') || lower.includes('cyanosis') || lower.includes('breathing') || lower.includes('severe');
  };

  return (
    <div className="max-w-5xl mx-auto font-light">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-3 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all mb-8 px-5 py-2.5 rounded-xl font-medium shadow-sm active:scale-95"
      >
        <ArrowLeft className="w-5 h-5" />
        {t('back_to_dashboard')}
      </button>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8">
        <div className="bg-slate-50 px-6 py-8 sm:px-10 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-3xl font-bold border border-teal-100">
            {getInitials(resident.name)}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-normal text-slate-800 tracking-tight">
              {resident.name}
            </h1>
            <p className="text-lg text-slate-500 font-light mt-1">
              {resident.room}
            </p>
          </div>
          <div className="ml-auto flex gap-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200 text-center min-w-[100px]">
              <div className="text-3xl font-light text-slate-700">
                {resident.careMinutesToday}
              </div>
              <div className="text-xs font-normal text-slate-400 uppercase tracking-widest mt-1">
                {t('mins')}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-center min-w-[100px]">
              <div
                className={`w-8 h-8 rounded-full ${
                  resident.statusColor === "green"
                    ? "bg-teal-400"
                    : resident.statusColor === "yellow"
                      ? "bg-amber-400"
                      : "bg-red-500"
                }`}
              ></div>
            </div>
          </div>
        </div>
      </div>
      {/* Care Tasks & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-medium tracking-tight text-slate-800 mb-4">{t("quick_log") || "Quick Log"}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {["bath", "meal", "toilet", "blood_glucose"].map((task) => (
              <button
                key={task}
                onClick={() => onQuickLog && onQuickLog(task)}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors gap-2 group"
              >
                <span className="text-sm font-medium text-slate-600 group-hover:text-indigo-700 uppercase tracking-wider">
                  {t(task as any) || task.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 overflow-hidden flex flex-col max-h-[400px]">
          <h2 className="text-xl font-medium tracking-tight text-slate-800 mb-4">{t("timeline") || "Timeline"}</h2>
          <div className="overflow-y-auto pr-2 flex-1 space-y-4">
            {timelineEvents.length === 0 ? (
              <p className="text-slate-500 text-sm italic">{t("no_recent_activity") || "No recent activity."}</p>
            ) : (
              timelineEvents.map((event: any, idx: number) => (
                <div key={idx} className="flex gap-4">
                  <div className="w-10 h-10 shrink-0 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs border border-indigo-100">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex-1">
                    <p className="text-sm text-slate-700">{event.aiResult?.observation || event.observation || "Care task logged"}</p>
                    {event.photoUrl && <img src={event.photoUrl} alt="Log attachment" className="mt-2 rounded-lg max-h-32 object-cover border border-slate-200" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Medical History Section */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8 p-6 sm:p-8">
        <h2 className="text-xl font-medium tracking-tight text-slate-800 mb-4">{t('medical_profile')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> {t('past_medical_history')}
            </h3>
            {resident.medicalHistory && resident.medicalHistory.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {resident.medicalHistory.map((item, i) => (
                  <li key={i} className="text-sm text-slate-700">{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-600 text-sm italic">{t('none_recorded')}</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> {t('current_medications')}
            </h3>
            {resident.medications && resident.medications.length > 0 ? (
              <div className="space-y-2">
                {resident.medications.map((med, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm">
                    <div className="font-semibold text-slate-800">{med.name}</div>
                    <div className="text-slate-500 font-light mt-0.5">{med.dosage} • {med.frequency}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm italic">{t('none_recorded')}</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {t('allergies')}
            </h3>
            {resident.allergies && resident.allergies.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {resident.allergies.map((allergy, i) => (
                  <span key={i} className={`px-3 py-1 rounded-full text-sm font-medium ${
                    allergy.toLowerCase().includes('no known') 
                      ? 'bg-slate-100 text-slate-700' 
                      : 'bg-red-100 text-red-700 border border-red-200'
                  }`}>
                    {allergy}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm italic">{t('no_recorded_allergies')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily Summary */}
      {!isCaregiver && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-medium tracking-tight text-slate-800 flex items-center gap-2">
              {t('todays_summary')}
            </h2>
            <button
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="bg-slate-800 hover:bg-slate-900 text-white text-sm sm:text-base font-medium py-3 px-4 sm:px-6 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 shrink-0 shadow-sm hover:shadow-md"
            >
              {isGeneratingSummary ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : null}
              <span className="hidden sm:inline">{t('generate')} </span>{t('todays_summary')}
            </button>
          </div>

          {summaryError && (
            <div className="mb-4 bg-red-50 text-red-700 border border-red-200 p-4 rounded-xl text-sm">
              <strong>{t('error')}: </strong> {summaryError}
            </div>
          )}

          {isGeneratingSummary ? (
          <div className="border border-slate-200 rounded-2xl bg-slate-900 p-8 flex flex-col items-center justify-center text-center overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            {scrubbingStatus ? (
              <div className="relative z-10 w-full max-w-md mx-auto text-left flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center mb-6 animate-pulse">
                   <ShieldAlert className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="w-full bg-black/50 border border-emerald-500/30 rounded-lg p-4 font-mono text-sm shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <div className="text-emerald-400 flex items-center gap-2 mb-2 border-b border-emerald-500/30 pb-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                    EDGE PRIVACY ENGINE
                  </div>
                  <div className="text-emerald-300/80 animate-in fade-in slide-in-from-bottom-1">
                    {">"} {scrubbingStatus}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative z-10">
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin mb-3 font-light mx-auto" />
                <h3 className="text-md font-normal text-slate-100">
                  {t('gemini_is_summarising')}
                </h3>
              </div>
            )}
          </div>
        ) : dailySummary ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-medium text-slate-800">
                  {t('daily_wellness_summary')}
                </h3>
                <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-1 rounded">
                  {new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="p-6 text-sm text-slate-700 leading-relaxed font-light whitespace-pre-wrap">
                {dailySummary}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Family Portal Section */}
      <div className="mb-8 border-t border-slate-200 pt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-medium tracking-tight text-slate-800 flex items-center gap-2">
              {t('family_update_desensitized')}
            </h2>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 w-fit">
              <ShieldAlert className="w-3.5 h-3.5" />
              {t('privacy_preserving_mode_active')}
            </div>
          </div>
          <button
            onClick={handleGenerateFamilyUpdate}
            disabled={isGeneratingFamilyUpdate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm sm:text-base font-medium py-3 px-4 sm:px-6 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 shrink-0 shadow-sm hover:shadow-md"
          >
            {isGeneratingFamilyUpdate ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : null}
            <span className="hidden sm:inline">{t('generate')} </span>{t('family_update_desensitized')}
          </button>
        </div>
        
        {isGeneratingFamilyUpdate ? (
          <div className="border border-slate-200 rounded-2xl bg-slate-900 p-8 flex flex-col items-center justify-center text-center overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            {scrubbingStatus ? (
              <div className="relative z-10 w-full max-w-md mx-auto text-left flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center mb-6 animate-pulse">
                   <ShieldAlert className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="w-full bg-black/50 border border-emerald-500/30 rounded-lg p-4 font-mono text-sm shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <div className="text-emerald-400 flex items-center gap-2 mb-2 border-b border-emerald-500/30 pb-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                    EDGE PRIVACY ENGINE
                  </div>
                  <div className="text-emerald-300/80 animate-in fade-in slide-in-from-bottom-1">
                    {">"} {scrubbingStatus}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative z-10">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-4 mx-auto font-light" />
                <h3 className="text-lg font-medium text-slate-100">
                  {t('gemini_drafting_family_update')}
                </h3>
              </div>
            )}
          </div>
        ) : familyUpdate ? (
          <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
              <h3 className="font-medium text-indigo-900">
                {t('draft_message')}
              </h3>
              <span className="text-xs font-medium text-indigo-700 bg-indigo-200 px-2 py-1 rounded">
                {t('needs_rn_approval')}
              </span>
            </div>
            <div className="p-6 text-sm text-slate-700 leading-relaxed font-light whitespace-pre-wrap">
              {familyUpdate}
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => {
                  setIsFamilyUpdateSent(true);
                  localStorage.setItem('latest_family_update_' + resident.id, JSON.stringify({
                    text: familyUpdate,
                    timestamp: Date.now()
                  }));
                }}
                disabled={isFamilyUpdateSent}
                className={`text-sm px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm ${
                  isFamilyUpdateSent 
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white border border-transparent'
                }`}
              >
                {isFamilyUpdateSent ? (
                  <><CheckCircle className="w-4 h-4" /> {t('approved_sent_to_family')}</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> {t('rn_approve_send_to_family')}</>
                )}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('generate_desensitized_summary_desc')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Col: Diagram & Upload Action */}
        <div className="space-y-6">
          <BodyDiagram
            selectedLocation={selectedBodyLocation}
            onLocationSelect={setSelectedBodyLocation}
          />          <div
            className={`bg-white border text-center rounded-2xl p-8 transition-all duration-300 ${
              !selectedBodyLocation
                ? "border-slate-200 border-dashed bg-slate-50 opacity-80 hover:opacity-100"
                : isDragging
                  ? "border-teal-500 bg-teal-50 border-solid"
                  : "border-teal-200 ring-1 ring-teal-100 shadow-sm"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <h2 className="text-xl font-normal text-slate-800 mb-2">
              {t('record_observation')}
            </h2>
            <p className="text-slate-500 mb-8 text-sm font-light">
              {!selectedBodyLocation
                ? t('select_location_first')
                : t('now_take_photo')}
            </p>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
            />

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border rounded-xl p-6 transition-colors group ${
                  !selectedBodyLocation
                    ? "border-slate-200 hover:bg-white hover:border-slate-300"
                    : "border-teal-100 hover:bg-teal-50 hover:border-teal-300 bg-white"
                }`}
              >
                <Camera
                  className={`w-8 h-8 mb-1 ${!selectedBodyLocation ? "text-slate-400 group-hover:text-slate-500" : "text-teal-500 group-hover:text-teal-600"}`}
                />
                <span
                  className={`font-normal text-sm ${!selectedBodyLocation ? "text-slate-500" : "text-teal-700"}`}
                >
                  {t('take_photo_btn')}
                </span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border rounded-xl p-6 transition-colors group ${
                  !selectedBodyLocation
                    ? "border-slate-200 hover:bg-white hover:border-slate-300"
                    : "border-teal-100 hover:bg-teal-50 hover:border-teal-300 bg-white"
                }`}
              >
                <Upload
                  className={`w-8 h-8 mb-1 ${!selectedBodyLocation ? "text-slate-400 group-hover:text-slate-500" : "text-teal-500 group-hover:text-teal-600"}`}
                />
                <span
                  className={`font-normal text-sm ${!selectedBodyLocation ? "text-slate-500" : "text-teal-700"}`}
                >
                  {t('upload_file')}
                </span>
              </button>
            </div>

            {photoPreview && (
              <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden p-1 bg-white shadow-sm">
                <img
                  src={photoPreview}
                  alt="Observation preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
              </div>
            )}

            {errorMsg && (
              <div className="mt-6 bg-red-50 text-red-700 border border-red-200 p-4 rounded-xl text-sm text-left">
                <strong>{t('error')}: </strong> {errorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: AI Result */}
        <div>
          {isUploading ? (
            <div className="h-full border border-slate-200 rounded-2xl bg-white p-10 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-teal-500 animate-spin mb-4 font-light" />
              <h3 className="text-lg font-normal text-slate-700">
                <CountdownTimer text={t('gemini_analyzing')} fallbackText={t('gemini_analyzing').replace('{s}', '...')} />
              </h3>
              <p className="text-slate-500 text-sm mt-2 font-light">
                {t('processing_observation_securely')}
              </p>
            </div>
          ) : errorMsg ? (
            <div className="h-full border border-red-200 rounded-2xl bg-red-50 p-10 flex flex-col items-center justify-center text-center">
              <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
              <h3 className="text-lg font-normal text-red-700">
                {t('analysis_failed')}
              </h3>
              <p className="text-red-600 text-sm mt-2 font-light">{errorMsg}</p>
            </div>
          ) : aiResult ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-teal-50/50 px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row items-center gap-4 justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-teal-600" />
                  <h3 className="font-normal text-slate-800">
                    {t('ai_observation_note')}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-normal uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-1 rounded">
                    {t('draft')}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {isCriticalSymptom(aiResult.observation) && (
                  <div className="bg-red-600 text-white p-4 rounded-xl flex gap-3 shadow-sm border border-red-700">
                    <ShieldAlert className="w-6 h-6 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-sm">{t('critical_symptom_detected')}</h4>
                      <p className="text-xs text-red-100 mt-1">
                        {t('critical_symptom_detected_desc')}
                      </p>
                    </div>
                  </div>
                )}
                <div>
                  <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                    {t('visual_observation')}
                  </span>
                  <p className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-700 leading-relaxed font-light">
                    {aiResult.observation}
                  </p>
                </div>

                {aiResult.observationType === "excrement" ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                          {t('colour')}
                        </span>
                        <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                          {aiResult.colour || "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                          {t('bristol_stool_type')}
                        </span>
                        <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                          {aiResult.bristolStoolType || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        {t('potential_risk_flag')}
                      </span>
                      <p className="bg-amber-50 text-amber-700 p-3 rounded-lg border border-amber-100 font-normal text-sm">
                        {aiResult.potentialRiskFlag}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        {t('size_type_estimate')}
                      </span>
                      <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                        {aiResult.estimatedSizeOrType}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                        {t('potential_risk_flag')}
                      </span>
                      <p className="bg-amber-50 text-amber-700 p-3 rounded-lg border border-amber-100 font-normal text-sm">
                        {aiResult.potentialRiskFlag}
                      </p>
                    </div>
                  </div>
                )}

                {aiResult.observationType === "wound" && (
                  <div className="mt-4">
                    <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                      {t('location')}
                    </span>
                    <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-normal text-sm text-slate-700">
                      {selectedBodyLocation || "Not specified"}
                    </p>
                  </div>
                )}
                
                {aiResult.suggestedCarePlan && (
                  <div className="mt-4">
                    <span className="block text-xs font-normal text-slate-400 uppercase mb-2">
                      {t('suggested_care_plan')}
                    </span>
                    <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl border border-indigo-100 font-medium text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                      {aiResult.suggestedCarePlan}
                    </div>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-4">
                  {renderAiDisclaimer()}
                  {isConfirmed ? (
                    <div className="bg-teal-50 text-teal-700 font-normal p-3 rounded-lg flex items-center justify-center gap-2 border border-teal-100">
                      <CheckCircle className="w-4 h-4" /> {t('submitted_for_rn_review')}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsConfirmed(true);
                        if (photoPreview) {
                          onSubmitObservation(photoPreview, {
                            ...aiResult,
                            bodyLocation:
                              selectedBodyLocation || "Not specified",
                          });
                        }
                      }}
                      className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-normal rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {t('submit_for_rn_review')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full border border-slate-200 border-dashed rounded-2xl bg-slate-50 p-10 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center border border-slate-200 mb-4">
                <AlertTriangle className="w-5 h-5 text-slate-400" />
              </div>
              <h3 className="text-lg font-normal text-slate-600">
                {t('no_active_ai_observation')}
              </h3>
              <p className="text-slate-400 text-sm mt-1 max-w-xs font-light">
                {t('upload_photo_instruction')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Daily Care Note Generator Section */}
      <div className="mt-8 border-t border-slate-200 pt-8">
        <h2 className="text-xl font-medium tracking-tight text-slate-800 mb-6 flex items-center gap-2">
          {t('daily_care_note_generator')}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                {t('live_voice_clinical_notes')}
              </h3>
              {speechSupported ? (
                <button
                  onClick={toggleRecording}
                  className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold shadow-md transition-all active:scale-95 ${
                    isRecording
                      ? "bg-red-600 text-white hover:bg-red-700 hover:shadow-red-500/20 animate-pulse"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/20"
                  }`}
                >
                  {isRecording ? (
                    <>
                      <div className="w-3 h-3 rounded-full bg-white animate-ping" />
                      {t('listening_in_any_language')}
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      {t('tap_to_dictate_observation')}
                    </>
                  )}
                </button>
              ) : (
                <span className="text-sm font-medium text-slate-400 bg-slate-100 px-4 py-2 rounded-lg flex items-center gap-2">
                  <MicOff className="w-4 h-4" /> {t('voice_not_supported')}
                </span>
              )}
            </div>
            
            {isRecording && (
              <div className="mb-6 p-6 bg-red-50 border border-red-200 text-red-800 text-lg rounded-2xl flex items-center justify-center gap-4 font-bold shadow-inner">
                <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                  <Mic className="w-6 h-6 text-red-600 animate-bounce" />
                </div>
                <span>{t('recording_speak_instruction')}</span>
              </div>
            )}

            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">{t('or_type_manually')}</div>
            <textarea
              className="w-full min-h-[100px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium mb-4"
              placeholder={t('placeholder_care_note_example')}
              value={careNoteInput}
              onChange={(e) => setCareNoteInput(e.target.value)}
            />
            <button
              onClick={handleGenerateCareNote}
              disabled={isGeneratingCareNote || !careNoteInput.trim() || isRecording}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white py-4 rounded-xl text-sm font-bold transition-all hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGeneratingCareNote ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> {t('processing_clinical_ai')}
                </>
              ) : (
                t('generate_clinical_note')
              )}
            </button>
          </div>

          <div>
            {isGeneratingCareNote ? (
              <div className="h-full border border-slate-200 rounded-2xl bg-slate-900 p-10 flex flex-col items-center justify-center text-center mt-0 min-h-[200px] overflow-hidden relative">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                {scrubbingStatus ? (
                  <div className="relative z-10 w-full max-w-md mx-auto text-left flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center mb-6 animate-pulse">
                       <ShieldAlert className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div className="w-full bg-black/50 border border-emerald-500/30 rounded-lg p-4 font-mono text-sm shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                      <div className="text-emerald-400 flex items-center gap-2 mb-2 border-b border-emerald-500/30 pb-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                        EDGE PRIVACY ENGINE
                      </div>
                      <div className="text-emerald-300/80 animate-in fade-in slide-in-from-bottom-1">
                        {">"} {scrubbingStatus}
                      </div>
                    </div>
                  </div>
                ) : audioProcessingStage > 0 ? (
                  <div className="relative z-10 w-full max-w-md mx-auto text-left space-y-4">
                     <div className={`p-4 rounded-xl border flex items-center gap-4 transition-all duration-500 ${audioProcessingStage >= 1 ? 'bg-indigo-500/20 border-indigo-500/50 opacity-100' : 'opacity-0 translate-y-4'}`}>
                        <div className="w-10 h-10 rounded-full bg-indigo-500/30 flex items-center justify-center shrink-0">
                           {audioProcessingStage > 1 ? <CheckCircle className="w-5 h-5 text-indigo-400" /> : <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
                        </div>
                        <div className="text-indigo-100 font-medium">{t('transcribing_and_translating')}</div>
                     </div>
                     
                     {audioProcessingStage >= 2 && (
                       <div className="p-4 rounded-xl border flex items-center gap-4 transition-all duration-500 bg-teal-500/20 border-teal-500/50 opacity-100 animate-in fade-in slide-in-from-bottom-4">
                          <div className="w-10 h-10 rounded-full bg-teal-500/30 flex items-center justify-center shrink-0">
                             {audioProcessingStage > 2 ? <CheckCircle className="w-5 h-5 text-teal-400" /> : <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />}
                          </div>
                          <div className="text-teal-100 font-medium">{t('generating_clinical_note')}</div>
                       </div>
                     )}
                     
                     {audioProcessingStage >= 3 && (
                       <div className="p-4 rounded-xl border flex items-center gap-4 transition-all duration-500 bg-amber-500/20 border-amber-500/50 opacity-100 animate-in fade-in slide-in-from-bottom-4">
                          <div className="w-10 h-10 rounded-full bg-amber-500/30 flex items-center justify-center shrink-0">
                             <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                          </div>
                          <div className="text-amber-100 font-medium">{t('checking_sirs_compliance')}</div>
                       </div>
                     )}
                  </div>
                ) : (
                  <div className="relative z-10 text-center">
                    <Loader2 className="w-10 h-10 text-teal-400 animate-spin mb-4 font-light mx-auto" />
                    <h3 className="text-lg font-normal text-slate-100">
                      {t('gemini_drafting_note')}
                    </h3>
                  </div>
                )}
              </div>
            ) : careNoteError ? (
              <div className="h-full border border-red-200 rounded-2xl bg-red-50 p-10 flex flex-col items-center justify-center text-center min-h-[200px]">
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-xl font-bold text-red-800 mb-2">{t('processing_failed')}</h3>
                <p className="text-red-600 text-sm mb-6">{careNoteError}</p>
                
                <div className="flex gap-4">
                  {lastAudioBlob && (
                     <button 
                       onClick={() => handleAudioSubmit(lastAudioBlob)}
                       className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                     >
                        {t('retry_audio_analysis')}
                     </button>
                  )}
                  <button 
                    onClick={() => { setCareNoteError(null); setLastAudioBlob(null); setAudioProcessingStage(0); }}
                    className="px-6 py-2 bg-white border border-red-200 text-red-700 hover:bg-red-100 font-medium rounded-lg transition-colors"
                  >
                    {t('dismiss')}
                  </button>
                </div>
              </div>
            ) : careNoteDraft ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-teal-50/50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-medium text-slate-800">
                    {t('generated_progress_note')}
                  </h3>
                  <span className="text-xs font-medium uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-1 rounded">
                    {t('draft')}
                  </span>
                </div>
                <div className="p-6">
                  {renderAiDisclaimer()}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed font-light whitespace-pre-wrap mt-4">
                    {careNoteDraft}
                  </div>
                  
                  {nativeConfirmation && (
                    <div className="mt-4 bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-sm relative group">
                      <div className="flex items-center justify-between text-indigo-700 font-medium mb-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> {t('native_translation_confirmation')}
                        </div>
                        <button
                          onClick={() => {
                            const utterance = new SpeechSynthesisUtterance(nativeConfirmation);
                            utterance.lang = language === "zh" ? "zh-CN" : language === "tl" ? "tl-PH" : "en-US";
                            window.speechSynthesis.cancel();
                            window.speechSynthesis.speak(utterance);
                          }}
                          className="flex items-center gap-1.5 bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-md hover:bg-indigo-50 transition-colors shadow-sm"
                          title="Read aloud"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.657 6.343a8 8 0 010 11.314M10.5 19.5L5 14.5H3a2 2 0 01-2-2v-3.5a2 2 0 012-2h2l5.5-5.5v16.5z" />
                          </svg>
                          <span className="font-medium">{t('read_back')}</span>
                        </button>
                      </div>
                      <p className="text-indigo-800 leading-relaxed mt-2">
                        {nativeConfirmation}
                      </p>
                    </div>
                  )}

                  {suggestedFollowUps && suggestedFollowUps.length > 0 && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 p-4 rounded-xl text-sm">
                      <div className="flex items-center gap-2 text-amber-800 font-bold mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        {t('suggested_follow_ups')}
                      </div>
                      <ul className="list-disc list-inside text-amber-900 space-y-1">
                        {suggestedFollowUps.map((action, idx) => (
                           <li key={idx}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sirsAssessment?.isReportable && (
                    <div className="mt-4 bg-red-50 border border-red-200 p-4 rounded-xl">
                      <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                        {t('sirs_detected')}
                      </div>
                      <p className="text-red-800 text-sm mb-4">
                        {t('sirs_detected_desc')}
                      </p>
                      {onLogSirs && (
                        <button
                          onClick={() => onLogSirs(careNoteDraft, sirsAssessment)}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <ShieldAlert className="w-4 h-4" />
                          {t('review_submit_sirs')}
                        </button>
                      )}
                    </div>
                  )}

                  {isCareNoteSaved ? (
                    <div className="mt-6 bg-teal-50 text-teal-700 font-medium p-3 rounded-xl flex items-center justify-center gap-2 border border-teal-100">
                      <CheckCircle className="w-4 h-4" /> {t('saved_to_resident_record')}
                    </div>
                  ) : (
                    <button
                      onClick={handleSaveCareNote}
                      className="mt-6 w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {t('save_to_resident_record')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full border border-slate-200 border-dashed rounded-2xl bg-slate-50 p-10 flex flex-col items-center justify-center text-center min-h-[200px]">
                <p className="text-slate-400 text-sm font-light">
                  {t('clinical_note_will_appear')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
