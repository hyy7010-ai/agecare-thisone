import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { logAuditAction } from "../lib/audit";
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
        let isSigningIn = false;
        if (demoProfile && !auth.currentUser) {
          isSigningIn = true;
          const email = demoProfile.email || `${demoProfile.role}@sunrisecare.com`;
          const password = "password123";
          try {
            await signInWithEmailAndPassword(auth, email, password);
          } catch (e) {
            console.warn("Email signin on mount failed, trying anonymous:", e);
            try {
              await signInAnonymously(auth);
            } catch (anonErr) {
              console.warn("Anonymous signin on mount also failed", anonErr);
              localStorage.removeItem("demoProfile");
              setDemoProfile(null);
              isSigningIn = false;
            }
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
                  email: demoProfile?.email || user.email || "guest@sunrisecare.com",
                  displayName: demoProfile?.displayName || user.displayName || "Guest User",
                  role: demoProfile?.role || "caregiver",
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

          if (!isSigningIn || user) {
            setLoading(false);
          }
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
    const email = `${role}@sunrisecare.com`;
    const password = "password123";
    let user = auth.currentUser;

    if (!user || user.email !== email) {
      try {
        const res = await signInWithEmailAndPassword(auth, email, password);
        user = res.user;
      } catch (signInErr: any) {
        if (
          signInErr.code === "auth/user-not-found" ||
          signInErr.code === "auth/invalid-credential" ||
          signInErr.code === "auth/wrong-password"
        ) {
          try {
            const res = await createUserWithEmailAndPassword(auth, email, password);
            user = res.user;
          } catch (signUpErr: any) {
            console.warn("Real user creation failed, trying anonymous:", signUpErr.code, signUpErr.message);
            try {
              const res = await signInAnonymously(auth);
              user = res.user;
            } catch (anonErr) {
              console.warn("Anonymous fallback also failed (this is expected if not enabled).");
            }
          }
        } else {
          try {
            const res = await signInAnonymously(auth);
            user = res.user;
          } catch (anonErr: any) {
            console.warn("Anonymous fallback failed:", anonErr?.code, anonErr?.message);
          }
        }
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
      email: email,
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
