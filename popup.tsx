import { useStorage } from "@plasmohq/storage/hook"
import { LayoutDashboard, Play, Settings, Zap, Users, Heart, MessageSquare, ShieldCheck, Square, Lock, ArrowRight, LogIn, AlertCircle } from "lucide-react"
import { useState, useEffect } from "react"
import { supabase } from "./lib/supabaseClient"
import "./style.css"

const REPO_OWNER = "cfieiras"
const REPO_NAME = "SocialRadar"

function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const manifest = chrome.runtime.getManifest()
        const currentVersion = manifest.version

        // Fetch remote version from Gist
        const res = await fetch(`https://gist.githubusercontent.com/cfieiras/a74789aead58df67812f31099ffe7e02/raw/social-radar-version.json?t=${Date.now()}`)
        if (!res.ok) return
        const remotePkg = await res.json()
        const remoteVersion = remotePkg.version

        if (remoteVersion !== currentVersion) {
          // Simple string comparison, ideally use semver
          setUpdateAvailable(remoteVersion)
        }
      } catch (e) {
        console.error("Update check failed", e)
      }
    }
    checkUpdate()
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="bg-emerald-500 text-white px-4 py-2 text-xs font-bold flex items-center justify-between relative z-50">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        Update Available: v{updateAvailable}
      </div>
      <a
        href={`https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`}
        target="_blank"
        className="underline hover:text-emerald-100"
      >
        Download
      </a>
    </div>
  )
}

function SubscriptionScreen({ user, onCheckPayment, onLogout }: { user: any, onCheckPayment: () => void, onLogout: () => void }) {
  const [checking, setChecking] = useState(false)

  const handleSubscribe = () => {
    // TODO: REPLACE WITH YOUR ACTUAL STRIPE PAYMENT LINK
    // We pass the user ID as client_reference_id so the webhook knows who paid
    const stripeUrl = `https://buy.stripe.com/test_14A5kD5cveETepM5Dx43S00?client_reference_id=${user.id}&prefilled_email=${user.email}`
    chrome.tabs.create({ url: stripeUrl })
  }

  const handleCheckStatus = async () => {
    setChecking(true)
    await onCheckPayment()
    // Add a small delay for UX or if the check is too fast
    setTimeout(() => setChecking(false), 1000)
  }

  return (
    <div className="w-[380px] min-h-[500px] p-8 bg-slate-950 text-slate-50 flex flex-col font-sans relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="mt-8 mb-6 text-center relative z-10">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 group hover:scale-105 transition-transform">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-2">Upgrade to Pro</h1>
        <p className="text-slate-400 text-sm">Unlock the full power of SocialRadar automation.</p>
      </div>

      <div className="space-y-4 relative z-10 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-slate-200">Unlimited Operations</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Play className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-slate-200">Smart Auto-Follow/Unfollow</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-slate-200">Cloud Security & Sync</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleSubscribe}
        className="w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-emerald-500/25 bg-gradient-to-r from-emerald-600 to-teal-500 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
      >
        Subscribe Now <ArrowRight className="w-4 h-4" />
      </button>

      <button
        onClick={handleCheckStatus}
        disabled={checking}
        className="w-full mt-3 py-3 rounded-xl border border-slate-800 text-slate-400 font-semibold hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2"
      >
        {checking ? <span className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" /> : "I've already paid, refresh"}
      </button>

      <div className="mt-auto text-center relative z-10 pt-4">
        <button onClick={onLogout} className="text-xs text-slate-500 hover:text-rose-400 transition-colors">
          Sign Out / Switch Account
        </button>
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, onGoToSignUp }: { onLogin: (user: any, isPremium: boolean) => void, onGoToSignUp: () => void }) {
  const [rememberedEmail, setRememberedEmail] = useStorage("rememberedEmail", "")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Pre-fill email on load
  useState(() => {
    if (rememberedEmail) {
      setEmail(rememberedEmail)
      setRememberMe(true)
    }
  })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg("")

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    })

    if (error) {
      setErrorMsg(error.message)
      setIsLoading(false)
      return
    }

    if (data.user) {
      // 1. Check Subscription Status
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', data.user.id)
        .single()


      if (profileError) {
        // Error fetching profile, maybe network or doesn't exist?
        // Let's assume not premium for safety, but log it
        console.error("Profile check error:", profileError)
      }

      const isPremium = profile?.is_premium === true

      // 2. Store Session Token Securely in chrome.storage.local


      // 2. Store Session Token Securely in chrome.storage.local
      await chrome.storage.local.set({
        session_token: data.session?.access_token,
        user_uid: data.user.id
      })

      // Handle Remember Me
      if (rememberMe) {
        setRememberedEmail(email)
      } else {
        setRememberedEmail("") // Clear if unchecked
      }

      // Success
      setIsLoading(false)
      onLogin(data.user, isPremium)
    }
  }

  return (
    <div className="w-[380px] min-h-[500px] p-8 bg-slate-950 text-slate-50 flex flex-col font-sans relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <UpdateBanner />

      <div className="mt-8 mb-12 text-center relative z-10">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/20 mb-6 group hover:scale-105 transition-transform">
          <Zap className="w-8 h-8 text-white" fill="white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-2">Welcome Back</h1>
        <p className="text-slate-400 text-sm">{errorMsg ? "Authentication Failed" : "Sign in to access your SocialRadar automation."}</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4 relative z-10">
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-xs font-bold animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1">Email Account</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all placeholder:text-slate-600"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all placeholder:text-slate-600"
            required
          />
        </div>

        <div className="flex items-center gap-2 pl-1">
          <input
            type="checkbox"
            id="remember"
            className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-primary-500 focus:ring-0 focus:ring-offset-0"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <label htmlFor="remember" className="text-xs text-slate-400 font-medium cursor-pointer select-none">Remember my email</label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg shadow-primary-500/25 transition-all flex items-center justify-center gap-2 mt-4 ${isLoading ? "bg-slate-800 cursor-not-allowed" : "bg-gradient-to-r from-primary-600 to-primary-500 hover:shadow-primary-500/40 hover:-translate-y-0.5"}`}
        >
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Sign In <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-auto text-center relative z-10">
        <p className="text-xs text-slate-500">
          Don't have an account? <span onClick={onGoToSignUp} className="text-primary-400 hover:text-primary-300 font-bold cursor-pointer">Sign Up Here</span>
        </p>
      </div>
    </div>
  )
}

function SignUpScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [msg, setMsg] = useState({ type: "", text: "" })

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMsg({ type: "", text: "" })

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })

    setIsLoading(false)

    if (error) {
      setMsg({ type: "error", text: error.message })
    } else {
      setMsg({ type: "success", text: "Account created! Please check your email to confirm." })
    }
  }

  return (
    <div className="w-[380px] min-h-[500px] p-8 bg-slate-950 text-slate-50 flex flex-col font-sans relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="mt-8 mb-8 text-center relative z-10">
        <h1 className="text-2xl font-black tracking-tight mb-2">Create Account</h1>
        <p className="text-slate-400 text-sm">Join SocialRadar today.</p>
      </div>

      <form onSubmit={handleSignUp} className="space-y-4 relative z-10">
        {msg.text && (
          <div className={`p-3 border rounded-xl flex items-center gap-3 text-xs font-bold ${msg.type === "error" ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {msg.text}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all" required />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all" required />
        </div>

        <button type="submit" disabled={isLoading} className="w-full py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2 mt-4">
          {isLoading ? "Creating..." : "Sign Up"}
        </button>
      </form>

      <button onClick={onBack} className="mt-auto text-xs text-slate-500 hover:text-white transition-colors">
        ← Back to Login
      </button>
    </div>
  )
}

function IndexPopup() {
  const [stats] = useStorage("stats", { follows: 0, likes: 0, dms: 0 })
  const [isRunning, setIsRunning] = useStorage("isRunning", false)
  // New Auth State
  const [session, setSession] = useStorage("session", { isLoggedIn: false, user: null, isPremium: false })
  const [isRegistering, setIsRegistering] = useState(false)
  // New Analytics Data
  const [userStats] = useStorage("currentUserStats", null)

  // Re-verify subscription on load (Case: Session persisted but subscription expired)
  useEffect(() => {
    const verifySubscription = async () => {
      if (!session?.user?.id) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', session.user.id)
        .single()

      if (profile?.is_premium) {
        // Confirmed premium
        if (!session.isPremium) {
          setSession(prev => ({ ...prev, isPremium: true }))
        }
      } else {
        // Not premium
        if (session.isPremium) {
          console.log("Subscription invalid or expired.")
          setSession(prev => ({ ...prev, isPremium: false }))
        }
      }
    }

    if (session?.isLoggedIn) {
      verifySubscription()
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

  // Auth Gate
  if (!session?.isLoggedIn) {
    if (isRegistering) {
      return <SignUpScreen onBack={() => setIsRegistering(false)} />
    }
    return <LoginScreen onLogin={(user, isPremium) => setSession({ isLoggedIn: true, user: user, isPremium: isPremium })} onGoToSignUp={() => setIsRegistering(true)} />
  }

  // Subscription Gate: If logged in but NOT premium
  if (!session?.isPremium) {
    // We define a check function to pass down
    const verifyNow = async () => {
      if (!session?.user?.id) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', session.user.id)
        .single()

      if (profile?.is_premium) {
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
      {/* Background Glow */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary-600/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl" />

      {/* Header / User Card */}
      <header className="mb-8 relative z-10 transition-all duration-500">
        {userStats ? (
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600">
                  <img src={userStats.avatarUrl} alt="profile" className="w-full h-full rounded-full border-2 border-slate-950 object-cover" />
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
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl shadow-lg shadow-primary-500/20">
                <Zap className="w-6 h-6 text-white" fill="white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">GrowthBot</h1>
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
      <div className="grid grid-cols-3 gap-3 mb-8 relative z-10">
        {[
          { icon: Users, label: "Followers", val: userStats?.stats?.followers || "—", color: "text-blue-400" },
          { icon: Heart, label: "Following", val: userStats?.stats?.following || "—", color: "text-rose-400" },
          { icon: MessageSquare, label: "Posts", val: userStats?.stats?.posts || "—", color: "text-emerald-400" },
        ].map((item, idx) => (
          <div
            key={idx}
            className="glass-morphism rounded-2xl p-4 flex flex-col items-center gap-2"
          >
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <span className="text-sm font-black">{item.val}</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Status Card */}
      <div
        className={`glass-morphism rounded-2xl p-5 mb-8 flex items-center justify-between relative overflow-hidden border ${isRunning ? "border-emerald-500/40" : "border-white/10"}`}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400 font-medium">System Status</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-500"}`} />
            <span className={`text-sm font-semibold ${isRunning ? "text-emerald-400" : "text-slate-400"}`}>
              {isRunning ? "Active & Running" : "Standby Mode"}
            </span>
          </div>
        </div>
        <ShieldCheck className="w-8 h-8 text-primary-500/30" />
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-3 relative z-10">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary-500/20 ${isRunning
            ? "bg-slate-800 text-slate-300 border border-slate-700"
            : "bg-gradient-to-r from-primary-600 to-primary-500 text-white"
            }`}
        >
          {isRunning ? "Stop Automation" : "Start Automation"}
          {isRunning ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
        </button>

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
