import React, { useState, useEffect } from 'react';
import { Heart, Clock, CheckCircle2, Activity, Coffee, Sun, Moon, Globe2, Sparkles, AlertTriangle } from 'lucide-react';
import { Resident } from '../types';
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

interface FamilyDashboardProps {
  resident?: Resident;
}

export function FamilyDashboard({ resident }: FamilyDashboardProps) {
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [appreciationSent, setAppreciationSent] = useState(false);
  const [dynamicUpdate, setDynamicUpdate] = useState<{text: string, time: string} | null>(null);
  const [recentIncident, setRecentIncident] = useState<any | null>(null);

  useEffect(() => {
    if (resident?.id) {
      const stored = localStorage.getItem('latest_family_update_' + resident.id);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const timeString = new Date(parsed.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          setDynamicUpdate({ text: parsed.text, time: `Today, ${timeString}` });
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (db) {
      const q = query(collection(db, "sirsEvents"), orderBy("timestamp", "desc"), limit(1));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const latest = snapshot.docs[0].data();
          // Show alert if recent (e.g. within 24h)
          if (latest.timestamp) {
            const timeDiff = Date.now() - latest.timestamp.toMillis();
            if (timeDiff < 24 * 60 * 60 * 1000) {
              setRecentIncident(latest);
            }
          }
        }
      });
      return () => unsubscribe();
    }
  }, [resident?.id]);

  const t = {
    en: {
      welcome: "Welcome to Sunrise Family Portal",
      linking: "Linking your account to your loved one...",
      doingWell: "Doing Well Today",
      summary: `${resident?.name} has had a peaceful day today. Meals were enjoyed and they participated in the morning garden walk.`,
      room: "Room",
      careTime: "Care Time Today",
      routine: "Today's Routine",
      recentUpdates: "Recent Updates",
      todayUpdate: `"Hello family, we wanted to share a quick update. ${resident?.name} is doing very well today. They enjoyed lunch and spent some time chatting with friends in the sunroom. Mood is positive and relaxed!"`,
      yesterdayUpdate: `"A calm evening. ${resident?.name} participated in the mild stretching class and had a good appetite for dinner."`,
      sentBy: "Sent by Care Team",
      messageTeam: "Message Care Team",
      sendAppreciation: "Send Appreciation 💖",
      appreciationSent: "Appreciation Sent! ✨",
      schedule: [
        { time: '08:00 AM', activity: 'Breakfast & Morning Medication' },
        { time: '10:30 AM', activity: 'Morning Walk in Garden' },
        { time: '12:30 PM', activity: 'Lunch' },
        { time: '03:00 PM', activity: 'Afternoon Tea & Social Hour' },
        { time: '06:00 PM', activity: 'Dinner' },
        { time: '08:00 PM', activity: 'Evening Routine' },
      ],
      statusCompleted: "Completed",
      statusInProgress: "In progress..."
    },
    zh: {
      welcome: "欢迎使用 Sunrise 家属平台",
      linking: "正在链接您家人的档案...",
      doingWell: "今天状态很好",
      summary: `${resident?.name} 今天度过了平静的一天。进食状况良好，并参加了早晨的花园散步。`,
      room: "房间号",
      careTime: "今日护理时长",
      routine: "今日护理时间轴",
      recentUpdates: "AI 暖心快报",
      todayUpdate: `"家属您好，向您同步一下最新情况。${resident?.name} 今天状态非常好。午餐胃口不错，还在阳光房和朋友们聊了一会儿天。目前情绪积极且放松！"`,
      yesterdayUpdate: `"昨晚情况平稳。${resident?.name} 参加了舒缓拉伸课程，晚餐胃口很好。"`,
      sentBy: "护理团队发送",
      messageTeam: "联系护理团队",
      sendAppreciation: "发送感谢 💖",
      appreciationSent: "感谢已发送给护工！✨",
      schedule: [
        { time: '上午 08:00', activity: '早餐与晨间服药' },
        { time: '上午 10:30', activity: '花园晨间散步' },
        { time: '中午 12:30', activity: '午餐' },
        { time: '下午 03:00', activity: '下午茶与社交时间' },
        { time: '傍晚 06:00', activity: '晚餐' },
        { time: '晚上 08:00', activity: '晚间洗漱与休息' },
      ],
      statusCompleted: "已完成",
      statusInProgress: "进行中..."
    }
  };

  if (!resident) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Heart className="w-12 h-12 text-pink-300 mb-4" />
        <h2 className="text-xl font-medium text-slate-800">{t[lang].welcome}</h2>
        <p className="text-slate-500 mt-2">{t[lang].linking}</p>
      </div>
    );
  }

  // Mock schedule icons and status
  const scheduleData = [
    { ...t[lang].schedule[0], status: 'completed', icon: Coffee },
    { ...t[lang].schedule[1], status: 'completed', icon: Sun },
    { ...t[lang].schedule[2], status: 'completed', icon: Activity },
    { ...t[lang].schedule[3], status: 'current', icon: Coffee },
    { ...t[lang].schedule[4], status: 'upcoming', icon: Moon },
    { ...t[lang].schedule[5], status: 'upcoming', icon: CheckCircle2 },
  ];

  const handleSendAppreciation = () => {
    setAppreciationSent(true);
    // In a real app, this would fire an event to the backend that the caregiver dashboard listens to
    // For local testing purposes, we'll store it in localStorage so the other dashboard can pick it up
    localStorage.setItem('family_appreciation', JSON.stringify({
      residentName: resident.name,
      timestamp: Date.now()
    }));
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Language Toggle */}
      <div className="flex justify-end mb-6">
        <div className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-full shadow-sm">
          <button 
            onClick={() => setLang('en')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${lang === 'en' ? 'bg-pink-100 text-pink-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            English
          </button>
          <button 
            onClick={() => setLang('zh')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${lang === 'zh' ? 'bg-pink-100 text-pink-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Globe2 className="w-3 h-3" /> 中文
          </button>
        </div>
      </div>

      {/* Header Profile Section */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-pink-100 flex flex-col md:flex-row items-center md:items-start gap-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-pink-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-60"></div>
        
        <div className="w-32 h-32 rounded-full overflow-hidden shrink-0 border-4 border-white shadow-lg relative z-10">
          <img 
            src={"https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200"} 
            alt={resident.name}
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="text-center md:text-left relative z-10 flex-1">
          {recentIncident ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium mb-3">
              <AlertTriangle className="w-4 h-4" />
              Recent Incident Reported
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium mb-3">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              {t[lang].doingWell}
            </div>
          )}
          <h1 className="text-3xl font-serif text-slate-800 mb-2">{resident.name}</h1>
          <p className="text-slate-500 font-light max-w-lg leading-relaxed">
            {recentIncident ? (
              <span className="text-amber-800 font-medium">
                {recentIncident.description || recentIncident.message}
              </span>
            ) : (
              t[lang].summary
            )}
          </p>
          
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-6">
            <div className="bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t[lang].room}</span>
              <span className="text-slate-700 font-medium">{resident.room}</span>
            </div>
            <div className="bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{t[lang].careTime}</span>
              <span className="text-slate-700 font-medium">{resident.careMinutesToday} mins</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Daily Timeline Section */}
        <div className="md:col-span-7">
          <h2 className="text-xl font-medium tracking-tight text-slate-800 mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-pink-500" /> {t[lang].routine}
          </h2>
          
          <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 relative">
            <div className="absolute left-[43px] md:left-[51px] top-10 bottom-10 w-0.5 bg-slate-100"></div>
            <div className="space-y-8 relative z-10">
              {scheduleData.map((item, i) => {
                const Icon = item.icon;
                const isCompleted = item.status === 'completed';
                const isCurrent = item.status === 'current';
                
                return (
                  <div key={i} className={`flex items-start gap-4 md:gap-6 ${item.status === 'upcoming' ? 'opacity-50 grayscale' : ''}`}>
                    <div className="w-16 pt-1 text-right shrink-0">
                      <span className="text-xs font-medium text-slate-500">{item.time}</span>
                    </div>
                    
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm ${
                      isCompleted ? 'bg-green-100 text-green-600' :
                      isCurrent ? 'bg-pink-100 text-pink-600 ring-2 ring-pink-100 ring-offset-2' :
                      'bg-slate-100 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    
                    <div className="pt-2 flex-1">
                      <h3 className={`text-sm md:text-base font-medium ${isCurrent ? 'text-pink-900' : 'text-slate-700'}`}>
                        {item.activity}
                      </h3>
                      {isCompleted && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> {t[lang].statusCompleted}
                        </p>
                      )}
                      {isCurrent && (
                        <p className="text-xs text-pink-600 mt-1 font-medium animate-pulse">
                          {t[lang].statusInProgress}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Latest Updates Section */}
        <div className="md:col-span-5 space-y-6">
          <h2 className="text-xl font-medium tracking-tight text-slate-800 mb-6 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pink-500" /> {t[lang].recentUpdates}
          </h2>

          <div className="bg-pink-50 border border-pink-100 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/40 rounded-full blur-xl -mr-10 -mt-10"></div>
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-white/60 text-pink-700 text-xs font-medium rounded-full mb-4 shadow-sm backdrop-blur-sm">
                {dynamicUpdate ? dynamicUpdate.time : "Today, 2:30 PM"}
              </span>
              <p className="text-pink-900 text-sm leading-relaxed font-medium whitespace-pre-wrap">
                {dynamicUpdate ? dynamicUpdate.text : t[lang].todayUpdate}
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-medium text-pink-700">
                <div className="w-6 h-6 rounded-full bg-pink-200 flex items-center justify-center text-pink-700">
                  AI
                </div>
                {t[lang].sentBy}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full mb-4">
              Yesterday, 5:45 PM
            </span>
            <p className="text-slate-600 text-sm leading-relaxed">
              {t[lang].yesterdayUpdate}
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleSendAppreciation}
              disabled={appreciationSent}
              className={`w-full py-3 font-medium rounded-2xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${
                appreciationSent 
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 border border-transparent'
              }`}
            >
              {appreciationSent ? (
                <><CheckCircle2 className="w-4 h-4" /> {t[lang].appreciationSent}</>
              ) : (
                <>{t[lang].sendAppreciation}</>
              )}
            </button>
            <button className="w-full py-3 bg-white border border-pink-200 text-pink-600 font-medium rounded-2xl text-sm hover:bg-pink-50 transition-colors shadow-sm">
              {t[lang].messageTeam}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
