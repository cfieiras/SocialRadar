import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({
  area: "local"
})
import { LayoutDashboard, Play, Settings, Zap, Users, Heart, MessageSquare, ShieldCheck, Square, Lock, ArrowRight, LogIn, AlertCircle, Radar } from "lucide-react"
import { useState, useEffect } from "react"
import { supabase } from "./lib/supabaseClient"
import { refreshUserProfile, resolveStoredAvatarUrl } from "./lib/instagramApi"
import "./style.css"
import socialRadarLogo from "url:~assets/social_radar_logo.png"

import { UpdateBanner, SubscriptionScreen, LoginScreen, SignUpScreen } from "./components/AuthScreens"

function BetaBadge({ label = "Beta", className = "" }: { label?: string, className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-300 ${className}`}>
      {label}
    </span>
  )
}

function getBotStatusCopy(isRunning: boolean, stopReason?: string) {
  const normalizedReason = (stopReason || "").toLowerCase()

  if (isRunning) {
    return {
      title: "Active & Running",
      subtitle: "Automation is currently active",
      borderClass: "border-emerald-500/40",
      dotClass: "bg-emerald-500 animate-pulse",
      textClass: "text-emerald-400",
      iconClass: "text-emerald-500/30"
    }
  }

  if (normalizedReason.includes("session lost") || normalizedReason.includes("logout") || normalizedReason.includes("session expired")) {
    return {
      title: "Paused: Session Expired",
      subtitle: "Log back into Instagram to continue",
      borderClass: "border-amber-500/30",
      dotClass: "bg-amber-400",
      textClass: "text-amber-300",
      iconClass: "text-amber-500/40"
    }
  }

  if (normalizedReason.includes("account changed") || normalizedReason.includes("account switch")) {
    return {
      title: "Stopped: Account Switched",
      subtitle: "Reload the bot for the active account",
      borderClass: "border-sky-500/30",
      dotClass: "bg-sky-400",
      textClass: "text-sky-300",
      iconClass: "text-sky-500/40"
    }
  }

  if (normalizedReason.includes("manual")) {
    return {
      title: "Stopped Manually",
      subtitle: "Ready to launch when you are",
      borderClass: "border-white/10",
      dotClass: "bg-slate-500",
      textClass: "text-slate-400",
      iconClass: "text-primary-500/30"
    }
  }

  return {
    title: "Standby Mode",
    subtitle: stopReason || "Ready to launch when you are",
    borderClass: "border-white/10",
    dotClass: "bg-slate-500",
    textClass: "text-slate-400",
    iconClass: "text-primary-500/30"
  }
}








function IndexPopup() {
  const [userStats] = useStorage({ key: "currentUserStats", instance: storage }, null)
  const currentUsername = userStats?.username || "global"
  const [stats] = useStorage({ key: `${currentUsername}_stats`, instance: storage }, { follows: 0, likes: 0, dms: 0, unfollows: 0 })
  const [isRunning, setIsRunning] = useStorage({ key: "isRunning", instance: storage }, false)
  const [lastReport] = useStorage({ key: `${currentUsername}_lastSessionReport`, instance: storage }, null)
  // New Auth State
  const [session, setSession] = useStorage({ key: "session", instance: storage }, { isLoggedIn: false, user: null, isPremium: false })
  const [isRegistering, setIsRegistering] = useState(false)
  // New Analytics Data

  // Re-verify subscription on load (Case: Session persisted but subscription expired)
  useEffect(() => {
    const verifySubscription = async () => {
      if (!session?.user?.id) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium, beta_access')
        .eq('id', session.user.id)
        .single()

      const hasAccess = profile
        ? (profile.is_premium === true || profile.beta_access === true)
        : true

      if (hasAccess) {
        // Confirmed access
        if (!session.isPremium) {
          setSession(prev => ({ ...prev, isPremium: true }))
        }
      } else {
        // No access (only when a profile exists and explicitly has no access)
        if (session.isPremium) {
          console.log("Access invalid or expired.")
          setSession(prev => ({ ...prev, isPremium: false }))
        }
      }
    }

    if (session?.isLoggedIn) {
      verifySubscription()
      // Refresh IG Profile data on enter
      refreshUserProfile()
    }
  }, [session?.isLoggedIn])

  const openDashboard = () => {
    chrome.tabs.create({
      url: "./tabs/dashboard.html"
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await chrome.storage.local.remove(['session_token', 'user_uid'])
    setSession({ isLoggedIn: false, user: null, isPremium: false })
    setIsRunning(false) // Stop bot on logout
  }

  // Terms of Service Gate
  const [termsAccepted] = useStorage({ key: "termsAccepted", instance: storage }, false)
  const safeAvatarSrc = resolveStoredAvatarUrl(userStats) || `https://ui-avatars.com/api/?name=${encodeURIComponent(userStats?.username || "user")}&background=0f172a&color=fff`
  const botStatus = getBotStatusCopy(isRunning, lastReport?.stopReason)

  if (!termsAccepted) {
    return (
      <div className="w-[380px] min-h-[500px] p-8 bg-slate-950 text-white flex flex-col items-center justify-center text-center font-sans">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
          <ShieldCheck className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-black mb-3">Welcome Aboard</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Before you start growing your account, please review and accept our Terms of Service.
        </p>
        <button
          onClick={() => chrome.tabs.create({ url: "tabs/onboarding.html" })}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all"
        >
          Review Terms
        </button>
      </div>
    )
  }

  // Auth Gate
  if (!session?.isLoggedIn) {
    if (isRegistering) {
      return <SignUpScreen
        onBack={() => setIsRegistering(false)}
        onLogin={(user, isPremium) => setSession({ isLoggedIn: true, user: user, isPremium: isPremium })}
      />
    }
    return <LoginScreen onLogin={(user, isPremium) => setSession({ isLoggedIn: true, user: user, isPremium: isPremium })} onGoToSignUp={() => setIsRegistering(true)} />
  }

  // Access Gate: If logged in but without premium/beta access
  if (!session?.isPremium) {
    // We define a check function to pass down
    const verifyNow = async () => {
      if (!session?.user?.id) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium, beta_access')
        .eq('id', session.user.id)
        .single()

      const hasAccess = profile
        ? (profile.is_premium === true || profile.beta_access === true)
        : true
      if (hasAccess) {
        setSession(prev => ({ ...prev, isPremium: true }))
      } else {
        // Optional: Show a toast? For now just re-rendering same screen
      }
    }

    return <SubscriptionScreen user={session.user} onCheckPayment={verifyNow} onLogout={handleLogout} />
  }

  return (
    <div className="w-[380px] min-h-[500px] p-6 bg-slate-950 text-slate-50 flex flex-col font-sans overflow-hidden relative">
      <UpdateBanner />
      <div className="absolute top-4 right-4 z-20">
        <BetaBadge />
      </div>
      {/* Background Glow */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary-600/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl" />

      {/* Header / User Card */}
      <header className="mb-8 relative z-10 transition-all duration-500">
        {userStats ? (
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600 flex items-center justify-center overflow-hidden">
                  <img
                    src={safeAvatarSrc}
                    alt="profile"
                    className="w-full h-full rounded-full border-2 border-slate-950 object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${userStats.username}&background=0f172a&color=fff`
                    }}
                  />
                </div>
                {/* Verified Badge Mockup if we had logic, here just static or hidden */}
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight leading-none text-white">{userStats.fullName || userStats.username}</h1>
                <p className="text-xs text-slate-400 font-bold mb-1">@{userStats.username}</p>
                <p className="text-[10px] text-slate-500 line-clamp-1 max-w-[150px]">{userStats.bio}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-rose-400" title="Sign Out">
                <LogOutIcon className="w-4 h-4" />
              </button>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[9px] font-black tracking-widest uppercase border border-emerald-500/20">PRO</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Radar className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">SocialRadar</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> PRO ENABLED
                </p>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-rose-400" title="Sign Out">
              <LogOutIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </header>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8 relative z-10">
        {[
          { icon: Users, label: "Follows", val: stats?.follows || 0, color: "text-blue-400" },
          { icon: Heart, label: "Likes", val: stats?.likes || 0, color: "text-rose-400" },
          { icon: Zap, label: "Unfollows", val: stats?.unfollows || 0, color: "text-amber-400" },
          { icon: MessageSquare, label: "DMs", val: stats?.dms || 0, color: "text-emerald-400" },
        ].map((item, idx) => {
          const ItemIcon = item.icon
          return (
            <div
              key={idx}
              className="glass-morphism rounded-2xl p-4 flex flex-col items-center gap-2"
            >
              <ItemIcon className={`w-4 h-4 ${item.color}`} />
              <span className="text-sm font-black">{item.val}</span>
              <span className="text-[9px] text-slate-400 uppercase tracking-wider">{item.label}</span>
            </div>
          )
        })}
      </div>

      {/* Status Card */}
      <div
        className={`glass-morphism rounded-2xl p-5 mb-8 flex items-center justify-between relative overflow-hidden border ${botStatus.borderClass}`}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400 font-medium">System Status</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${botStatus.dotClass}`} />
            <span className={`text-sm font-semibold ${botStatus.textClass}`}>
              {botStatus.title}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">{botStatus.subtitle}</span>
        </div>
        <ShieldCheck className={`w-8 h-8 ${botStatus.iconClass}`} />
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-3 relative z-10">

        <button
          onClick={openDashboard}
          className="w-full py-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all mb-4"
        >
          Full Dashboard
          <LayoutDashboard className="w-5 h-5" />
        </button>
      </div>

      {/* Footer */}
      <footer className="text-center mt-6">
        <p className="text-[10px] text-slate-500 font-medium tracking-wide">
          Safe Mode • Human Emulation Active • v{chrome.runtime.getManifest().version}
        </p>
      </footer>
    </div>
  )
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
  )
}

export default IndexPopup
