import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'zh' | 'tl';

const translations = {
  en: {
    take_photo: "Take Photo",
    submit: "Submit",
    confirm: "Confirm",
    sign_in: "Sign In",
    logout: "Log Out",
    dashboard: "Dashboard",
    generate_note: "Generate Note",
    speak: "Speak (Any Language)",
    listening: "Listening...",
    ai_disclaimer: "⚠️ AI is for assistance only. Final clinical judgement must be made by a Registered Nurse.",
    offline: "⚠️ Offline Mode: Data temporarily saved to local cache.",
    roster: "Roster",
    staff: "Staff",
    handover: "Handover",
    live_dashboard: "Live Dashboard",
    real_time_overview: "Real-time resident wellness overview",
    find_resident: "Find resident...",
    log_sirs_incident: "Log SIRS Incident",
    room: "Room",
    care_minutes: "Care Minutes",
    status: "Status",
    basic_care_tasks: "Basic Care Tasks",
    bath: "Bath",
    meal: "Meal",
    toilet: "Toilet"
  },
  zh: {
    take_photo: "拍照",
    submit: "提交",
    confirm: "确认",
    sign_in: "登录",
    logout: "登出",
    dashboard: "仪表板",
    generate_note: "生成记录",
    speak: "语音输入 (自动翻译)",
    listening: "聆听中...",
    ai_disclaimer: "⚠️ AI仅辅助，最终医疗判断以RN(注册护士)为准。",
    offline: "⚠️ 离线模式：数据已暂存本地，联网后同步。",
    roster: "排班",
    staff: "员工管理",
    handover: "交接班",
    live_dashboard: "实时看板",
    real_time_overview: "实时居民健康概览",
    find_resident: "搜索长者...",
    log_sirs_incident: "上报 SIRS 事件",
    room: "房间号",
    care_minutes: "护理时长",
    status: "状态",
    basic_care_tasks: "基础护理",
    bath: "洗浴",
    meal: "进餐",
    toilet: "如厕"
  },
  tl: {
    take_photo: "Kumuha ng Litrato",
    submit: "Isumite",
    confirm: "Kumpirmahin",
    sign_in: "Mag-sign In",
    logout: "Mag-log Out",
    dashboard: "Dashboard",
    generate_note: "Bumuo ng Tala",
    speak: "Magsalita (Kahit Anong Wika)",
    listening: "Nakikinig...",
    ai_disclaimer: "⚠️ Ang AI ay para sa tulong lamang. Ang RN ang magdedesisyon.",
    offline: "⚠️ Offline Mode: Pansamantalang nai-save ang data.",
    roster: "Roster",
    staff: "Kawani",
    handover: "Handover",
    live_dashboard: "Live Dashboard",
    real_time_overview: "Real-time na pangkalahatang ideya",
    find_resident: "Maghanap ng residente...",
    log_sirs_incident: "I-log ang SIRS Incident",
    room: "Kwarto",
    care_minutes: "Care Minutes",
    status: "Katayuan",
    basic_care_tasks: "Pangunahing Pangangalaga",
    bath: "Paligo",
    meal: "Pagkain",
    toilet: "Banyo"
  }
};

const LanguageContext = createContext<{
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations.en) => string;
  isOnline: boolean;
  toggleSimulateOffline: () => void;
}>({ lang: 'en', setLang: () => {}, t: (k) => k, isOnline: true, toggleSimulateOffline: () => {} });

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('preferredLang') as Language) || 'en';
  });
  
  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('preferredLang', newLang);
  };
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [simulateOffline, setSimulateOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => { if (!simulateOffline) setIsOnline(true); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [simulateOffline]);

  useEffect(() => {
    if (simulateOffline) {
      setIsOnline(false);
    } else {
      setIsOnline(navigator.onLine);
    }
  }, [simulateOffline]);

  const toggleSimulateOffline = () => setSimulateOffline(prev => !prev);

  const t = (key: keyof typeof translations.en) => translations[lang][key] || translations.en[key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isOnline, toggleSimulateOffline }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
