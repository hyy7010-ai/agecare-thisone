import React, { useState, useEffect } from "react";
import { ShieldAlert, Activity, Users, Bell, LogOut, Loader2, FileText, X, Globe, WifiOff, ArrowRight } from "lucide-react";
import { Dashboard } from "./Dashboard";
import { ResidentProfile } from "./ResidentProfile";
import { SirsReporter } from "./SirsReporter";
import { RosterComplianceGuard } from "./RosterComplianceGuard";
import { RNReviewList } from "./RNReviewList";
import { StaffManager } from "./StaffManager";
import { AdminDashboard } from "./AdminDashboard";
import { SirsReviewDashboard } from "./SirsReviewDashboard";
import { FamilyDashboard } from "./FamilyDashboard";
import { useLanguage } from "../contexts/LanguageContext";
import {
  SIRSAlertData,
  PendingReview,
  AIObservationResult,
  Resident,
} from "../types";
import { db } from "../lib/firebase";
import { subscribeResidents, seedResidentsIfEmpty, FirestoreResident } from "../lib/residents";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import { seedDatabaseIfNeeded } from "../lib/seed";
import { useAuth } from "../contexts/AuthContext";
import { getOfflineQueue, removeQueueItem } from "../lib/offlineQueue";

export const DashboardContainer: React.FC = () => {
  const { userProfile, logout } = useAuth();
  const { lang, setLang, t, isOnline, toggleSimulateOffline } = useLanguage();
  const [currentScreen, setCurrentScreen] = useState<
    "dashboard" | "profile" | "sirs" | "roster" | "rnReview" | "staff" | "admin" | "sirsReview"
  >("dashboard");
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(
    null,
  );
  const [globalSirsAlert, setGlobalSirsAlert] = useState<SIRSAlertData | null>(
    null,
  );
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isGeneratingHandover, setIsGeneratingHandover] = useState(false);
  const [handoverText, setHandoverText] = useState<string | null>(null);
  const [familyAppreciation, setFamilyAppreciation] = useState<{name: string, time: string} | null>(null);
  const [offlineSyncCount, setOfflineSyncCount] = useState(0);


  useEffect(() => {
    const checkQueue = async () => {
      const queue = await getOfflineQueue();
      setOfflineSyncCount(queue.length);
    };
    checkQueue();
    window.addEventListener('offline_queue_updated', checkQueue);
    return () => window.removeEventListener('offline_queue_updated', checkQueue);
  }, []);


  const syncingRef = React.useRef(false);

  useEffect(() => {
    if (isOnline && offlineSyncCount > 0 && !syncingRef.current) {
      // Try to sync items
      const syncItems = async () => {
        syncingRef.current = true;
        const queue = await getOfflineQueue();
        if (queue.length === 0) {
          syncingRef.current = false;
          return;
        }
        
        for (const item of queue) {
          try {
            // Simulated sync for MVP
            console.log("Syncing offline item:", item);
            if (item.type === 'sirsReport') {
              // Actual API call for sync
              const res = await fetch("/api/sirs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item.data),
              });
              const analysis = await res.json();
              if (analysis.error) throw new Error(analysis.error);
              const reportInfo = analysis.result;
              
              await addDoc(collection(db, "sirsEvents"), {
                priority: reportInfo.priority || 2,
                message: reportInfo.autofillReport?.whatHappened || item.data.description || "Offline report",
                reportInfo: reportInfo,
                description: item.data.description || "Media report (Offline)",
                timestamp: serverTimestamp(),
                status: 'pending',
                reporterName: userProfile?.displayName || "Offline User",
                residentId: null
              });
            }
            await removeQueueItem(item.id);
          } catch (e) {
            console.error("Failed to sync item", e);
          }
        }
        syncingRef.current = false;
      };
      syncItems();
    }
  }, [isOnline, offlineSyncCount]);


  useEffect(() => {
    if (userProfile?.role === "family") return;

    // Check for family appreciation
    const checkAppreciation = () => {
      const stored = localStorage.getItem('family_appreciation');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          // Only show if it's recent (e.g., within last 5 minutes)
          if (Date.now() - data.timestamp < 5 * 60 * 1000) {
            setFamilyAppreciation({
              name: data.residentName,
              time: new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
            // Clear it so it only shows once
            localStorage.removeItem('family_appreciation');
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    
    checkAppreciation();
    const interval = setInterval(checkAppreciation, 5000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    let unsubResidents: () => void = () => {};
    let unsubReviews: () => void = () => {};
    let unsubSirsEvents: () => void = () => {};

    try {
      if (!db) {
        console.error("Firestore database is not initialized.");
        setIsLoading(false);
        return;
      }

      seedDatabaseIfNeeded();
      seedResidentsIfEmpty().catch(console.error);

      // Listen for new high-priority SIRS Events
      let isInitialSnapshot = true;
      unsubSirsEvents = onSnapshot(
        query(collection(db, "sirsEvents"), orderBy("timestamp", "desc"), limit(1)),
        (snapshot) => {
          if (isInitialSnapshot) {
            isInitialSnapshot = false;
            return;
          }
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data() as SIRSAlertData;
              if (data.priority === 1) {
                setGlobalSirsAlert(data);
                
                // Trigger Browser Notification for FCM Demo
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification("🚨 P1 SIRS Event Detected", {
                    body: data.message || "A high-priority incident requires immediate attention.",
                    icon: "/favicon.ico", // Or any icon path
                    requireInteraction: true
                  });
                }
              }
            }
          });
        },
        (error) => {
          console.error("Error fetching SIRS events: ", error);
        }
      );

      unsubResidents = subscribeResidents((data: FirestoreResident[]) => {
        const mapped: Resident[] = data.map(d => {
          // Mock data for allergies, medical history, and medications
          let allergies: string[] = d.allergies || [];
          let medicalHistory: string[] = d.medicalHistory || [];
          let medications: any[] = d.medications || [];
          
          if (d.name.includes("Joyce")) {
            allergies = ["Penicillin", "Latex"];
            medicalHistory = ["Osteoporosis", "Type 2 Diabetes", "Previous fall with right hip fracture (2023)"];
            medications = [{ name: "Alendronate", dosage: "70mg", frequency: "Weekly" }];
          } else if (d.name.includes("Chen") || d.name.includes("Mark") || d.name.includes("Arthur")) {
            allergies = ["Sulfa drugs"];
            medicalHistory = ["Hypertension", "Dementia (moderate)"];
            medications = [{ name: "Donepezil", dosage: "10mg", frequency: "Daily" }, { name: "Amlodipine", dosage: "5mg", frequency: "Daily" }];
          } else if (d.name.includes("Eleanor") || d.name.includes("Betty")) {
            allergies = ["No known allergies"];
            medicalHistory = ["Skin tears (frequent)", "Arthritis"];
            medications = [{ name: "Paracetamol", dosage: "500mg", frequency: "As needed for pain" }];
          } else {
             allergies = ["No known allergies"];
             medicalHistory = ["Hypertension"];
             medications = [{ name: "Metoprolol", dosage: "50mg", frequency: "Daily" }];
          }

          return {
            id: d.id || "",
            name: d.name,
            room: d.room,
            careMinutesToday: d.careMinutes,
            careMinutesTarget: 200, 
            statusColor: (d.status as any) || "green",
            bathStatus: d.basicCareTasks?.bath ? "done" : "due",
            mealStatus: d.basicCareTasks?.meal ? "eaten" : "missed",
            toiletStatus: d.basicCareTasks?.toilet ? "independent" : "assisted",
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=random`,
            allergies,
            medicalHistory,
            medications
          };
        });
        setResidents(mapped);
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching residents: ", error);
        setIsLoading(false);
      });

      unsubReviews = onSnapshot(
        collection(db, "rnReviewQueue"),
        (snapshot) => {
          const data: PendingReview[] = [];
          snapshot.forEach((doc) => {
            data.push({ id: doc.id, ...doc.data() } as PendingReview);
          });
          data.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
          setPendingReviews(data);
        },
        (error) => {
          console.error("Error fetching reviews: ", error);
        },
      );
    } catch (e) {
      console.error("Dashboard effect error", e);
      setIsLoading(false);
    }

    return () => {
      unsubResidents();
      unsubReviews();
      unsubSirsEvents();
    };
  }, []);

  const [sirsInitialData, setSirsInitialData] = useState<{description?: string, sirsResult?: any, residentName?: string}>({});

  const handleResidentClick = (id: string) => {
    setSelectedResidentId(id);
    setCurrentScreen("profile");
  };

  const handleSirsReport = async (data: SIRSAlertData) => {
    try {
      const sirsEventData = {
        ...data,
        timestamp: serverTimestamp(),
      };
      
      if (selectedResidentId) {
        sirsEventData.residentId = selectedResidentId;
      }
      
      await addDoc(collection(db, "sirsEvents"), sirsEventData);
      
      if (data.priority === 1 && selectedResidentId) {
        await updateDoc(doc(db, "residents", selectedResidentId), {
          status: "red"
        });
      }
    } catch (err) {
      console.error("Failed to save SIRS event", err);
    }
    setCurrentScreen("dashboard"); // go back to dashboard to see the alert
  };

  const addPendingReview = async (
    residentId: string,
    photoUrl: string,
    aiResult: AIObservationResult,
  ) => {
    const resident = residents.find((r) => r.id === residentId);
    if (!resident) return;

    try {
      await addDoc(collection(db, "rnReviewQueue"), {
        residentId,
        residentName: resident.name,
        room: resident.room,
        photoUrl,
        aiResult,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Failed to add pending review", e);
    }
  };

  const removePendingReview = async (id: string) => {
    const review = pendingReviews.find((r) => r.id === id);
    if (review) {
      try {
        if (review.aiResult.observationType === "care_note") {
          // Route care note reviews to dailyCareNotes
          await addDoc(collection(db, "dailyCareNotes"), {
            residentId: review.residentId,
            content: review.aiResult.observation,
            shift: "Current",
            createdBy: "Sarah Jenkins (Caregiver, AI-Assisted)",
            timestamp: serverTimestamp(),
          });
        } else {
          // Route physical skin or excrement observations to observations
          await addDoc(collection(db, "observations"), {
            residentId: review.residentId,
            type: review.aiResult.observationType || "general",
            photoUrl: review.photoUrl || "",
            aiAnalysis: review.aiResult.observation,
            location: review.aiResult.bodyLocation || "",
            sizeEstimate: review.aiResult.estimatedSizeOrType || "",
            riskFlag: review.aiResult.potentialRiskFlag || "",
            timestamp: serverTimestamp(),
            status: "confirmed",
            confirmedBy: userProfile?.displayName || "Registered Nurse",
          });
        }
      } catch (e) {
        console.error("Failed to move review to database", e);
      }
    }
    try {
      await deleteDoc(doc(db, "rnReviewQueue", id));
    } catch (e) {
      console.error("Failed to delete review", e);
    }
  };

  const clearAlert = () => {
    setGlobalSirsAlert(null);
  };

  const [isRnCoverageLost, setIsRnCoverageLost] = useState(false);

  const handleGenerateHandover = async () => {
    setIsGeneratingHandover(true);
    setHandoverText(null);
    try {
      // Fetch SIRS events for today (simulated with global alert text if exists)
      const sirsEvents = globalSirsAlert ? [globalSirsAlert] : [];
      
      const response = await fetch('/api/shift-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residents,
          sirsEvents,
          rnReviews: pendingReviews
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setHandoverText(data.result);
    } catch (err) {
      console.error(err);
      setHandoverText("Failed to generate handover. Please try again.");
    } finally {
      setIsGeneratingHandover(false);
    }
  };

  const simulateFallAlert = async () => {
    if (residents.length > 0) {
      const resident = residents[0];
      try {
        await addDoc(collection(db, "sirsEvents"), {
          id: "sim-" + Date.now(),
          residentId: resident.id,
          message: `🚨 IoT Sensor Alert: Fall Detected - ${resident.name} (${resident.room})`,
          priority: 1,
          createdAt: new Date().toISOString(),
          timestamp: serverTimestamp(),
          reportInfo: {
            isReportable: true,
            category: "Fall",
            priority: 1,
            autofillReport: {
              whatHappened: "Fall detected by IoT sensor.",
              immediateSafetyActions: "Pending...",
              regulatorNotification: "Required within 24 hours."
            }
          }
        });
        await updateDoc(doc(db, "residents", resident.id), {
          status: "red"
        });
      } catch (e) {
        console.error("Failed to simulate fall", e);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-12 h-12 text-teal-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">{t('loading_dashboard')}</p>
      </div>
    );
  }

  // Permissions derived from Role
  const isCaregiver = userProfile?.role === "caregiver";
  const isRN = userProfile?.role === "rn";
  const isManager = userProfile?.role === "manager";
  const isAdmin = userProfile?.role === "admin";
  const isFamily = userProfile?.role === "family";

  if (isFamily) {
    const familyResident = residents.find(r => r.name.includes("Joyce")) || (residents.length > 0 ? residents[0] : undefined);
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
        {!isOnline && (
          <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm flex items-center justify-center font-medium shadow-inner">
            <WifiOff className="w-4 h-4 mr-2" />
            {t('offline')}
          </div>
        )}
        {/* Simple Family Header */}
        <nav className="bg-white border-b border-pink-100 select-none sticky top-0 z-50 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="font-normal text-pink-700 text-sm sm:text-lg tracking-tight">
                Sunrise Family Portal
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleSimulateOffline}
                title="Toggle Offline Mode"
                className={`p-2 rounded-full flex items-center justify-center transition-colors ${!isOnline ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:bg-slate-100'}`}
              >
                <WifiOff className="w-5 h-5" />
              </button>
              <button onClick={() => logout()} className="text-slate-500 hover:text-slate-800 text-sm font-medium">
                {t('sign_out')}
              </button>
            </div>
          </div>
        </nav>
        <FamilyDashboard resident={familyResident} />
      </div>
    );
  }

  const canReviewRNQueue = isRN || isAdmin || isManager;
  const canAccessRoster = isManager || isAdmin;
  const canLogSirs = isCaregiver || isManager || isRN || isAdmin;
  const canDismissSirs = isManager || isAdmin;

  // For local testing purposes, allow caregivers to see all residents
  const visibleResidents = residents;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {!isOnline && (
        <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm flex items-center justify-center font-medium shadow-inner">
          <WifiOff className="w-4 h-4 mr-2" />
          {t('offline')} 
          {offlineSyncCount > 0 && <span className="ml-2 font-bold bg-amber-200 px-2 py-0.5 rounded-full">{offlineSyncCount} item(s) pending sync</span>}
        </div>
      )}
      {/* Top Navigation Bar */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 select-none sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.02)]">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer min-w-0 group"
            onClick={() => setCurrentScreen("dashboard")}
          >
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-300">
              <Activity className="w-6 h-6 text-white shrink-0" />
            </div>
            <span className="font-bold text-slate-800 text-xl tracking-tight truncate hidden sm:block font-heading">
              {t('app_title')}
            </span>
            <span className="font-bold text-slate-800 text-lg tracking-tight truncate sm:hidden font-heading">
              {t('app_title_short')}
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-8">
            <div className="hidden sm:block text-sm text-right">
              <span className="block font-bold text-slate-900">
                {userProfile?.displayName}
              </span>
              <span className="block text-slate-500 font-medium capitalize mt-0.5">
                {userProfile?.role}
              </span>
            </div>

            {/* Language Toggle */}
            <div className="relative flex items-center">
              <Globe className="w-5 h-5 text-slate-500 mr-1" />
              <select 
                value={lang} 
                onChange={(e) => setLang(e.target.value as any)}
                className="bg-transparent text-sm font-medium text-slate-600 focus:outline-none cursor-pointer"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
                <option value="tl">Tagalog</option>
              </select>
            </div>

            {/* Simulated Offline Toggle */}
            <button 
              onClick={toggleSimulateOffline}
              title="Toggle Offline Mode"
              className={`p-2 rounded-full flex items-center justify-center transition-colors ${!isOnline ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <WifiOff className="w-5 h-5" />
            </button>

            {/* RN Notification */}
            {canReviewRNQueue && (
              <button
                onClick={() => setCurrentScreen("rnReview")}
                className="relative p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-full transition-colors flex items-center justify-center shrink-0"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                {pendingReviews.length > 0 && (
                  <span className="absolute top-1 right-1 flex h-3 w-3 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 text-[8px] font-bold text-white items-center justify-center">
                      {pendingReviews.length}
                    </span>
                  </span>
                )}
              </button>
            )}

            {canAccessRoster && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateHandover}
                  className="flex items-center gap-1.5 sm:gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 sm:px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-all font-sans shrink-0"
                >
                  <FileText className="w-3.5 h-3.5 hidden sm:block" />
                  <span className="text-xs font-medium">{t('handover')}</span>
                </button>
                <button
                  onClick={() => setCurrentScreen("staff")}
                  className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 px-2 sm:px-3 py-1.5 rounded-md hover:bg-slate-100 hover:border-slate-300 transition-all font-sans shrink-0"
                >
                  <Users className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
                  <span className="text-xs font-normal text-slate-600">
                    {t('staff')}
                  </span>
                </button>
                <button
                  onClick={() => setCurrentScreen("roster")}
                  className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 px-2 sm:px-3 py-1.5 rounded-md hover:bg-slate-100 hover:border-slate-300 transition-all font-sans shrink-0"
                >
                  <Users className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
                  <span className="text-xs font-normal text-slate-600">
                    {t('roster')}
                  </span>
                </button>
              </div>
            )}
            
            {canDismissSirs && (
              <button
                onClick={() => setCurrentScreen("sirsReview")}
                className="flex items-center gap-1.5 sm:gap-2 bg-red-50 border border-red-200 px-2 sm:px-3 py-1.5 rounded-md hover:bg-red-100 hover:border-red-300 transition-all font-sans shrink-0"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-600 hidden sm:block" />
                <span className="text-xs font-bold text-red-700">
                  {t('sirs_hub')}
                </span>
              </button>
            )}

            {(isAdmin || isManager) && (
              <button
                onClick={() => setCurrentScreen("admin")}
                className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 px-2 sm:px-3 py-1.5 rounded-md hover:bg-slate-100 hover:border-slate-300 transition-all font-sans shrink-0 mr-2"
              >
                <Activity className="w-3.5 h-3.5 text-indigo-600 hidden sm:block" />
                <span className="text-xs font-medium text-slate-700">
                  {t('exec_view')}
                </span>
              </button>
            )}

            <button
              onClick={() => logout()}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
              title={t('sign_out')}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* RN Coverage Alert */}
      {isRnCoverageLost && (
        <div className="bg-red-50 border-b border-red-200 py-3 px-4 sm:px-6 lg:px-8 relative z-40 flex items-center justify-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
          <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse shrink-0" />
          <div className="text-red-800 text-sm font-medium">
            {t('critical_alert_rn_coverage')}
          </div>
        </div>
      )}

      {/* Family Appreciation Toast */}
      {familyAppreciation && (
        <div className="fixed top-20 right-4 z-[90] flex justify-center p-4 animate-in slide-in-from-right-8 duration-500 fade-in pointer-events-none">
          <div className="bg-white border-2 border-pink-200 shadow-xl rounded-2xl p-4 flex items-center gap-4 max-w-sm w-full pointer-events-auto shadow-pink-100/50">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
              <span className="text-xl">💖</span>
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800 text-sm">{t('appreciation_received')}</h3>
              <p className="text-xs text-slate-600 leading-snug mt-0.5">
                <span className="font-semibold text-pink-600">{familyAppreciation.name}'s family</span> {t('sent_appreciation_for_care')}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{familyAppreciation.time}</p>
            </div>
            <button 
              onClick={() => setFamilyAppreciation(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Global SIRS Alert Banner */}
      {globalSirsAlert && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center p-4 animate-in slide-in-from-top-4 duration-300 pointer-events-none">
          <div 
            className={`shadow-2xl rounded-xl p-4 flex items-start gap-4 max-w-2xl w-full pointer-events-auto transition-transform transform hover:scale-[1.02] active:scale-95 ${globalSirsAlert.priority === 1 ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}
          >
            <ShieldAlert className="w-8 h-8 animate-pulse shrink-0 mt-1" />
            <div 
              className="flex-1 cursor-pointer group" 
              onClick={() => {
                if (globalSirsAlert.residentId) {
                  handleResidentClick(globalSirsAlert.residentId);
                }
                clearAlert();
              }}
            >
              <h3 className="font-bold text-lg">{t('sirs_priority_alert')} (Priority {globalSirsAlert.priority})</h3>
              <p className="text-sm opacity-90 line-clamp-2">{globalSirsAlert.message}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-white text-red-700 px-3 py-1.5 rounded-md shadow-sm group-hover:bg-red-50 transition-colors">
                {t('view_resident_profile_ai_triage')} <ArrowRight className="w-3 h-3" />
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); clearAlert(); }} 
              className="p-2 hover:bg-black/20 rounded-full transition-colors shrink-0"
              title="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        {currentScreen === "dashboard" && (
          <Dashboard
            residents={visibleResidents}
            onResidentClick={handleResidentClick}
            onNewReport={() => {
              setSelectedResidentId(null);
              setSirsInitialData({});
              setCurrentScreen("sirs");
            }}
            canLogSirs={canLogSirs}
            isCaregiver={isCaregiver}
            pendingReviews={pendingReviews}
          />
        )}

        {currentScreen === "profile" &&
          selectedResidentId &&
          residents.find((r) => r.id === selectedResidentId) && (
            <ResidentProfile
              resident={residents.find((r) => r.id === selectedResidentId)!}
              onBack={() => setCurrentScreen("dashboard")}
              onSubmitObservation={(photoUrl, aiResult) =>
                addPendingReview(selectedResidentId, photoUrl, aiResult)
              }
              isCaregiver={isCaregiver}
              onLogSirs={(description, sirsResult) => {
                setSirsInitialData({ description, sirsResult, residentName: residents.find(r => r.id === selectedResidentId)?.name });
                setCurrentScreen("sirs");
              }}
            />
          )}

        {currentScreen === "sirs" && canLogSirs && (
          <SirsReporter
            onCancel={() => {
              setCurrentScreen("dashboard");
              setSirsInitialData({});
            }}
            onSubmit={handleSirsReport}
            initialDescription={sirsInitialData.description}
            initialSirsResult={sirsInitialData.sirsResult}
            residentName={sirsInitialData.residentName || "Unknown"}
          />
        )}

        {currentScreen === "roster" && canAccessRoster && (
          <RosterComplianceGuard onBack={() => setCurrentScreen("dashboard")} />
        )}

        {currentScreen === "rnReview" && canReviewRNQueue && (
          <RNReviewList
            onBack={() => setCurrentScreen("dashboard")}
            pendingReviews={pendingReviews}
            onConfirmReview={removePendingReview}
          />
        )}

        {currentScreen === "staff" && canAccessRoster && (
          <StaffManager onBack={() => setCurrentScreen("dashboard")} />
        )}
        
        {currentScreen === "admin" && (isAdmin || isManager) && (
          <AdminDashboard />
        )}

        {currentScreen === "sirsReview" && canDismissSirs && (
          <SirsReviewDashboard onBack={() => setCurrentScreen("dashboard")} />
        )}
      </main>

      {/* Mobile Floating Action Button for easy access to SIRS */}
      {currentScreen !== "sirs" && canLogSirs && (
        <button
          onClick={() => {
            setSelectedResidentId(null);
            setSirsInitialData({});
            setCurrentScreen("sirs");
          }}
          className="md:hidden fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 bg-red-600/95 backdrop-blur text-white rounded-full shadow-xl flex items-center justify-center hover:bg-red-700 transition-transform active:scale-95 z-30"
          aria-label="New Incident Report"
        >
          <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>
      )}

      {/* Handover Modal */}
      {(isGeneratingHandover || handoverText) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-medium text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                {t('shift_handover_report')}
              </h2>
              <button
                onClick={() => { setIsGeneratingHandover(false); setHandoverText(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6 overflow-y-auto min-h-[200px]">
              {isGeneratingHandover ? (
                <div className="flex flex-col items-center justify-center text-slate-500 h-40 space-y-4">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-sm">{t('synthesizing_clinical_handover')}</p>
                </div>
              ) : (
                <div className="whitespace-pre-line text-sm text-slate-700 leading-relaxed font-sans">
                  {handoverText}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Simulator Tools */}
      <div className="fixed bottom-6 left-6 z-40 bg-white/90 backdrop-blur border border-slate-200 p-3 rounded-xl shadow-lg opacity-50 hover:opacity-100 transition-all flex flex-col gap-2">
        <div className="text-xs font-bold text-slate-500 mb-1 px-1 uppercase tracking-wider">{t('simulator')}</div>
        <button
          onClick={simulateFallAlert}
          className="text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3 py-2 rounded-lg transition-colors text-left"
        >
          {t('trigger_iot_fall_alert')}
        </button>
        <button
          onClick={() => setIsRnCoverageLost(prev => !prev)}
          className="text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-lg transition-colors text-left"
        >
          {t('toggle_rn_coverage_alert')}
        </button>
      </div>

    </div>
  );
};
