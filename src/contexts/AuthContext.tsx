import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  signInAnonymously,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { UserProfile, UserRole } from "../types";

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  loginAsDemo: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [demoProfile, setDemoProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("demoProfile");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Patch old Demo names
        if (parsed.displayName === "Demo RN") parsed.displayName = "Emily Chen";
        if (parsed.displayName === "Demo Caregiver") parsed.displayName = "Sarah Jenkins";
        if (parsed.displayName === "Demo Manager") parsed.displayName = "Michael Thompson";
        if (parsed.displayName === "Demo Admin") parsed.displayName = "System Admin";
        
        // Save back the patched version
        localStorage.setItem("demoProfile", JSON.stringify(parsed));
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      if (!auth || !db) {
        console.error("Firebase auth/db is missing.");
        setLoading(false);
        return;
      }
      
      const setupAuth = async () => {
        if (demoProfile && !auth.currentUser) {
          try {
            await signInAnonymously(auth);
          } catch(e) {
            console.warn("Anonymous signin on mount failed", e);
          }
        }

        unsubscribe = onAuthStateChanged(auth, async (user) => {
          try {
            setCurrentUser(user);

            if (user) {
              // Fetch or create user profile
              const userRef = doc(db, "users", user.uid);
              const docSnap = await getDoc(userRef);

              if (docSnap.exists()) {
                setUserProfile(docSnap.data() as UserProfile);
              } else {
                const newProfile: UserProfile = {
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  role: "caregiver",
                };
                await setDoc(userRef, newProfile);
                setUserProfile(newProfile);
              }
            } else {
              setUserProfile(null);
            }
          } catch (err) {
            console.error("Auth sync error", err);
          }

          setLoading(false);
        });
      };
      setupAuth();
    } catch (err) {
      console.error("Auth effect error", err);
      setLoading(false);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const loginAsDemo = async (role: UserRole) => {
    let user = auth.currentUser;
    if (!user) {
      try {
        const res = await signInAnonymously(auth);
        user = res.user;
      } catch (e) {
        console.warn("Anonymous signin failed", e);
      }
    }
    const nameMap = {
      caregiver: "Sarah Jenkins",
      rn: "Emily Chen",
      manager: "Michael Thompson",
      admin: "System Admin",
      family: "Mary Smith (Next of Kin)",
    };
    const profile: UserProfile = {
      uid: user ? user.uid : `local-${role}`,
      email: `${role}@sunrisecare.com`,
      displayName: nameMap[role as keyof typeof nameMap] || "Guest",
      role: role,
    };
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), profile);
      } catch (e) {
        console.error("Failed to sync demo role to Firestore:", e);
      }
    }
    localStorage.setItem("demoProfile", JSON.stringify(profile));
    setDemoProfile(profile);
  };

  const logout = async () => {
    if (demoProfile) {
      localStorage.removeItem("demoProfile");
      setDemoProfile(null);
    } else {
      return signOut(auth);
    }
  };

  const activeProfile = demoProfile || userProfile;
  const activeUser = demoProfile
    ? ({ uid: demoProfile.uid, email: demoProfile.email } as any)
    : currentUser;

  const value = {
    currentUser: activeUser,
    userProfile: activeProfile,
    loading,
    logout,
    loginAsDemo,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
