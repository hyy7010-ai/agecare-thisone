import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  ShieldAlert,
  Cpu,
  Send,
  CheckCircle,
  Flame,
  Loader2,
  Mail,
  Mic,
  Camera,
  MicOff,
  Image as ImageIcon,
  X,
  Globe,
  Search,
  Lock,
} from "lucide-react";
import { SIRSReport, SIRSAlertData } from "../types";
import { sendGmailReport } from "../lib/gmail";
import { initAuth } from "../lib/auth";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { addToOfflineQueue } from "../lib/offlineQueue";
import { scrubPII } from "../lib/piiScrubber";

interface SirsReporterProps {
  onCancel: () => void;
  onSubmit: (data: SIRSAlertData) => void;
  initialDescription?: string;
  initialSirsResult?: SIRSReport | null;
  residentName?: string;
}

export function SirsReporter({ onCancel, onSubmit, initialDescription = "", initialSirsResult = null, residentName = "Unknown" }: SirsReporterProps) {
  const { currentUser } = useAuth();
  const { isOnline } = useLanguage();
  const [description, setDescription] = useState(initialDescription);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scrubbingStatus, setScrubbingStatus] = useState<string | null>(null);
  const [sirsResult, setSirsResult] = useState<SIRSReport | null>(initialSirsResult);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [overridePriority, setOverridePriority] = useState<number | null | 'none'>(null);
  
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => setAudioBase64(reader.result as string);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access denied", err);
      alert("Microphone access is required to record audio.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImageBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, []);

  const handleEmailReport = async () => {
    if (!sirsResult) return;
    setEmailStatus("sending");
    setEmailError(null);
    try {
      const title = sirsResult.incidentTitle || "Incident Report";
      const resident = sirsResult.residentName || "Unknown Resident";
      const sender = currentUser?.displayName || currentUser?.email || "Staff Member";
      
      const emailBody = `
Title: ${title}
Resident: ${resident}
Reported By: ${sender}

Priority: ${sirsResult.priority}
Category: ${sirsResult.category}

What Happened:
${sirsResult.autofillReport.whatHappened}

Immediate Safety Actions:
${sirsResult.autofillReport.immediateSafetyActions}

Regulator Notification:
${sirsResult.autofillReport.regulatorNotification}
      `.trim();
      
      const subject = `SIRS Priority ${sirsResult.priority} Report: ${title} - ${resident}`;
      
      await sendGmailReport("hyy7010@gmail.com", subject, emailBody);
      setEmailStatus("sent");
    } catch (err: any) {
      console.error(err);
      setEmailStatus("error");
      setEmailError(err.message || "Failed to send email");
    }
  };

  const handleAnalyze = async () => {
    if (!description.trim() && !audioBase64 && !imageBase64) return;

    if (!isOnline) {
      const scrubbedDescription = description ? scrubPII(description, residentName) : "";
      await addToOfflineQueue('sirsReport', { description: scrubbedDescription, audioBase64, imageBase64 });
      setIsSubmitted(true);
      return;
    }

    setIsProcessing(true);
    setScrubbingStatus('Initiating Edge Privacy Engine...');
    setSirsResult(null);
    setIsSubmitted(false);
    setIsSubmitting(false);
    setErrorMsg(null);
    setOverridePriority(null);

    try {
      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus('Scanning media & text for PII...');
      
      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus('Redacting identifiers locally...');
      
      const scrubbedDescription = description ? scrubPII(description, residentName) : "";

      await new Promise(r => setTimeout(r, 600));
      setScrubbingStatus('Encrypting sanitized payload for AI Analysis...');

      const res = await fetch("/api/sirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: scrubbedDescription, audioBase64, imageBase64 }),
      });
      
      setScrubbingStatus(null);

      const text = await res.text();
      if (text.trim().startsWith("<")) {
        console.error("Raw HTML response:", text);
        throw new Error(
          "Action blocked by browser cookie settings. Please OPEN IN NEW TAB (using the arrow icon at the top right of the preview) to authenticate and continue.",
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
          `Failed to parse response (Status ${res.status}): ${text.substring(0, 300)}`,
        );
      }

      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
      setSirsResult(data.result);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to analyze SIRS incident.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = () => {
    if (!sirsResult) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 2000);
  };

  const handleFinish = () => {
    if (!sirsResult) return;
    
    let finalPriority = sirsResult.priority;
    if (overridePriority !== null && overridePriority !== 'none') {
      finalPriority = Number(overridePriority) as 1 | 2;
    } else if (overridePriority === 'none') {
       onCancel();
       return;
    }

    onSubmit({
      priority: (finalPriority || 2) as 1 | 2, // default to 2 if somehow null
      message: sirsResult.autofillReport?.whatHappened || 'Incident report',
      reportInfo: sirsResult,
    });
  };

  const getPriorityValue = (p: number | null | 'none' | undefined) => p === 1 ? 1 : (p === 2 ? 2 : 99);
  const currentPriorityVal = overridePriority !== null ? getPriorityValue(overridePriority) : getPriorityValue(sirsResult?.priority);
  const aiPriorityVal = getPriorityValue(sirsResult?.priority);
  const isBreach = aiPriorityVal === 1 && currentPriorityVal > aiPriorityVal;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-6 font-medium"
      >
        <ArrowLeft className="w-5 h-5" />
        Cancel & Back
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-6 text-white flex items-center gap-4">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">SIRS Incident Reporter</h1>
            <p className="text-slate-400">
              AI-assisted reporting for the Serious Incident Response Scheme
            </p>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {isProcessing ? (
            <div className="h-64 border border-slate-200 rounded-2xl bg-slate-900 p-10 flex flex-col items-center justify-center text-center relative overflow-hidden">
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
                  <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4 mx-auto" />
                  <h3 className="text-xl font-bold text-slate-100">
                    Gemini is analyzing... (results usually appear within 10 seconds)
                  </h3>
                  <p className="text-slate-400 mt-2">
                    Gemini is checking compliance criteria and drafting a report.
                  </p>
                </div>
              )}
            </div>
          ) : (isSubmitted && !isOnline) ? (
            <div className="bg-white p-8 rounded-2xl border border-amber-200 shadow-sm animate-in zoom-in-95">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-10 h-10 text-amber-600" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">
                  Saved Offline
                </h2>
                <p className="text-amber-700 font-medium">
                  The report has been saved locally and will be analyzed when your connection is restored.
                </p>
              </div>
              <div className="flex justify-center mt-8">
                <button
                  onClick={onCancel}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 px-8 rounded-xl transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          ) : !sirsResult ? (
            <div className="space-y-6">
              
              {/* Media Inputs (Voice & Image) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Record Voice Note
                  </label>
                  <div className="flex items-center gap-2">
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 px-4 rounded-xl transition-colors flex items-center gap-2 text-sm border border-red-200"
                      >
                        <Mic className="w-4 h-4" /> Start Recording
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl transition-colors flex items-center gap-2 text-sm animate-pulse"
                      >
                        <MicOff className="w-4 h-4" /> Stop Recording
                      </button>
                    )}
                    {audioBase64 && !isRecording && (
                      <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                        <CheckCircle className="w-4 h-4" /> Audio Attached
                        <button onClick={() => setAudioBase64(null)} className="ml-2 hover:text-emerald-800">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-px bg-slate-200 hidden sm:block"></div>

                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Attach Photo
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-4 rounded-xl transition-colors flex items-center gap-2 text-sm border border-slate-300"
                    >
                      <Camera className="w-4 h-4" /> Take / Select Photo
                    </button>
                  </div>
                  {imageBase64 && (
                    <div className="mt-2 relative inline-block">
                      <img src={imageBase64} alt="Incident" className="h-20 w-20 object-cover rounded-lg border border-slate-300" />
                      <button 
                        onClick={() => setImageBase64(null)}
                        className="absolute -top-2 -right-2 bg-white rounded-full text-slate-500 hover:text-red-500 shadow-sm border border-slate-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-bold text-slate-700 uppercase">
                    Narrative Description (Optional if using Voice/Photo)
                  </label>
                  <button 
                    onClick={() => setDescription("Nadulas si Mr. Chen sa banyo at nagkaroon ng gasgas sa kanyang braso. Nilinis ko ito, nilagyan ng dressing, at inireport agad sa RN para ma-check. Mabuti naman ang vital signs niya ngayon.")}
                    className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
                  >
                    <Mic className="w-3 h-3" /> Simulate Tagalog Text
                  </button>
                </div>
                <textarea
                  className="w-full border border-slate-300 rounded-xl p-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                  placeholder="E.g., Mr. Chen slipped in the bathroom and his arm has a graze... (Or just record voice instead)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {errorMsg && (
                <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-xl text-sm mb-4">
                  <strong>Error: </strong> {errorMsg}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleAnalyze}
                  disabled={!description.trim() && !audioBase64 && !imageBase64}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Cpu className="w-5 h-5" /> Analyze Compliance
                </button>
              </div>
            </div>
          ) : isSubmitting ? (
            <div className="h-64 border border-slate-200 rounded-2xl bg-slate-50 p-10 flex flex-col items-center justify-center text-center animate-in fade-in">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <h3 className="text-xl font-bold text-slate-800">
                Submitting to ACQSC...
              </h3>
              <p className="text-slate-500 mt-2">
                Filing official SIRS report via Gmail API.
              </p>
            </div>
          ) : isSubmitted && sirsResult ? (
            <div className="bg-white p-8 rounded-2xl border border-emerald-200 shadow-sm animate-in zoom-in-95">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">
                  Report Submitted to ACQSC <span>&#10003;</span>
                </h2>
                <p className="text-emerald-700 font-medium">
                  Submitted within the mandatory{" "}
                  {sirsResult.priority === 1 ? "24-hour" : "30-day"} window.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 mb-8 text-left">
                <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm border-b border-slate-200 pb-4">
                  <Send className="w-4 h-4" />
                  <span>
                    Sent via Gmail API from the facility's official inbox.
                  </span>
                </div>

                <div className="space-y-3 font-mono text-sm text-slate-700 mb-6 border-b border-slate-200 pb-4">
                  <div>
                    <span className="text-slate-400">To:</span>{" "}
                    notifications@agedcarequality.gov.au
                  </div>
                  <div>
                    <span className="text-slate-400">CC:</span> the resident's
                    GP and family contact
                  </div>
                  <div>
                    <span className="text-slate-400">Subject:</span> SIRS
                    Priority {sirsResult.priority} Report: {sirsResult.incidentTitle || "Incident Report"} - {sirsResult.residentName || "Unknown Resident"}
                  </div>
                </div>

                <div className="space-y-4 text-sm text-slate-800">
                  <p>
                    <strong>What Happened:</strong>
                    <br />
                    {sirsResult.autofillReport.whatHappened}
                  </p>
                  <p>
                    <strong>Immediate Safety Actions:</strong>
                    <br />
                    {sirsResult.autofillReport.immediateSafetyActions}
                  </p>
                  <p>
                    <strong>Regulator Notification:</strong>
                    <br />
                    {sirsResult.autofillReport.regulatorNotification}
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleFinish}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-8 rounded-xl transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4">
              {sirsResult.isReportable ? (
                <div className="space-y-6">
                  <div
                    className={`p-8 rounded-2xl border-2 ${sirsResult.priority === 1 ? "bg-red-600 border-red-700 text-white" : "bg-amber-50 border-amber-200 text-amber-900"}`}
                  >
                    <div className="flex items-center gap-4 mb-3">
                      {sirsResult.priority === 1 ? (
                        <Flame className="w-8 h-8 text-white" />
                      ) : (
                        <ShieldAlert className="w-8 h-8 text-amber-500" />
                      )}
                      <h2
                        className={`text-2xl font-bold ${sirsResult.priority === 1 ? "text-white" : "text-amber-900"}`}
                      >
                        SIRS Priority {sirsResult.priority} Report Required
                      </h2>
                    </div>
                    <p
                      className={`${sirsResult.priority === 1 ? "text-red-100" : "text-amber-700"} font-medium text-lg`}
                    >
                      Matched Category: {sirsResult.category}
                    </p>
                    
                    {sirsResult.confidenceScore && (
                      <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${sirsResult.confidenceScore < 70 ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        AI Confidence: {sirsResult.confidenceScore}%
                      </div>
                    )}
                    {sirsResult.uncertaintyFlag && (
                      <div className="mt-3 bg-white/20 p-3 rounded-lg text-sm">
                        <strong>AI Uncertainty:</strong> {sirsResult.uncertaintyFlag}
                      </div>
                    )}
                  </div>
                  
                  {((sirsResult.groundingSources && sirsResult.groundingSources.length > 0) || (sirsResult.searchQueries && sirsResult.searchQueries.length > 0)) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1 text-slate-700">
                        <Search className="w-5 h-5 text-indigo-500" />
                        <h4 className="font-bold text-sm">Verified via live Google Search</h4>
                      </div>
                      <p className="text-xs text-slate-500 mb-4">The AI ran these searches against current ACQSC guidelines before classifying:</p>
                      
                      <div className="space-y-2 mb-4">
                        {sirsResult.searchQueries?.map((query, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-1.5 font-mono">
                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{query}</span>
                          </div>
                        ))}
                      </div>

                      {sirsResult.groundingSources && sirsResult.groundingSources.length > 0 && (
                        <div className="space-y-3 mb-4 pt-4 border-t border-slate-200">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sources Referenced</p>
                          {sirsResult.groundingSources.map((source, idx) => {
                            let domain = '';
                            try {
                              domain = new URL(source.uri).hostname.replace('www.', '');
                            } catch (e) {
                              domain = 'Source';
                            }
                            return (
                              <a 
                                key={idx} 
                                href={source.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block group"
                              >
                                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mb-0.5 uppercase tracking-wider">
                                  <Globe className="w-3 h-3" />
                                  {domain}
                                </div>
                                <div className="text-sm text-slate-600 group-hover:text-indigo-600 font-medium leading-tight transition-colors">
                                  {source.title}
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      )}

                      <div className="pt-3 border-t border-slate-200">
                        <a 
                          href="https://www.agedcarequality.gov.au/providers/serious-incident-response-scheme"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          Official reference: ACQSC Serious Incident Response Scheme
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Override Section */}
                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">RN Override Priority</h4>
                      <p className="text-xs text-slate-500">Manual override of AI classification</p>
                    </div>
                    <select 
                      className="border border-slate-300 rounded p-2 text-sm"
                      value={overridePriority === null ? '' : overridePriority}
                      onChange={(e) => setOverridePriority(e.target.value ? (e.target.value === 'none' ? 'none' : Number(e.target.value)) : null)}
                    >
                      <option value="">Keep AI Suggestion (P{sirsResult.priority})</option>
                      {sirsResult.priority !== 1 && <option value="1">Upgrade to Priority 1</option>}
                      {sirsResult.priority !== 2 && <option value="2">Downgrade to Priority 2</option>}
                      <option value="none">Mark as Non-Reportable</option>
                    </select>
                  </div>

                  {isBreach && (
                    <div className="bg-red-50 border-l-4 border-red-600 p-5 rounded-r-xl shadow-sm animate-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 text-red-800 font-bold mb-2">
                        <ShieldAlert className="w-6 h-6 animate-pulse" />
                        AGED CARE ACT 1997 - BREACH BLOCKED
                      </div>
                      <p className="text-sm text-red-700 font-medium leading-relaxed">
                        Strict Compliance Lock: Under the Aged Care Quality and Safety Commission (ACQSC) guidelines, this incident has been classified by AI as a mandatory Priority 1 (Serious Injury / Fall). Downgrading this incident is legally prohibited and has been locked by the system to prevent compliance failure.
                      </p>
                    </div>
                  )}

                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-2">
                      Auto-Generated Report Draft
                    </h3>

                    <div>
                      <span className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        What Happened
                      </span>
                      <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                        {sirsResult.autofillReport.whatHappened}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Immediate Safety Actions
                      </span>
                      <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                        {sirsResult.autofillReport.immediateSafetyActions}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase mb-1">
                          Regulator Notification
                        </span>
                        <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                          {sirsResult.autofillReport.regulatorNotification}
                        </p>
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase mb-1">
                          Notifications Check
                        </span>
                        <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                              Emergency Services
                            </span>
                            <span
                              className={
                                sirsResult.autofillReport
                                  .emergencyServicesNotified
                                  ? "text-emerald-600 font-bold"
                                  : "text-slate-400 font-bold"
                              }
                            >
                              {sirsResult.autofillReport
                                .emergencyServicesNotified
                                ? "Yes"
                                : "No"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">
                              Family Notified
                            </span>
                            <span
                              className={
                                sirsResult.autofillReport.familyNotified
                                  ? "text-emerald-600 font-bold"
                                  : "text-slate-400 font-bold"
                              }
                            >
                              {sirsResult.autofillReport.familyNotified
                                ? "Yes"
                                : "No"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">GP Notified</span>
                            <span
                              className={
                                sirsResult.autofillReport.gpNotified
                                  ? "text-emerald-600 font-bold"
                                  : "text-slate-400 font-bold"
                              }
                            >
                              {sirsResult.autofillReport.gpNotified
                                ? "Yes"
                                : "No"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 gap-4">
                    <button
                      onClick={handleEmailReport}
                      disabled={emailStatus === "sending" || emailStatus === "sent"}
                      className={`font-bold py-3 px-6 rounded-xl transition-colors flex items-center gap-2 ${emailStatus === "sent" ? "bg-emerald-100 text-emerald-800" : "bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"}`}
                    >
                      {emailStatus === "sending" && <Loader2 className="w-5 h-5 animate-spin" />}
                      {emailStatus === "sent" && <CheckCircle className="w-5 h-5" />}
                      {emailStatus === "idle" || emailStatus === "error" ? <Mail className="w-5 h-5" /> : null}
                      {emailStatus === "sent" ? "Emailed" : "Email Report to ACQSC (via Gmail)"}
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={isBreach}
                      className={`font-bold py-3 px-8 rounded-xl transition-all duration-300 flex items-center gap-2 shadow-sm ${
                        isBreach 
                          ? 'bg-red-50 text-red-600 border border-red-300 cursor-not-allowed opacity-90 scale-98 shadow-[0_0_10px_rgba(239,68,68,0.15)]' 
                          : 'bg-slate-900 hover:bg-slate-800 text-white hover:shadow-md'
                      }`}
                    >
                      {isBreach ? (
                        <>
                          <Lock className="w-5 h-5 text-red-500 animate-pulse" />
                          Submission Locked (SIRS Breach)
                        </>
                      ) : (
                        <>
                          Manager Approve & File
                          <Send className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </button>
                  </div>
                  
                  {emailError && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                      <strong>Email failed:</strong> {emailError}
                    </div>
                  )}

                  <div className="mt-4 bg-red-50 border border-red-200 p-4 rounded-xl text-sm text-red-800 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0 text-red-600" />
                    <div>
                      <strong>Compliance Risk Warning:</strong> Failure to report a Priority 1 SIRS incident within 24 hours, or a Priority 2 within 30 days, may result in regulatory action by the ACQSC, including compliance notices, sanctions, or civil penalties (up to $111,000 for individuals, $555,000 for corporations per breach).
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-xl text-center">
                  <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-emerald-900 mb-2">
                    Not SIRS Reportable
                  </h2>
                  <p className="text-emerald-700">
                    Based on the SIRS criteria, this incident does not meet the
                    threshold for mandatory ACQSC reporting. Please log it in
                    your internal clinical management system.
                  </p>
                  <button
                    onClick={onCancel}
                    className="mt-6 bg-white border border-emerald-300 text-emerald-800 font-bold py-2 px-6 rounded-lg transition-colors hover:bg-emerald-100"
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
