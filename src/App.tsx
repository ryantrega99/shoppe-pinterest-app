import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import React, { useState, useEffect, createContext, useContext } from "react";
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { 
  Sparkles, 
  Link as LinkIcon, 
  CheckSquare, 
  Calculator, 
  BookOpen, 
  Menu, 
  X,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  TrendingUp,
  ExternalLink,
  ChevronRight,
  Moon,
  Sun,
  LayoutDashboard,
  ArrowUpRight,
  DollarSign,
  Users,
  Target,
  Search,
  History,
  Info,
  LogIn,
  LogOut,
  User as UserIcon,
  Calendar,
  Clock,
  Settings,
  ArrowRight,
  Instagram,
  Twitter,
  Image
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { auth, signInWithGoogle, logout, db } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import axios from "axios";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  getDoc,
  setDoc,
  getDocs
} from "firebase/firestore";

// --- Firestore Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const safeStringify = (obj: any) => {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) return;
      cache.add(value);
    }
    return value;
  });
};

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  try {
    const errInfo: FirestoreErrorInfo = {
      error: errorMessage,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', safeStringify(errInfo));
  } catch (e) {
    console.error('Firestore Error (critical): ', errorMessage);
  }
};

// --- Auth Context ---

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("AuthProvider: Initializing onAuthStateChanged...");
    
    // Fallback timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("AuthProvider: Auth check timed out, forcing loading to false.");
        setLoading(false);
      }
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(timeout);
      console.log("AuthProvider: onAuthStateChanged fired. User:", currentUser?.uid);
      setUser(currentUser);
      if (currentUser) {
        try {
          console.log("AuthProvider: Syncing user profile...");
          // Sync user profile to Firestore
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp()
            });
            console.log("AuthProvider: User profile created.");
          } else {
            console.log("AuthProvider: User profile exists.");
          }
        } catch (error) {
          console.error("AuthProvider: Error syncing profile:", error instanceof Error ? error.message : String(error));
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
      setLoading(false);
      console.log("AuthProvider: Loading set to false.");
    });
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signIn = async () => {
    await signInWithGoogle();
  };

  const signOut = async () => {
    await logout();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// --- Settings Hook ---

export const useUserSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    const settingsRef = doc(db, "users", user.uid, "private", "settings");
    const unsub = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        setSettings({});
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/private/settings`);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  return { settings, loading };
};

// --- Components ---

const Sidebar = ({ isOpen, setIsOpen, darkMode, setDarkMode }: { isOpen: boolean, setIsOpen: (v: boolean) => void, darkMode: boolean, setDarkMode: (v: boolean) => void }) => {
  const location = useLocation();
  const { user, signIn, signOut } = useAuth();
  
  const menuItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Generator", path: "/generator", icon: Sparkles },
    { name: "Scheduler", path: "/scheduler", icon: Calendar },
    { name: "Link Manager", path: "/links", icon: LinkIcon },
    { name: "Checklist", path: "/checklist", icon: CheckSquare },
    { name: "Estimasi", path: "/estimasi", icon: Calculator },
    { name: "Panduan", path: "/panduan", icon: BookOpen },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <>
      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass dark:bg-zinc-900/90 backdrop-blur-2xl border-t border-zinc-200 dark:border-zinc-800 z-50 px-2 py-2 flex justify-around items-center shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        {menuItems.map((item) => (
          <Link 
            key={item.path} 
            to={item.path}
            className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${
              location.pathname === item.path 
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" 
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            <item.icon size={20} />
            <span className="text-[10px] mt-1 font-black uppercase tracking-tighter">{item.name}</span>
          </Link>
        ))}
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden md:flex flex-col w-72 bg-white dark:bg-[#09090b] border-r border-zinc-200 dark:border-zinc-800/60 h-screen sticky top-0 z-40`}>
        <div className="p-8">
          <Link to="/dashboard" className="flex items-center gap-3 text-zinc-900 dark:text-white font-black text-2xl tracking-tighter">
            <div className="bg-[#E60023] p-2 rounded-xl text-white shadow-lg shadow-red-500/20 animate-float">
              <TrendingUp size={24} />
            </div>
            <span className="text-gradient">ShopeePin</span>
            <span className="px-2 py-0.5 bg-amber-500 text-white text-[8px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-amber-500/20">Pro</span>
          </Link>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-3 ml-1">Pinterest Affiliate</p>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {user ? (
            <>
              <p className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 mt-4">Utama</p>
              {menuItems.slice(0, 3).map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group ${
                    location.pathname === item.path
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10 dark:shadow-white/5 font-bold"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <item.icon size={20} className={location.pathname === item.path ? "" : "group-hover:scale-110 transition-transform"} />
                  <span className="text-sm">{item.name}</span>
                  {location.pathname === item.path && (
                    <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </Link>
              ))}

              <p className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 mt-8">Alat & Bantuan</p>
              {menuItems.slice(3).map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group ${
                    location.pathname === item.path
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/10 dark:shadow-white/5 font-bold"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <item.icon size={20} className={location.pathname === item.path ? "" : "group-hover:scale-110 transition-transform"} />
                  <span className="text-sm">{item.name}</span>
                  {location.pathname === item.path && (
                    <motion.div layoutId="active-pill-2" className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </Link>
              ))}
            </>
          ) : (
            <div className="px-4 py-10 text-center">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-4 text-zinc-400">
                <UserIcon size={32} />
              </div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Belum Masuk</h3>
              <p className="text-xs text-zinc-500 mt-2 mb-6">Masuk untuk menyimpan data Anda secara permanen.</p>
              <button 
                onClick={signIn}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
              >
                <LogIn size={18} />
                Masuk by Google
              </button>
            </div>
          )}
        </nav>

        <div className="p-6 space-y-4">
          {user && (
            <div className="bg-zinc-900 dark:bg-zinc-900 p-5 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Target size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Target Bulan Ini</p>
                  <p className="text-sm font-bold text-white">Rp 5.000.000</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden relative z-10">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "65%" }}
                  transition={{ duration: 1.5, ease: "circOut" }}
                  className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
              </div>
              <p className="text-[10px] text-zinc-400 mt-2 font-medium relative z-10">65% tercapai</p>
            </div>
          )}

          <div className="flex items-center justify-between px-2">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            {user && (
              <button 
                onClick={signOut}
                className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                title="Keluar"
              >
                <LogOut size={20} />
              </button>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-3 px-2 pt-2">
              <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-10 h-10 rounded-2xl border-2 border-emerald-500/20" />
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{user.displayName}</p>
                <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const Dashboard = ({ darkMode }: { darkMode: boolean }) => {
  const { user } = useAuth();
  const [liveStats, setLiveStats] = useState<any>(null);
  const [liveChartData, setLiveChartData] = useState<any[]>([]);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [isPinterestConnected, setIsPinterestConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setLiveStats(null);
      setLiveChartData([]);
      setScheduledCount(0);
      return;
    }

    // Listen to summary stats
    const statsRef = doc(db, "users", user.uid, "stats", "summary");
    const unsubStats = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        setLiveStats(docSnap.data());
      } else {
        setLiveStats({
          totalPins: 0,
          totalClicks: 0,
          totalCommission: 0,
          totalFollowers: 0
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/stats/summary`);
    });

    // Listen to scheduled posts
    const postsRef = collection(db, "users", user.uid, "scheduledPosts");
    const qPosts = query(postsRef, where("status", "==", "pending"));
    const unsubPosts = onSnapshot(qPosts, (snap) => {
      setScheduledCount(snap.size);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/scheduledPosts`);
    });

    // Check Pinterest connection
    const tokenRef = doc(db, "users", user.uid, "private", "pinterest");
    const unsubToken = onSnapshot(tokenRef, (doc) => {
      setIsPinterestConnected(doc.exists());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/private/pinterest`);
    });

    // Listen to daily performance (last 7 days)
    const perfRef = collection(db, "users", user.uid, "dailyPerformance");
    const q = query(perfRef, orderBy("date", "desc"), limit(7));
    const unsubPerf = onSnapshot(q, (querySnap) => {
      const data = querySnap.docs.map(doc => doc.data()).reverse();
      if (data.length > 0) {
        setLiveChartData(data.map(d => ({
          name: d.date.split('-').slice(1).join('/'), // MM/DD format
          clicks: d.clicks,
          sales: d.sales
        })));
      } else {
        // Default empty state
        setLiveChartData([
          { name: 'Sen', clicks: 0, sales: 0 },
          { name: 'Sel', clicks: 0, sales: 0 },
          { name: 'Rab', clicks: 0, sales: 0 },
          { name: 'Kam', clicks: 0, sales: 0 },
          { name: 'Jum', clicks: 0, sales: 0 },
          { name: 'Sab', clicks: 0, sales: 0 },
          { name: 'Min', clicks: 0, sales: 0 },
        ]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/dailyPerformance`);
    });

    return () => {
      unsubStats();
      unsubPerf();
      unsubPosts();
      unsubToken();
    };
  }, [user]);

  const stats = [
    { 
      label: "Total Pin", 
      value: liveStats ? liveStats.totalPins.toLocaleString() : "0", 
      trend: "+12%", 
      icon: Sparkles, 
      color: "text-emerald-500", 
      bg: "bg-emerald-500/10" 
    },
    { 
      label: "Terjadwal", 
      value: scheduledCount.toLocaleString(), 
      trend: "Pending", 
      icon: Calendar, 
      color: "text-blue-500", 
      bg: "bg-blue-500/10" 
    },
    { 
      label: "Estimasi Komisi", 
      value: liveStats ? `Rp ${(liveStats.totalCommission / 1000000).toFixed(1)}M` : "Rp 0", 
      trend: "+8%", 
      icon: DollarSign, 
      color: "text-amber-500", 
      bg: "bg-amber-500/10" 
    },
    { 
      label: "Followers", 
      value: liveStats ? liveStats.totalFollowers.toLocaleString() : "0", 
      trend: "+15%", 
      icon: Users, 
      color: "text-purple-500", 
      bg: "bg-purple-500/10" 
    },
  ];

  const chartData = liveChartData.length > 0 ? liveChartData : [
    { name: 'Sen', clicks: 400, sales: 240 },
    { name: 'Sel', clicks: 700, sales: 480 },
    { name: 'Rab', clicks: 450, sales: 300 },
    { name: 'Kam', clicks: 900, sales: 600 },
    { name: 'Jum', clicks: 650, sales: 450 },
    { name: 'Sab', clicks: 850, sales: 550 },
    { name: 'Min', clicks: 550, sales: 400 },
  ];

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
            Selamat Datang, {user?.displayName?.split(' ')[0] || 'Affiliator'}! 👋
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium">Pantau performa affiliate Pinterest Anda hari ini.</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <button className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold">Hari Ini</button>
          <button className="px-4 py-2 rounded-xl text-zinc-500 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">7 Hari</button>
          <button className="px-4 py-2 rounded-xl text-zinc-500 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">30 Hari</button>
        </div>
      </header>

      {!isPinterestConnected && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-[#E60023] rounded-[2rem] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-red-500/20"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Pinterest Belum Terhubung</h3>
              <p className="text-red-100 text-sm font-medium">Hubungkan akun Pinterest Anda untuk mulai menjadwalkan Pin secara otomatis.</p>
            </div>
          </div>
          <Link 
            to="/scheduler"
            className="px-8 py-3 bg-white text-[#E60023] font-black rounded-xl hover:bg-zinc-100 transition-all active:scale-95 whitespace-nowrap"
          >
            Hubungkan Sekarang
          </Link>
        </motion.div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-card p-6 rounded-[2rem] group relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity rotate-12 group-hover:rotate-0 duration-700">
              <stat.icon size={120} />
            </div>
            <div className="flex justify-between items-start relative z-10">
              <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform duration-500`}>
                <stat.icon size={24} />
              </div>
              <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">{stat.trend}</span>
            </div>
            <div className="mt-6 relative z-10">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-3xl font-black text-zinc-900 dark:text-white mt-1">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-card p-8 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">Statistik Performa</h3>
              <p className="text-xs text-zinc-400 font-medium">Klik & Penjualan 7 hari terakhir</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Klik</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sales</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#1f2937" : "#f3f4f6"} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: darkMode ? '#18181b' : '#ffffff', 
                    borderRadius: '16px', 
                    border: 'none',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ fontWeight: 800, fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorClicks)" />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">Checklist Harian</h3>
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">3/5 Selesai</span>
          </div>
          <div className="space-y-4 flex-1">
            {[
              { task: "Generate 5 Pin Baru", done: true },
              { task: "Jadwalkan untuk Besok", done: true },
              { task: "Cek Link Rusak", done: true },
              { task: "Riset Keyword Viral", done: false },
              { task: "Update Bio Pinterest", done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl group cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${item.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-200 dark:border-zinc-700'}`}>
                  {item.done && <CheckSquare size={14} />}
                </div>
                <span className={`text-sm font-bold ${item.done ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>{item.task}</span>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all">
            Lihat Semua Tugas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">Aktivitas Terakhir</h3>
            <button className="text-xs font-black text-emerald-600 uppercase tracking-widest hover:underline">Lihat Semua</button>
          </div>
          <div className="space-y-4">
            {[
              { action: "Pin Terjadwal", desc: "Serum Brightening Viral", time: "2 menit yang lalu", icon: Calendar, color: "text-blue-500", bg: "bg-blue-500/10" },
              { action: "Konten Dibuat", desc: "Sepatu Sneakers Korea", time: "15 menit yang lalu", icon: Sparkles, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { action: "Link Ditambahkan", desc: "https://shope.ee/abc123", time: "1 jam yang lalu", icon: Target, color: "text-purple-500", bg: "bg-purple-500/10" },
            ].map((act, i) => (
              <div key={i} className="flex items-center justify-between p-6 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className={`p-3 ${act.bg} ${act.color} rounded-xl`}>
                    <act.icon size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-zinc-900 dark:text-white tracking-tight">{act.action}</h4>
                    <p className="text-xs text-zinc-500 font-medium">{act.desc}</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{act.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">Tips Hari Ini</h3>
          <div className="glass-card p-8 rounded-[3rem] bg-gradient-to-br from-emerald-600 to-teal-700 text-white space-y-6 shadow-2xl shadow-emerald-500/20">
            <div className="p-3 bg-white/20 rounded-2xl w-fit">
              <TrendingUp size={24} />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-black tracking-tight">Gunakan Alt Text!</h4>
              <p className="text-emerald-50/80 text-sm font-medium leading-relaxed">
                Menambahkan Alt Text pada Pin Anda dapat meningkatkan jangkauan hingga 30% karena membantu algoritma memahami isi gambar.
              </p>
            </div>
            <button className="w-full py-4 bg-white text-emerald-600 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all">
              Pelajari Selengkapnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Pages ---

const Generator = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const [productName, setProductName] = useState("");
  const [niche, setNiche] = useState("skincare");
  const [recommendedBoard, setRecommendedBoard] = useState("");
  const [tags, setTags] = useState("");
  const [contentType, setContentType] = useState("full");
  const [imageStyle, setImageStyle] = useState("product");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const historyRef = collection(db, "users", user.uid, "generatorHistory");
    const q = query(historyRef, orderBy("createdAt", "desc"), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/generatorHistory`);
    });
    return () => unsub();
  }, [user]);

  const niches = ["skincare", "dapur", "fashion", "ibu & bayi", "home decor", "gadget", "elektronik", "otomotif"];
  const contentTypes = [
    { id: "full", label: "Paket Viral Lengkap" },
    { id: "caption", label: "Caption Pin" },
    { id: "judul", label: "Judul Pin" },
    { id: "deskripsi", label: "Deskripsi/Alt Text" },
    { id: "keyword", label: "Keywords" },
    { id: "nama board", label: "Nama Board" },
  ];

  const imageStyles = [
    { id: "product", label: "Produk Saja (Estetik)" },
    { id: "lifestyle_carry", label: "Dibawa Cewek Asia" },
    { id: "lifestyle_use", label: "Dipakai Cewek Asia" },
  ];

  const handleGenerate = async () => {
    if (!productName && !selectedImage) {
      setError("Masukkan nama produk atau upload gambar produk.");
      return;
    }
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY || "";
      const ai = new GoogleGenAI({ apiKey });
      
      let prompt = "";
      let parts: any[] = [];

      if (contentType === "full") {
        let styleInstruction = "";
        if (imageStyle === "lifestyle_carry") {
          styleInstruction = "Hasil generate gambar HARUS menampilkan seorang wanita Asia cantik yang sedang membawa/memegang produk tersebut di lokasi yang estetis (seperti cafe, taman, atau interior minimalis).";
        } else if (imageStyle === "lifestyle_use") {
          styleInstruction = "Hasil generate gambar HARUS menampilkan seorang wanita Asia cantik yang sedang menggunakan produk tersebut (misal: mengoleskan skincare, memakai baju, atau menggunakan gadget) dengan ekspresi bahagia.";
        } else {
          styleInstruction = "Hasil generate gambar HARUS menampilkan produk itu sendiri dalam setting flatlay atau studio yang sangat estetis.";
        }

        prompt = `Anda adalah pakar Pinterest Affiliate.
Analisis produk: "${productName}" (Niche: "${niche}").
${recommendedBoard ? `Gunakan rekomendasi papan ini: "${recommendedBoard}".` : ""}
${tags ? `Gunakan tag/keywords ini: "${tags}".` : ""}
${selectedImage ? "PENTING: Gunakan gambar referensi yang saya unggah sebagai acuan utama produk." : ""}
KONSEP VISUAL: ${styleInstruction}

Berikan output dalam format berikut (SANGAT PENTING):

TITLE: [Judul Pin Viral, maks 100 karakter]
CAPTION: [Caption yang memicu klik, maks 500 karakter]
DESCRIPTION: [Deskripsi SEO Pinterest, maks 500 karakter]
ALT_TEXT: [Teks alternatif untuk aksesibilitas, jelaskan apa yang ada di gambar secara mendetail, maks 500 karakter]
KEYWORDS: [5-10 keywords dipisahkan koma]
BOARD_NAME: [Rekomendasi nama board]
IMAGE_GENERATION_PROMPT: [Prompt detail untuk menghasilkan gambar sesuai KONSEP VISUAL di atas. Pastikan produk SAMA PERSIS dengan referensi. Jika ada orang, pastikan wanita Asia yang modis. Fokus pada pencahayaan, komposisi vertikal (rasio 2:3), dan gaya estetis Pinterest. Fokus pada pencahayaan, komposisi vertikal, dan teks overlay.]

Pastikan label (TITLE:, CAPTION:, dll) ada di awal baris.`;
      } else {
        prompt = `Anda adalah ahli Pinterest. Buatkan ${contentType === 'keyword' ? '20' : '10'} variasi ${contentType} untuk produk "${productName}" niche "${niche}". Bahasa Indonesia. Format: nomor. isi`;
      }

      if (selectedImage) {
        const base64Data = selectedImage.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg"
          }
        });
      }
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts },
      });

      const text = response.text || "";
      
      if (contentType === "full") {
        setResults([text]);
        
        const imagePromptMatch = text.match(/IMAGE_GENERATION_PROMPT:\s*([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
        let finalImageUrl = null;
        
        if (imagePromptMatch) {
          try {
            const imageParts: any[] = [
              { text: `Gunakan gambar referensi ini sebagai subjek utama. Buatlah gambar Pin Pinterest baru yang menampilkan produk yang SAMA PERSIS dengan gambar referensi, namun dengan komposisi vertikal (rasio 2:3), pencahayaan profesional, dan gaya estetis Pinterest. Prompt: ${imagePromptMatch[1].trim()}` }
            ];

            if (selectedImage) {
              const base64Data = selectedImage.split(',')[1];
              const mimeType = selectedImage.split(',')[0].split(':')[1].split(';')[0];
              imageParts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              });
            }

            const imageResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: [{ parts: imageParts }],
              config: {
                imageConfig: {
                  aspectRatio: "3:4"
                }
              }
            });
            
            for (const part of imageResponse.candidates[0].content.parts) {
              if (part.inlineData) {
                finalImageUrl = `data:image/png;base64,${part.inlineData.data}`;
                setGeneratedImageUrl(finalImageUrl);
                break;
              }
            }
          } catch (imgErr) {
            console.error("Image Generation Error:", imgErr instanceof Error ? imgErr.message : String(imgErr));
          }
        }
      } else {
        const parsed = text.split(/\d+\.\s+/).filter((s: string) => s.trim().length > 0);
        setResults(parsed);
      }

      if (user) {
        try {
          const historyRef = collection(db, "users", user.uid, "generatorHistory");
          await addDoc(historyRef, {
            uid: user.uid,
            product: productName || "Produk dari Gambar",
            type: contentType,
            prompt: prompt,
            result: text,
            imageUrl: generatedImageUrl,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/generatorHistory`);
        }
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, idx: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(typeof idx === 'number' ? idx : 999);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleSchedule = (text: string) => {
    navigate("/scheduler", { state: { prefillText: text, generatedImage: generatedImageUrl } });
  };

  const parseFullResult = (text: string) => {
    const extractField = (fieldName: string) => {
      const regex = new RegExp(`(?:\\*\\*|###)?\\s*${fieldName}:\\s*\\**\\s*([\\s\\S]*?)(?=\\n(?:\\*\\*|###)?\\s*[A-Z_]+:|$)`, 'i');
      const match = text.match(regex);
      return match ? match[1].trim().replace(/\*\*$/, '') : "";
    };

    return {
      title: extractField('TITLE'),
      caption: extractField('CAPTION'),
      description: extractField('DESCRIPTION'),
      altText: extractField('ALT_TEXT'),
      keywords: extractField('KEYWORDS'),
      board: extractField('BOARD_NAME')
    };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 font-black uppercase tracking-widest text-[10px]">
            <Sparkles size={14} />
            <span>AI Powered Engine</span>
          </div>
          <h1 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tighter">Content Generator</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Ubah ide produk menjadi konten Pinterest viral dalam hitungan detik.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => {
              setResults([]);
              setGeneratedImageUrl(null);
              setProductName("");
              setSelectedImage(null);
            }}
            className="px-6 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 font-bold hover:text-zinc-900 dark:hover:text-white transition-all"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* Left Column: Inputs */}
        <div className="xl:col-span-4 space-y-8">
          <div className="glass-card p-8 rounded-[3rem] space-y-8 border border-zinc-200 dark:border-zinc-800 shadow-xl">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">1. Visual Referensi</label>
              <div className="relative group">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="product-image"
                />
                <label 
                  htmlFor="product-image"
                  className="flex flex-col items-center justify-center w-full h-64 rounded-[2.5rem] border-2 border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:border-emerald-500/50 hover:bg-emerald-50/10 transition-all cursor-pointer overflow-hidden relative"
                >
                  {selectedImage ? (
                    <>
                      <img src={selectedImage} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <p className="text-white text-xs font-bold">Ganti Gambar</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-4 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm mb-3">
                        <Plus size={24} className="text-emerald-500" />
                      </div>
                      <p className="text-xs font-black text-zinc-500">Upload Foto Produk</p>
                      <p className="text-[10px] text-zinc-400 mt-1">PNG, JPG up to 5MB</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">2. Detail Produk</label>
                <input 
                  type="text" 
                  placeholder="Nama Produk (misal: Serum Glow)"
                  className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-bold"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Niche</label>
                  <select 
                    className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-bold capitalize appearance-none"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                  >
                    {niches.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Style Gambar</label>
                  <select 
                    className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-bold appearance-none"
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                  >
                    {imageStyles.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Jenis Konten</label>
                <div className="grid grid-cols-2 gap-2">
                  {contentTypes.map(type => (
                    <button
                      key={type.id}
                      onClick={() => setContentType(type.id)}
                      className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        contentType === type.id 
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg" 
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              disabled={loading || (!productName && !selectedImage)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-6 rounded-[2rem] flex items-center justify-center gap-3 transition-all shadow-2xl shadow-emerald-600/20 active:scale-[0.98]"
            >
              {loading ? <RefreshCw className="animate-spin" /> : <Sparkles size={24} />}
              <span className="text-lg">{loading ? "Generating..." : "Mulai Generate"}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Results & Preview */}
        <div className="xl:col-span-8 space-y-8">
          {loading ? (
            <div className="glass-card p-20 rounded-[3rem] flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-emerald-500/20 rounded-full animate-ping absolute inset-0"></div>
                <div className="w-24 h-24 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin relative z-10"></div>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tight">AI Sedang Bekerja...</h3>
                <p className="text-zinc-500 font-medium">Menganalisis produk, meriset keyword, dan melukis gambar estetik untuk Anda.</p>
              </div>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Result Text */}
              <div className="space-y-6">
                {contentType === "full" ? (
                  <div className="space-y-4">
                    {Object.entries(parseFullResult(results[0])).map(([key, val]) => (
                      <div key={key} className="glass-card p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                          <button 
                            onClick={() => copyToClipboard(val, key)}
                            className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-emerald-500 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed">{val || "Tidak ditemukan"}</p>
                      </div>
                    ))}
                    <button 
                      onClick={() => handleSchedule(results[0])}
                      className="w-full py-5 bg-[#E60023] text-white rounded-[2rem] font-black flex items-center justify-center gap-3 shadow-2xl shadow-red-600/20 active:scale-95 transition-all mt-4"
                    >
                      <Calendar size={20} />
                      Jadwalkan ke Pinterest
                    </button>
                  </div>
                ) : (
                  <div className="glass-card p-8 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black tracking-tight capitalize">{contentType} Variasi</h3>
                    </div>
                    <div className="space-y-3">
                      {results.map((res, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl group">
                          <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{res}</p>
                          <button 
                            onClick={() => copyToClipboard(res, i)}
                            className="p-2 text-zinc-400 hover:text-emerald-500 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pin Preview */}
              <div className="space-y-6">
                <div className="sticky top-24">
                  <div className="text-center mb-4">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pinterest Live Preview</span>
                  </div>
                  <div className="max-w-[340px] mx-auto bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                    <div className="aspect-[2/3] bg-zinc-100 dark:bg-zinc-800 relative group">
                      {generatedImageUrl ? (
                        <img src={generatedImageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center space-y-4">
                          <Sparkles size={48} className="text-zinc-200 animate-pulse" />
                          <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Gambar Sedang Dibuat...</p>
                        </div>
                      )}
                      <div className="absolute top-4 right-4">
                        <div className="bg-[#E60023] text-white px-4 py-2 rounded-full font-black text-xs shadow-lg">Simpan</div>
                      </div>
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-black leading-tight line-clamp-2">
                          {parseFullResult(results[0]).title || "Judul Pin Anda Akan Muncul Di Sini"}
                        </h4>
                        {parseFullResult(results[0]).board && (
                          <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                            Board: {parseFullResult(results[0]).board}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-zinc-200"></div>
                        <span className="text-xs font-bold text-zinc-500">Akun Pinterest Anda</span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                        {parseFullResult(results[0]).description || "Deskripsi SEO yang menarik akan muncul di sini untuk meningkatkan jangkauan."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-20 rounded-[3rem] border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center space-y-6">
              <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-[2rem]">
                <Sparkles size={48} className="text-zinc-300" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tight text-zinc-400">Belum Ada Konten</h3>
                <p className="text-zinc-400 font-medium max-w-xs mx-auto">Isi detail produk di sebelah kiri untuk mulai membuat konten viral.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Scheduler = () => {
  const { user, loading: authLoading } = useAuth();
  const { settings } = useUserSettings();
  const location = useLocation();
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [boards, setBoards] = useState<any[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    altText: "",
    link: "",
    imageUrl: "",
    boardId: "",
    scheduledAt: "",
    tags: "",
    recommendedBoard: ""
  });

  useEffect(() => {
    if (location.state?.prefillText) {
      const text = location.state.prefillText;
      const genImage = location.state.generatedImage;
      
      const extractField = (fieldName: string) => {
        const regex = new RegExp(`(?:\\*\\*|###)?\\s*${fieldName}:\\s*\\**\\s*([\\s\\S]*?)(?=\\n(?:\\*\\*|###)?\\s*[A-Z_]+:|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim().replace(/\*\*$/, '') : null;
      };

      const title = extractField('TITLE');
      const description = extractField('DESCRIPTION');
      const altText = extractField('ALT_TEXT');
      const caption = extractField('CAPTION');
      const boardName = extractField('BOARD_NAME');
      const keywords = extractField('KEYWORDS');
      
      setFormData(prev => ({
        ...prev,
        title: title || prev.title,
        description: description || caption || text,
        altText: altText || prev.altText,
        imageUrl: genImage || prev.imageUrl,
        tags: keywords || prev.tags,
        recommendedBoard: boardName || prev.recommendedBoard
      }));

      if (boardName && boards.length > 0) {
        const recommendedBoard = boardName.toLowerCase();
        const matchedBoard = boards.find(b => 
          b.name.toLowerCase().includes(recommendedBoard) || 
          recommendedBoard.includes(b.name.toLowerCase())
        );
        if (matchedBoard) {
          setFormData(prev => ({ ...prev, boardId: matchedBoard.id }));
        }
      }
    }
  }, [location.state, boards]);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading && !user) setLoading(false);
      return;
    }

    const postsRef = collection(db, "users", user.uid, "scheduledPosts");
    const q = query(postsRef, orderBy("scheduledAt", "asc"));
    const unsubPosts = onSnapshot(q, (snap) => {
      setScheduledPosts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/scheduledPosts`);
    });

    const tokenRef = doc(db, "users", user.uid, "private", "pinterest");
    const unsubToken = onSnapshot(tokenRef, (doc) => {
      if (doc.exists()) {
        setIsConnected(true);
        fetchBoards(doc.data().accessToken);
      } else {
        setIsConnected(false);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/private/pinterest`);
      setLoading(false);
    });

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PINTEREST_AUTH_SUCCESS') {
        // Token will be updated via onSnapshot
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      unsubPosts();
      unsubToken();
      window.removeEventListener('message', handleMessage);
    };
  }, [user]);

  const fetchBoards = async (token: string) => {
    setBoardsLoading(true);
    try {
      const response = await axios.get("https://api.pinterest.com/v5/boards", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBoards(response.data.items || []);
    } catch (err) {
      console.error("Error fetching boards:", err instanceof Error ? err.message : String(err));
    } finally {
      setBoardsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!user) return;
    try {
      const clientId = settings?.pinterestClientId || "";
      const url = clientId 
        ? `/api/auth/pinterest/url?uid=${user.uid}&clientId=${clientId}`
        : `/api/auth/pinterest/url?uid=${user.uid}`;
        
      const response = await axios.get(url);
      const { url: authUrl } = response.data;
      const popup = window.open(authUrl, 'pinterest_oauth', 'width=600,height=700');
      
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        alert("Popup terblokir! Silakan izinkan popup untuk menghubungkan Pinterest.");
      }
    } catch (err) {
      console.error("Error connecting Pinterest:", err instanceof Error ? err.message : String(err));
      alert("Gagal mendapatkan URL autentikasi. Pastikan PINTEREST_CLIENT_ID sudah diatur di Settings.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title || !formData.link || !formData.scheduledAt) return;

    try {
      const postsRef = collection(db, "users", user.uid, "scheduledPosts");
      await addDoc(postsRef, {
        ...formData,
        uid: user.uid,
        status: "pending",
        scheduledAt: new Date(formData.scheduledAt),
        createdAt: serverTimestamp()
      });
      setFormData({ title: "", description: "", altText: "", link: "", imageUrl: "", boardId: "", scheduledAt: "", tags: "", recommendedBoard: "" });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/scheduledPosts`);
    }
  };

  const deletePost = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "scheduledPosts", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/scheduledPosts/${id}`);
    }
  };

  if (authLoading || (user && loading)) return <div className="p-10 text-center text-zinc-500 font-bold">Memuat data penjadwalan...</div>;

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-20 text-center space-y-6">
        <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto text-zinc-400">
          <LogIn size={40} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Silakan Masuk</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Anda harus masuk menggunakan akun Google untuk mengakses fitur Scheduler dan mengelola postingan Pinterest Anda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-600 font-black uppercase tracking-widest text-[10px]">
            <Calendar size={14} />
            <span>Smart Scheduler</span>
          </div>
          <h1 className="text-5xl font-black text-zinc-900 dark:text-white tracking-tighter">Pin Scheduler</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Atur jadwal postingan Anda untuk jangkauan maksimal secara otomatis.</p>
        </div>
        {!isConnected ? (
          <button 
            onClick={handleConnect}
            className="bg-[#E60023] text-white font-black px-8 py-4 rounded-2xl flex items-center gap-3 shadow-xl shadow-red-500/20 active:scale-95 transition-all"
          >
            <Settings size={20} /> Hubungkan Pinterest
          </button>
        ) : (
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 px-6 py-3 rounded-2xl border border-emerald-100 dark:border-emerald-800">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-widest">Pinterest Terhubung</span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* Left: Form */}
        <div className="xl:col-span-4 space-y-8">
          <div className="glass-card p-8 rounded-[3rem] space-y-8 border border-zinc-200 dark:border-zinc-800 shadow-xl">
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Buat Jadwal Baru</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Judul Pin</label>
                <input 
                  type="text" 
                  placeholder="Judul menarik..."
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Link Affiliate / Tujuan</label>
                <input 
                  type="url" 
                  placeholder="https://shope.ee/..."
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold"
                  value={formData.link}
                  onChange={e => setFormData({...formData, link: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Deskripsi Pin</label>
                <textarea 
                  placeholder="Deskripsi SEO..."
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold min-h-[100px]"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Alt Text (Aksesibilitas)</label>
                <textarea 
                  placeholder="Jelaskan apa yang ada di gambar..."
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold min-h-[80px]"
                  value={formData.altText}
                  onChange={e => setFormData({...formData, altText: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">URL Gambar</label>
                <input 
                  type="url" 
                  placeholder="https://..."
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold"
                  value={formData.imageUrl}
                  onChange={e => setFormData({...formData, imageUrl: e.target.value})}
                />
                {formData.imageUrl && (
                  <div className="mt-4 rounded-[2rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 aspect-[2/3] w-full max-w-[240px] mx-auto shadow-2xl">
                    <img src={formData.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Pilih Board</label>
                <select 
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold appearance-none"
                  value={formData.boardId}
                  onChange={e => setFormData({...formData, boardId: e.target.value})}
                >
                  <option value="">{boardsLoading ? "Memuat Board..." : "Pilih Board..."}</option>
                  {boards.map(board => (
                    <option key={board.id} value={board.id}>{board.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Tags / Keywords (Pisahkan dengan koma)</label>
                <input 
                  type="text" 
                  placeholder="skincare, beauty, viral..."
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold"
                  value={formData.tags}
                  onChange={e => setFormData({...formData, tags: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Waktu Posting</label>
                <input 
                  type="datetime-local" 
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold"
                  value={formData.scheduledAt}
                  onChange={e => setFormData({...formData, scheduledAt: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="submit"
                  disabled={!formData.title || !formData.link || !formData.scheduledAt}
                  className="bg-[#E60023] hover:bg-[#ad001a] disabled:opacity-50 text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 transition-all shadow-2xl shadow-red-600/20 active:scale-[0.98]"
                >
                  <Calendar size={20} />
                  Jadwalkan
                </button>
                <button 
                  type="button"
                  onClick={async () => {
                    const now = new Date();
                    now.setMinutes(now.getMinutes() + 1);
                    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setFormData(prev => ({ ...prev, scheduledAt: localNow }));
                    // Trigger submit manually after state update
                    setTimeout(() => {
                      const form = document.querySelector('form');
                      if (form) form.requestSubmit();
                    }, 100);
                  }}
                  disabled={!formData.title || !formData.link}
                  className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 transition-all shadow-xl active:scale-[0.98]"
                >
                  <TrendingUp size={20} />
                  Post Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: List */}
        <div className="xl:col-span-8 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Antrean Posting</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-zinc-300"></div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Pending: {scheduledPosts.filter(p => p.status === 'pending').length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Posted: {scheduledPosts.filter(p => p.status === 'posted').length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {scheduledPosts.length > 0 ? scheduledPosts.map((post, idx) => (
                <motion.div 
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden group hover:border-red-500/30 transition-all shadow-sm hover:shadow-2xl hover:shadow-red-500/5"
                >
                  <div className="flex h-full">
                    <div className="w-32 bg-zinc-100 dark:bg-zinc-800 relative">
                      {post.imageUrl ? (
                        <img src={post.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <Image size={24} />
                        </div>
                      )}
                      <div className="absolute top-2 left-2">
                        <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                          post.status === 'posted' ? 'bg-emerald-500 text-white' : 
                          post.status === 'failed' ? 'bg-red-500 text-white' : 
                          'bg-zinc-900 text-white'
                        }`}>
                          {post.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 p-6 flex flex-col justify-between">
                      <div className="space-y-2">
                        <h4 className="font-black text-zinc-900 dark:text-white leading-tight line-clamp-2">{post.title}</h4>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Clock size={12} />
                          <span className="text-[10px] font-bold">
                            {post.scheduledAt?.toDate ? post.scheduledAt.toDate().toLocaleString() : new Date(post.scheduledAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                            <Target size={12} />
                          </div>
                          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            {boards.find(b => b.id === post.boardId)?.name || 'Board Umum'}
                          </span>
                        </div>
                        <button 
                          onClick={() => deletePost(post.id)}
                          className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div className="col-span-full py-20 text-center space-y-6 glass-card rounded-[3rem] border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                  <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] flex items-center justify-center mx-auto text-zinc-300">
                    <Calendar size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-zinc-400 tracking-tight">Belum Ada Jadwal</h3>
                    <p className="text-zinc-400 font-medium max-w-xs mx-auto">Mulai jadwalkan Pin Anda untuk membangun audiens yang setia.</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

const LinkManager = () => {
  const { user } = useAuth();
  const [links, setLinks] = useState<any[]>([]);
  const [formData, setFormData] = useState({ name: "", url: "", niche: "skincare", commission: "" });
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) {
      setLinks([]);
      return;
    }
    const linksRef = collection(db, "users", user.uid, "links");
    const q = query(linksRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setLinks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/links`);
    });
    return () => unsub();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.url || !user) return;
    
    try {
      const linksRef = collection(db, "users", user.uid, "links");
      await addDoc(linksRef, {
        ...formData,
        uid: user.uid,
        createdAt: serverTimestamp()
      });
      setFormData({ name: "", url: "", niche: "skincare", commission: "" });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/links`);
    }
  };

  const deleteLink = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "links", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/links/${id}`);
    }
  };

  const filteredLinks = links.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    l.niche.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">Link Manager</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Simpan dan kelola link afiliasi Shopee Anda dengan rapi.</p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm w-full md:w-80">
          <Search size={18} className="text-zinc-400 ml-2" />
          <input 
            type="text" 
            placeholder="Cari link atau niche..."
            className="bg-transparent border-none outline-none text-sm font-medium w-full text-zinc-900 dark:text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <div className="glass-card p-8 rounded-[2.5rem] space-y-10">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Nama Produk</label>
            <input 
              type="text" 
              placeholder="Contoh: Serum Glow"
              className="w-full px-5 py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Link Shopee</label>
            <input 
              type="url" 
              placeholder="https://shope.ee/..."
              className="w-full px-5 py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
              value={formData.url}
              onChange={e => setFormData({...formData, url: e.target.value})}
            />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Komisi (%)</label>
            <input 
              type="number" 
              placeholder="5"
              className="w-full px-5 py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
              value={formData.commission}
              onChange={e => setFormData({...formData, commission: e.target.value})}
            />
          </div>
          <button type="submit" className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-zinc-900/10 dark:shadow-white/5 active:scale-95">
            <Plus size={20} /> Tambah Link
          </button>
        </form>
      </div>

      <div className="glass-card rounded-[2.5rem] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Produk & Link</th>
                <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Niche</th>
                <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Komisi</th>
                <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
              <AnimatePresence mode="popLayout">
                {filteredLinks.map(link => (
                  <motion.tr 
                    key={link.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group"
                  >
                    <td className="px-8 py-6">
                      <p className="font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 transition-colors">{link.name}</p>
                      <p className="text-xs text-zinc-500 truncate max-w-[250px] mt-1 font-medium">{link.url}</p>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-400">{link.niche}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">{link.commission}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right space-x-2">
                      <button 
                        onClick={() => navigator.clipboard.writeText(link.url)} 
                        className="p-3 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all active:scale-90"
                        title="Salin Link"
                      >
                        <Copy size={18} />
                      </button>
                      <button 
                        onClick={() => deleteLink(link.id)} 
                        className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-90"
                        title="Hapus"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredLinks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-3xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-zinc-300">
                        <LinkIcon size={32} />
                      </div>
                      <p className="text-zinc-500 font-medium">Tidak ada link yang ditemukan.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Checklist = () => {
  const { user } = useAuth();
  const defaultTasks = [
    "Riset produk terlaris di Shopee",
    "Generate 10 caption Pinterest",
    "Buat/Edit visual Pin (Canva/CapCut)",
    "Upload minimal 5 Pin baru",
    "Update link di bio Pinterest",
    "Cek analytics Pinterest mingguan",
    "Engage dengan Pin di niche yang sama"
  ];

  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const checklistRef = collection(db, "users", user.uid, "checklist");
    const q = query(checklistRef, where("date", "==", today));

    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        // Initialize for today
        for (const t of defaultTasks) {
          await addDoc(checklistRef, {
            uid: user.uid,
            text: t,
            completed: false,
            date: today,
            createdAt: serverTimestamp()
          });
        }
      } else {
        setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/checklist`);
    });

    return () => unsub();
  }, [user]);

  const toggleTask = async (id: string, currentStatus: boolean) => {
    if (!user) return;
    try {
      const taskRef = doc(db, "users", user.uid, "checklist", id);
      await updateDoc(taskRef, {
        completed: !currentStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/checklist/${id}`);
    }
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">Daily Checklist</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Konsistensi adalah kunci sukses Pinterest Affiliate.</p>
        </div>
        <div className="glass-card p-6 rounded-3xl flex items-center gap-4 min-w-[240px]">
          <div className="relative w-16 h-16">
            <svg className="w-full h-full -rotate-90">
              <circle cx="32" cy="32" r="28" fill="transparent" stroke="currentColor" strokeWidth="6" className="text-zinc-100 dark:text-zinc-800" />
              <motion.circle 
                cx="32" cy="32" r="28" fill="transparent" stroke="currentColor" strokeWidth="6" 
                strokeDasharray={175.9}
                initial={{ strokeDashoffset: 175.9 }}
                animate={{ strokeDashoffset: 175.9 - (175.9 * progress) / 100 }}
                className="text-emerald-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-zinc-900 dark:text-white">
              {Math.round(progress)}%
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Progress Hari Ini</p>
            <p className="text-lg font-black text-zinc-900 dark:text-white">{completedCount}/{tasks.length} Selesai</p>
          </div>
        </div>
      </header>

      <div className="glass-card p-10 rounded-[3rem] space-y-10">
        <div className="grid grid-cols-1 gap-4">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => toggleTask(task.id, task.completed)}
              className={`group w-full flex items-center gap-5 p-6 rounded-[2rem] border-2 transition-all text-left relative overflow-hidden ${
                task.completed 
                  ? "bg-emerald-50/30 dark:bg-emerald-900/5 border-emerald-100 dark:border-emerald-800/30 text-zinc-400" 
                  : "bg-white dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/5"
              }`}
            >
              <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all duration-500 ${
                task.completed ? "bg-emerald-500 border-emerald-500 text-white rotate-12" : "border-zinc-200 dark:border-zinc-700 group-hover:border-emerald-500"
              }`}>
                {task.completed ? <CheckSquare size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 group-hover:bg-emerald-500 transition-colors"></div>}
              </div>
              <span className={`flex-1 text-lg font-bold transition-all ${task.completed ? "line-through opacity-50" : ""}`}>{task.text}</span>
              {task.completed && (
                <div className="absolute right-0 top-0 h-full w-1 bg-emerald-500"></div>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {progress === 100 && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="p-10 bg-zinc-900 rounded-[2.5rem] text-white text-center relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 to-transparent"></div>
              <div className="relative z-10">
                <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-600/40 rotate-12">
                  <Sparkles size={40} />
                </div>
                <h3 className="text-3xl font-black tracking-tight">Luar Biasa! 🎉</h3>
                <p className="text-zinc-400 mt-2 text-lg font-medium">Semua tugas hari ini selesai. Istirahatlah sejenak!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const Estimasi = () => {
  const [inputs, setInputs] = useState({
    pins: 100,
    clicks: 10,
    conversion: 2,
    orderValue: 50000,
    commission: 5
  });

  const totalClicks = inputs.pins * inputs.clicks;
  const totalOrders = Math.round(totalClicks * (inputs.conversion / 100));
  const totalSales = totalOrders * inputs.orderValue;
  const estCommission = totalSales * (inputs.commission / 100);

  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header>
        <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">Estimasi Komisi</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Hitung potensi penghasilan Anda dari Pinterest.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 glass-card p-8 rounded-[2.5rem] space-y-8">
          <h2 className="text-xl font-black text-zinc-800 dark:text-zinc-200 tracking-tight">Parameter Input</h2>
          
          <div className="space-y-6">
            {[
              { label: "Jumlah Pin Aktif", key: "pins" },
              { label: "Klik per Pin / Bulan", key: "clicks" },
              { label: "% Konversi Order", key: "conversion" },
              { label: "Rata-rata Nilai Order (IDR)", key: "orderValue" },
              { label: "% Komisi Rata-rata", key: "commission" }
            ].map((field) => (
              <div key={field.key} className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">{field.label}</label>
                <input 
                  type="number" 
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-bold" 
                  value={(inputs as any)[field.key]} 
                  onChange={e => setInputs({...inputs, [field.key]: Number(e.target.value)})} 
                />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-card p-8 rounded-[2.5rem] group hover:border-emerald-500/50 transition-all">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Klik / Bulan</p>
              <p className="text-5xl font-black text-zinc-900 dark:text-white mt-3 tracking-tighter group-hover:text-emerald-600 transition-colors">{totalClicks.toLocaleString()}</p>
              <div className="flex items-center gap-2 mt-4">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <ArrowUpRight size={14} />
                </div>
                <p className="text-xs text-zinc-500 font-medium tracking-tight">Estimasi trafik ke link Shopee</p>
              </div>
            </div>
            <div className="glass-card p-8 rounded-[2.5rem] group hover:border-emerald-500/50 transition-all">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Estimasi Order</p>
              <p className="text-5xl font-black text-zinc-900 dark:text-white mt-3 tracking-tighter group-hover:text-emerald-600 transition-colors">{totalOrders.toLocaleString()}</p>
              <div className="flex items-center gap-2 mt-4">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <CheckSquare size={14} />
                </div>
                <p className="text-xs text-zinc-500 font-medium tracking-tight">Berdasarkan rate konversi {inputs.conversion}%</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-125 transition-transform duration-1000">
              <DollarSign size={150} />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-emerald-400 font-black uppercase tracking-[0.2em] text-xs">Estimasi Komisi Bersih</p>
                  <p className="text-6xl font-black mt-4 tracking-tighter">{formatIDR(estCommission)}</p>
                </div>
                <div className="bg-emerald-600 p-4 rounded-3xl shadow-xl shadow-emerald-600/40 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                  <TrendingUp size={32} />
                </div>
              </div>
              <div className="mt-12 pt-10 border-t border-white/10 grid grid-cols-2 gap-8">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Total Penjualan (GMV)</p>
                  <p className="text-2xl font-black mt-1">{formatIDR(totalSales)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">ROI Waktu</p>
                  <p className="text-2xl font-black mt-1 text-emerald-400">Sangat Tinggi</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-zinc-100 dark:bg-zinc-800/50 rounded-3xl text-xs text-zinc-500 font-medium leading-relaxed border border-zinc-200 dark:border-zinc-800/50">
            <span className="font-black text-zinc-700 dark:text-zinc-300 uppercase mr-2">Disclaimer:</span>
            Angka di atas adalah estimasi matematis. Hasil nyata sangat bergantung pada kualitas visual Pin, relevansi produk, dan algoritma Pinterest yang dinamis.
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Settings Page ---

const SettingsPage = () => {
  const { user } = useAuth();
  const { settings, loading } = useUserSettings();
  const [formData, setFormData] = useState({
    geminiApiKey: "",
    pinterestClientId: "",
    pinterestClientSecret: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (settings) {
      setFormData({
        geminiApiKey: settings.geminiApiKey || "",
        pinterestClientId: settings.pinterestClientId || "",
        pinterestClientSecret: settings.pinterestClientSecret || ""
      });
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    setSaveStatus("idle");
    
    try {
      const settingsRef = doc(db, "users", user.uid, "private", "settings");
      await setDoc(settingsRef, {
        ...formData,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSaveStatus("success");
    } catch (err) {
      console.error("Save Settings Error:", err);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  if (loading) return <div className="p-10 text-center text-zinc-500 font-bold">Memuat pengaturan...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <header>
        <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Kelola API Key dan kredensial aplikasi Anda untuk keamanan maksimal.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-8">
          <div className="glass-card p-8 rounded-[2.5rem] space-y-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600">
                <Sparkles size={20} />
              </div>
              <h2 className="text-xl font-black text-zinc-800 dark:text-zinc-200 tracking-tight">AI Configuration</h2>
            </div>

            <form onSubmit={handleSave} className="space-y-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Gemini API Key</label>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1">
                    Dapatkan Key <ExternalLink size={10} />
                  </a>
                </div>
                <input 
                  type="password" 
                  placeholder="Masukkan Gemini API Key Anda..."
                  className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium"
                  value={formData.geminiApiKey}
                  onChange={(e) => setFormData({...formData, geminiApiKey: e.target.value})}
                />
                <p className="text-[10px] text-zinc-400 font-medium ml-1">Kosongkan untuk menggunakan API Key default sistem.</p>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-red-500/10 rounded-xl text-[#E60023]">
                    <Calendar size={20} />
                  </div>
                  <h2 className="text-xl font-black text-zinc-800 dark:text-zinc-200 tracking-tight">Pinterest API Credentials</h2>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Pinterest Client ID</label>
                      <a href="https://developers.pinterest.com/apps/" target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-red-600 hover:underline flex items-center gap-1">
                        Developer Portal <ExternalLink size={10} />
                      </a>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Pinterest App Client ID..."
                      className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-medium"
                      value={formData.pinterestClientId}
                      onChange={(e) => setFormData({...formData, pinterestClientId: e.target.value})}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Pinterest Client Secret</label>
                    <input 
                      type="password" 
                      placeholder="Pinterest App Client Secret..."
                      className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-medium"
                      value={formData.pinterestClientSecret}
                      onChange={(e) => setFormData({...formData, pinterestClientSecret: e.target.value})}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400 font-medium mt-4 ml-1">PENTING: Jika diisi, sistem akan menggunakan kredensial ini untuk proses OAuth Pinterest.</p>
              </div>

              <button 
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 rounded-3xl font-black flex items-center justify-center gap-3 transition-all shadow-2xl active:scale-[0.98] ${
                  saveStatus === "success" 
                    ? "bg-emerald-600 text-white" 
                    : saveStatus === "error"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                }`}
              >
                {isSaving ? <RefreshCw className="animate-spin" /> : saveStatus === "success" ? <CheckSquare /> : <Sparkles />}
                <span className="text-lg">
                  {isSaving ? "Menyimpan..." : saveStatus === "success" ? "Berhasil Disimpan!" : saveStatus === "error" ? "Gagal Menyimpan" : "Simpan Pengaturan"}
                </span>
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-zinc-900 dark:bg-zinc-800 p-8 rounded-[2.5rem] text-white space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Info size={80} />
            </div>
            <h3 className="text-xl font-black tracking-tight relative z-10">Informasi Keamanan</h3>
            <div className="space-y-4 relative z-10">
              <div className="flex gap-4">
                <div className="mt-1 p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                  <CheckSquare size={14} />
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">API Key disimpan di sub-koleksi privat Firestore yang hanya bisa diakses oleh Anda.</p>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                  <CheckSquare size={14} />
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">Gunakan API Key sendiri untuk menghindari limitasi kuota sistem dan menjaga privasi data.</p>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                  <CheckSquare size={14} />
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">Kredensial Pinterest diperlukan jika Anda ingin menggunakan App Pinterest Anda sendiri.</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <h4 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-widest">Callback URL</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">Gunakan URL ini di Dashboard Pinterest Developer Anda sebagai Redirect URI:</p>
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700 break-all">
              <code className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">{window.location.origin}/auth/callback</code>
            </div>
          </div>

          <div className="bg-emerald-600 p-8 rounded-[2.5rem] text-white space-y-4 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <CheckSquare size={80} />
            </div>
            <h4 className="text-sm font-black uppercase tracking-widest relative z-10">Status Lisensi</h4>
            <div className="relative z-10">
              <p className="text-2xl font-black">PRO ACTIVE</p>
              <p className="text-xs text-emerald-100 mt-1 font-medium">Lisensi Anda aktif selamanya.</p>
            </div>
            <div className="pt-4 border-t border-emerald-500/50 relative z-10">
              <p className="text-[10px] uppercase font-black tracking-widest opacity-60">Key Terdaftar</p>
              <p className="text-xs font-mono mt-1">{settings?.licenseKey || "XXXX-XXXX-XXXX-XXXX"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Panduan = () => {
  const steps = [
    { title: "Daftar Shopee Affiliate", desc: "Daftar di program Shopee Affiliate dan pastikan akun Anda sudah disetujui.", icon: "01" },
    { title: "Riset Produk Viral", desc: "Cari produk yang sedang tren atau memiliki visual menarik di Shopee.", icon: "02" },
    { title: "Generate Konten AI", desc: "Gunakan menu Generator untuk membuat caption dan judul yang SEO-friendly.", icon: "03" },
    { title: "Upload ke Pinterest", desc: "Buat Pin dengan visual estetik. Masukkan link affiliate Anda di kolom link.", icon: "04" },
    { title: "Pantau & Optimasi", desc: "Cek analytics secara berkala dan ulangi proses untuk produk yang paling banyak klik.", icon: "05" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <header>
        <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight">Panduan Cepat</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">Langkah demi langkah membangun aset digital di Pinterest.</p>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {steps.map((step, idx) => (
          <motion.div 
            key={idx} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="flex gap-8 p-8 glass-card rounded-[2.5rem] items-start group hover:border-emerald-500/50 transition-all"
          >
            <div className="w-16 h-16 rounded-3xl bg-emerald-600 text-white flex items-center justify-center text-2xl font-black flex-shrink-0 shadow-xl shadow-emerald-600/20 group-hover:rotate-6 transition-transform">
              {step.icon}
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">{step.title}</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed font-medium">{step.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-zinc-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 to-transparent"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-600 rounded-xl">
              <Sparkles size={20} />
            </div>
            <h2 className="text-2xl font-black tracking-tight">Tips Pro Affiliate</h2>
          </div>
          <ul className="space-y-6">
            {[
              "Gunakan Video Pin (Idea Pin) untuk jangkauan yang lebih luas.",
              "Konsisten upload minimal 3-5 Pin setiap hari.",
              "Gunakan keyword yang relevan di judul dan deskripsi Pin."
            ].map((tip, i) => (
              <li key={i} className="flex gap-4 items-start group/tip">
                <div className="mt-1.5 w-2 h-2 rounded-full bg-emerald-500 group-hover/tip:scale-150 transition-transform"></div>
                <span className="text-zinc-300 font-medium leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <AuthProvider>
      <Router>
        <AppContent darkMode={darkMode} setDarkMode={setDarkMode} />
      </Router>
    </AuthProvider>
  );
}

// --- Landing Page
const LandingPage = ({ darkMode, setDarkMode }: { darkMode: boolean, setDarkMode: (v: boolean) => void }) => {
  const { signIn } = useAuth();

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-zinc-900 dark:text-white selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass dark:bg-black/50 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-900 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 font-black text-2xl tracking-tighter">
            <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-lg shadow-emerald-500/20">
              <TrendingUp size={24} />
            </div>
            <span className="text-gradient">ShopeePin <span className="text-emerald-500">Pro</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Fitur</a>
            <a href="#demo" className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Demo</a>
            <a href="#pricing" className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Harga</a>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
              onClick={signIn}
              className="px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-48 pb-32 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px] animate-pulse delay-700"></div>
        </div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4">
              <Sparkles size={14} />
              <span>The Future of Pinterest Affiliate</span>
            </div>
            <h1 className="text-6xl md:text-9xl font-black tracking-tighter leading-[0.85] mb-8">
              DOMINASI <span className="text-emerald-600">PINTEREST</span><br />
              DENGAN <span className="italic serif text-zinc-400">MAGIC AI</span>
            </h1>
            <p className="max-w-3xl mx-auto text-xl md:text-2xl text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
              Satu-satunya tool yang Anda butuhkan untuk membangun kerajaan affiliate Shopee di Pinterest. Otomatis, Estetik, dan Terukur.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
              <button 
                onClick={signIn}
                className="w-full sm:w-auto px-12 py-7 bg-emerald-600 text-white rounded-[2.5rem] font-black text-xl shadow-2xl shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Mulai Sekarang <ArrowRight size={24} />
              </button>
              <a href="#demo" className="px-12 py-7 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white rounded-[2.5rem] font-black text-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all">
                Lihat Demo
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section id="features" className="py-32 px-6 bg-zinc-50 dark:bg-zinc-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter">FITUR <span className="text-emerald-600">UNGGULAN</span></h2>
            <p className="text-zinc-500 font-medium">Semua yang Anda butuhkan untuk sukses di Pinterest Affiliate.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Large Card */}
            <div className="md:col-span-2 glass-card p-10 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between group hover:border-emerald-500/50 transition-all overflow-hidden relative">
              <div className="relative z-10 space-y-4">
                <div className="p-4 bg-emerald-500 text-white rounded-2xl w-fit shadow-lg shadow-emerald-500/20">
                  <Sparkles size={32} />
                </div>
                <h3 className="text-4xl font-black tracking-tight">AI Content Generator</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md">
                  Hasilkan Judul, Deskripsi, Alt Text, dan Gambar estetik secara otomatis hanya dari satu link produk.
                </p>
              </div>
              <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
              <img 
                src="https://picsum.photos/seed/ai/800/600" 
                className="absolute right-0 bottom-0 w-1/2 h-1/2 object-cover rounded-tl-[3rem] opacity-20 group-hover:opacity-40 transition-all"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Small Card */}
            <div className="glass-card p-10 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 space-y-6 hover:border-blue-500/50 transition-all">
              <div className="p-4 bg-blue-500 text-white rounded-2xl w-fit shadow-lg shadow-blue-500/20">
                <Calendar size={32} />
              </div>
              <h3 className="text-3xl font-black tracking-tight">Smart Scheduler</h3>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                Jadwalkan ratusan Pin untuk berminggu-minggu kedepan. Biarkan sistem bekerja saat Anda tidur.
              </p>
            </div>

            {/* Small Card */}
            <div className="glass-card p-10 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 space-y-6 hover:border-purple-500/50 transition-all">
              <div className="p-4 bg-purple-500 text-white rounded-2xl w-fit shadow-lg shadow-purple-500/20">
                <Target size={32} />
              </div>
              <h3 className="text-3xl font-black tracking-tight">Niche Targeting</h3>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                Optimasi konten berdasarkan niche spesifik: Skincare, Fashion, Home Decor, dan lainnya.
              </p>
            </div>

            {/* Large Card */}
            <div className="md:col-span-2 glass-card p-10 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row gap-10 items-center hover:border-orange-500/50 transition-all">
              <div className="flex-1 space-y-4">
                <div className="p-4 bg-orange-500 text-white rounded-2xl w-fit shadow-lg shadow-orange-500/20">
                  <TrendingUp size={32} />
                </div>
                <h3 className="text-4xl font-black tracking-tight">Analytics & Strategy</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                  Pantau performa link affiliate Anda dan dapatkan strategi harian untuk meningkatkan konversi.
                </p>
              </div>
              <div className="flex-1 w-full h-48 bg-zinc-100 dark:bg-zinc-800 rounded-[2rem] overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-end gap-2 h-24">
                    {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                      <div key={i} className="flex-1 bg-orange-500 rounded-t-lg" style={{ height: `${h}%` }}></div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="demo" className="py-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-10">
              <div className="space-y-4">
                <h2 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">
                  LIHAT <span className="text-emerald-600">KEAJAIBANNYA</span><br />
                  SECARA LANGSUNG
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-xl font-medium leading-relaxed">
                  Kami mensimulasikan bagaimana AI kami bekerja untuk Anda. Dari input sederhana menjadi aset digital yang menghasilkan uang.
                </p>
              </div>
              
              <div className="space-y-6">
                {[
                  { step: "01", title: "Input Link Produk", desc: "Masukkan link Shopee atau nama produk." },
                  { step: "02", title: "AI Generation", desc: "AI membuat konten visual & teks SEO-friendly." },
                  { step: "03", title: "Auto Publish", desc: "Sistem menjadwalkan postingan ke Pinterest." },
                ].map((s, i) => (
                  <div key={i} className="flex gap-6 items-center group">
                    <span className="text-4xl font-black text-zinc-200 dark:text-zinc-800 group-hover:text-emerald-500 transition-colors">{s.step}</span>
                    <div>
                      <h4 className="font-black text-xl tracking-tight">{s.title}</h4>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-10 bg-emerald-500/10 rounded-full blur-[100px] animate-pulse"></div>
              <div className="relative glass-card p-10 rounded-[4rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl scale-110 md:scale-100">
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-400"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">ShopeePin AI Engine</span>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                      <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Input</p>
                      <p className="text-lg font-bold italic text-zinc-600">"Serum Brightening Viral Shopee..."</p>
                    </div>

                    <div className="flex gap-6">
                      <div className="w-1/2 aspect-[2/3] bg-zinc-100 dark:bg-zinc-800 rounded-3xl overflow-hidden relative group">
                        <img src="https://picsum.photos/seed/skincare/400/600" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                          <Sparkles className="text-white animate-bounce" size={40} />
                        </div>
                      </div>
                      <div className="w-1/2 space-y-4">
                        <div className="space-y-2">
                          <div className="h-3 w-full bg-emerald-500/20 rounded-full"></div>
                          <div className="h-3 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded-full"></div>
                        </div>
                        <div className="space-y-2">
                          <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full"></div>
                          <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full"></div>
                          <div className="h-2 w-1/2 bg-zinc-100 dark:bg-zinc-800 rounded-full"></div>
                        </div>
                        <div className="pt-4">
                          <div className="h-12 w-full bg-emerald-600 rounded-2xl flex items-center justify-center">
                            <CheckSquare className="text-white" size={20} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-32 px-6 bg-zinc-900 text-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[100px]"></div>
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter">APA KATA <span className="text-emerald-500">MEREKA?</span></h2>
            <p className="text-zinc-400 font-medium">Ribuan affiliator telah meningkatkan penghasilan mereka dengan ShopeePin.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: "Andi Pratama", role: "Full-time Affiliator", text: "Dulu saya butuh 5 jam sehari buat bikin konten. Sekarang cuma 15 menit! Komisi naik 3x lipat.", avatar: "https://i.pravatar.cc/150?u=andi" },
              { name: "Siti Aminah", role: "Ibu Rumah Tangga", text: "Tool ini sangat mudah digunakan. Sambil jaga anak, saya bisa jadwalkan ratusan pin. Sangat membantu!", avatar: "https://i.pravatar.cc/150?u=siti" },
              { name: "Budi Santoso", role: "Digital Marketer", text: "Fitur AI-nya gila banget. Gambar yang dihasilkan estetik dan judulnya bener-bener SEO friendly.", avatar: "https://i.pravatar.cc/150?u=budi" },
            ].map((t, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -10 }}
                className="p-10 rounded-[3rem] bg-white/5 border border-white/10 backdrop-blur-xl space-y-6"
              >
                <div className="flex gap-1 text-amber-400">
                  {[...Array(5)].map((_, i) => <Sparkles key={i} size={16} fill="currentColor" />)}
                </div>
                <p className="text-lg font-medium italic text-zinc-300 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-4 pt-4 border-t border-white/10">
                  <img src={t.avatar} className="w-12 h-12 rounded-2xl object-cover" />
                  <div>
                    <h4 className="font-black text-white">{t.name}</h4>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-40 px-6 relative">
        <div className="max-w-4xl mx-auto text-center space-y-16">
          <div className="space-y-6">
            <h2 className="text-6xl md:text-8xl font-black tracking-tighter">HARGA <span className="text-emerald-600">LIFETIME</span></h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-xl font-medium">Beli sekali, gunakan selamanya. Tanpa biaya bulanan yang mencekik.</p>
          </div>

          <div className="relative group">
            <div className="absolute -inset-4 bg-emerald-500/20 rounded-[5rem] blur-3xl group-hover:bg-emerald-500/30 transition-all"></div>
            <div className="relative glass-card p-16 rounded-[4rem] border-4 border-emerald-500 shadow-2xl space-y-12">
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-10 py-4 bg-emerald-600 text-white rounded-full font-black text-lg uppercase tracking-widest shadow-2xl">
                PRO VERSION
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <span className="text-3xl font-bold text-zinc-400 line-through">Rp 499.000</span>
                  <span className="text-8xl font-black text-zinc-900 dark:text-white tracking-tighter">Rp 199k</span>
                </div>
                <p className="text-emerald-600 font-black uppercase tracking-widest text-sm">Promo Terbatas! Sisa 12 Lisensi Lagi.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-2xl mx-auto">
                {[
                  "Unlimited AI Content",
                  "Pinterest Auto Scheduler",
                  "Multi-Account Support",
                  "SEO Keyword Research",
                  "AI Image Generation",
                  "Link Management",
                  "Daily Strategy Guide",
                  "Free Updates Selamanya",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 font-bold text-zinc-600 dark:text-zinc-300">
                    <div className="p-1.5 bg-emerald-500 rounded-full text-white">
                      <CheckSquare size={16} />
                    </div>
                    {item}
                  </div>
                ))}
              </div>

              <button 
                onClick={signIn}
                className="w-full py-8 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-[2.5rem] font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all"
              >
                Dapatkan Akses Sekarang
              </button>
              
              <div className="flex items-center justify-center gap-8 pt-4">
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-black">2.5k+</span>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Users</span>
                </div>
                <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800"></div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-black">4.9/5</span>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Rating</span>
                </div>
                <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800"></div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-black">100%</span>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Secure</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-32 px-6 border-t border-zinc-100 dark:border-zinc-900">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2 space-y-6">
            <div className="flex items-center gap-3 font-black text-3xl tracking-tighter">
              <div className="bg-emerald-600 p-2 rounded-xl text-white">
                <TrendingUp size={24} />
              </div>
              <span>ShopeePin <span className="text-emerald-500">Pro</span></span>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-lg font-medium max-w-md">
              Membantu affiliate marketer membangun passive income melalui Pinterest dengan teknologi AI tercanggih.
            </p>
            <div className="flex gap-6 text-zinc-400">
              <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors"><Instagram size={24} /></a>
              <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors"><Twitter size={24} /></a>
            </div>
          </div>
          
          <div className="space-y-6">
            <h4 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-400">Product</h4>
            <ul className="space-y-4 font-bold text-zinc-600 dark:text-zinc-300">
              <li><a href="#features" className="hover:text-emerald-500 transition-colors">Features</a></li>
              <li><a href="#demo" className="hover:text-emerald-500 transition-colors">Demo</a></li>
              <li><a href="#pricing" className="hover:text-emerald-500 transition-colors">Pricing</a></li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-400">Legal</h4>
            <ul className="space-y-4 font-bold text-zinc-600 dark:text-zinc-300">
              <li><a href="#" className="hover:text-emerald-500 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-emerald-500 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-emerald-500 transition-colors">Cookie Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-20 mt-20 border-t border-zinc-100 dark:border-zinc-900 text-center">
          <p className="text-zinc-400 text-sm font-medium">© 2024 ShopeePin Pro. All rights reserved. Dibuat dengan ❤️ untuk para pejuang affiliate.</p>
        </div>
      </footer>
    </div>
  );
};

function AppContent({ darkMode, setDarkMode }: { darkMode: boolean, setDarkMode: (v: boolean) => void }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-500 font-bold animate-pulse">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage darkMode={darkMode} setDarkMode={setDarkMode} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black transition-colors duration-500 selection:bg-emerald-500/30">
      <LicenseGate>
        <div className="flex flex-col md:flex-row">
          <Sidebar isOpen={true} setIsOpen={() => {}} darkMode={darkMode} setDarkMode={setDarkMode} />
          
          <main className="flex-1 p-4 md:p-10 pb-24 md:pb-10">
            <div className="max-w-6xl mx-auto">
              <Routes>
                <Route path="/dashboard" element={<Dashboard darkMode={darkMode} />} />
                <Route path="/generator" element={<Generator />} />
                <Route path="/scheduler" element={<Scheduler />} />
                <Route path="/links" element={<LinkManager />} />
                <Route path="/checklist" element={<Checklist />} />
                <Route path="/estimasi" element={<Estimasi />} />
                <Route path="/panduan" element={<Panduan />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </LicenseGate>
    </div>
  );
}

const LicenseGate = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { settings, loading } = useUserSettings();
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  if (loading) return null;

  if (!user) return <>{children}</>;

  if (settings?.isActivated) return <>{children}</>;

  const handleActivate = async () => {
    if (!key.trim()) return;
    setActivating(true);
    setError("");
    try {
      // CARA MUDAH: Cek ke Master Key di Environment Variable
      const masterKey = (import.meta as any).env.VITE_MASTER_LICENSE_KEY || "SHOPEEPIN-PRO-2024";
      
      if (key.trim() !== masterKey) {
        setError("Kode aktivasi tidak valid.");
        setActivating(false);
        return;
      }

      // Simpan status aktif ke profil user agar tidak perlu input lagi
      const settingsRef = doc(db, "users", user.uid, "private", "settings");
      await setDoc(settingsRef, {
        isActivated: true,
        licenseKey: key.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });

    } catch (err) {
      console.error("Activation Error:", err);
      setError("Terjadi kesalahan saat aktivasi.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card p-10 rounded-[3rem] text-center space-y-8 shadow-2xl"
      >
        <div className="mx-auto w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
          <CheckSquare size={40} />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Aktivasi Aplikasi</h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Masukkan kode lisensi untuk membuka semua fitur ShopeePin Pro.</p>
        </div>

        <div className="space-y-4">
          <input 
            type="text" 
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="w-full px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-mono text-center tracking-widest uppercase"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
          {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
          
          <button 
            onClick={handleActivate}
            disabled={activating || !key}
            className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black shadow-xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {activating ? <RefreshCw className="animate-spin" /> : <Sparkles size={18} />}
            {activating ? "Mengaktivasi..." : "Aktivasi Sekarang"}
          </button>
        </div>

        <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 font-medium">Belum punya kode? Hubungi admin untuk pembelian lisensi.</p>
          <button className="mt-4 text-emerald-600 font-bold text-sm hover:underline">Hubungi WhatsApp Admin</button>
        </div>
      </motion.div>
    </div>
  );
};
