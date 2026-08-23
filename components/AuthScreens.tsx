import { useState, useEffect } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import { LayoutDashboard, Play, Settings, Zap, Users, Heart, MessageSquare, ShieldCheck, Square, Lock, ArrowRight, LogIn, AlertCircle, Radar } from "lucide-react"
import { supabase } from "../lib/supabaseClient"
import socialRadarLogo from "url:~assets/social_radar_logo.png"

const storage = new Storage({
    area: "local"
})

const REPO_OWNER = "cfieiras"
const REPO_NAME = "SocialRadar"
const PASSWORD_RESET_REDIRECT_URL = "https://socialradar-beta.vercel.app/reset-password"
const CLOSED_BETA_ACCESS_EMAIL = "cristianfieiras@gmail.com"

const isNewerVersion = (remote: string, current: string): boolean => {
    const r = remote.split('.').map(Number)
    const c = current.split('.').map(Number)
    for (let i = 0; i < Math.max(r.length, c.length); i++) {
        const rv = r[i] || 0
        const cv = c[i] || 0
        if (rv > cv) return true
        if (rv < cv) return false
    }
    return false
}

export function UpdateBanner() {
    const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const manifest = chrome.runtime.getManifest()
                const currentVersion = manifest.version
                let remoteVersion = ""

                const res = await fetch(`https://raw.githubusercontent.com/cfieiras/SocialRadar/main/package.json?t=${Date.now()}`)
                if (res.ok) {
                    const data = await res.json()
                    remoteVersion = data.version || ""
                } else {
                    const gistRes = await fetch(`https://gist.githubusercontent.com/cfieiras/a74789aead58df67812f31099ffe7e02/raw/social-radar-version.json?t=${Date.now()}`)
                    if (gistRes.ok) {
                        const gistData = await gistRes.json()
                        remoteVersion = gistData.version || ""
                    }
                }

                if (remoteVersion && isNewerVersion(remoteVersion, currentVersion)) {
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

export function SubscriptionScreen({ user, onCheckPayment, onLogout }: { user: any, onCheckPayment: () => void, onLogout: () => void }) {
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
                <div className="mx-auto w-20 h-20 rounded-3xl border border-white/10 bg-white/5 flex items-center justify-center shadow-lg shadow-emerald-500/10 mb-6 group hover:scale-105 transition-transform overflow-hidden">
                    <img src={socialRadarLogo} alt="SocialRadar logo" className="w-16 h-16 object-contain" />
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

export function LoginScreen({ onLogin, onGoToSignUp }: { onLogin: (user: any, isPremium: boolean) => void, onGoToSignUp: () => void }) {
    const [rememberedEmail, setRememberedEmail] = useStorage({ key: "rememberedEmail", instance: storage }, "")
    const [riskDisclosureAccepted, setRiskDisclosureAccepted] = useStorage({ key: "riskDisclosureAccepted", instance: storage }, false)
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [rememberMe, setRememberMe] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isResettingPassword, setIsResettingPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [successMsg, setSuccessMsg] = useState("")

    // Pre-fill email on load
    useEffect(() => {
        if (rememberedEmail) {
            setEmail(rememberedEmail)
            setRememberMe(true)
        }
    }, [rememberedEmail])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!riskDisclosureAccepted) {
            setErrorMsg("You must acknowledge the Instagram policy risk before signing in.")
            setSuccessMsg("")
            return
        }
        setIsLoading(true)
        setErrorMsg("")
        setSuccessMsg("")

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

    const handleForgotPassword = async () => {
        const normalizedEmail = email.trim()

        if (!normalizedEmail) {
            setErrorMsg("Enter your email first so we can send the recovery link.")
            setSuccessMsg("")
            return
        }

        setIsResettingPassword(true)
        setErrorMsg("")
        setSuccessMsg("")

        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: PASSWORD_RESET_REDIRECT_URL
        })

        if (error) {
            setErrorMsg(error.message)
        } else {
            setSuccessMsg("Recovery email sent. Check your inbox and spam folder.")
        }

        setIsResettingPassword(false)
    }

    return (
        <div className="w-[380px] min-h-[500px] p-8 bg-slate-950 text-slate-50 flex flex-col font-sans relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

            <UpdateBanner />

            <div className="mt-8 mb-12 text-center relative z-10">
                <div className="mx-auto w-20 h-20 rounded-3xl border border-white/10 bg-white/5 flex items-center justify-center shadow-lg shadow-emerald-500/10 mb-6 group hover:scale-105 transition-transform overflow-hidden">
                    <img src={socialRadarLogo} alt="SocialRadar logo" className="w-16 h-16 object-contain" />
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

                {successMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400 text-xs font-bold animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {successMsg}
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

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isResettingPassword || isLoading}
                        className="text-xs font-semibold text-primary-400 hover:text-primary-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                    >
                        {isResettingPassword ? "Sending recovery email..." : "Forgot password?"}
                    </button>
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

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="risk-disclosure"
                            className="mt-0.5 h-4 w-4 rounded border-amber-500/30 bg-slate-900 text-amber-400 focus:ring-0 focus:ring-offset-0"
                            checked={riskDisclosureAccepted}
                            onChange={(e) => setRiskDisclosureAccepted(e.target.checked)}
                        />
                        <label htmlFor="risk-disclosure" className="text-xs font-medium leading-relaxed text-slate-300 cursor-pointer select-none">
                            I understand that use of this application may contravene Instagram's Terms and Policies, and that this could result in limitations, temporary blocks, or suspension of my account.
                        </label>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading || !riskDisclosureAccepted}
                    className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg shadow-primary-500/25 transition-all flex items-center justify-center gap-2 mt-4 ${(isLoading || !riskDisclosureAccepted) ? "bg-slate-800 cursor-not-allowed" : "bg-gradient-to-r from-primary-600 to-primary-500 hover:shadow-primary-500/40 hover:-translate-y-0.5"}`}
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

            <div className="mt-6 text-center relative z-10">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Closed Beta</p>
                    <p className="mt-1 text-xs text-slate-400">
                        Registration is currently invite-only. Request access at{" "}
                        <a href={`mailto:${CLOSED_BETA_ACCESS_EMAIL}`} className="font-bold text-primary-400 hover:text-primary-300">
                            {CLOSED_BETA_ACCESS_EMAIL}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}

export function SignUpScreen({ onBack, onLogin }: { onBack: () => void, onLogin: (user: any, isPremium: boolean) => void }) {
    void onLogin
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [msg, setMsg] = useState({ type: "", text: "" })

    return (
        <div className="w-[380px] min-h-[500px] p-8 bg-slate-950 text-slate-50 flex flex-col font-sans relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="mt-12 mb-8 text-center relative z-10">
                <div className="mx-auto w-20 h-20 rounded-3xl border border-amber-500/20 bg-amber-500/10 flex items-center justify-center shadow-lg shadow-amber-500/10 mb-6">
                    <Lock className="w-10 h-10 text-amber-300" />
                </div>
                <h1 className="text-2xl font-black tracking-tight mb-2">Closed Beta Access</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                    New registrations are temporarily closed while we onboard beta users in waves.
                </p>
            </div>

            <div className="relative z-10 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Need access?</p>
                <p className="mt-3 text-sm text-slate-400">
                    Email{" "}
                    <a href={`mailto:${CLOSED_BETA_ACCESS_EMAIL}`} className="font-bold text-primary-400 hover:text-primary-300">
                        {CLOSED_BETA_ACCESS_EMAIL}
                    </a>{" "}
                    and we can review your request for the private beta.
                </p>
            </div>

            <button
                onClick={onBack}
                className="mt-auto text-xs text-slate-500 hover:text-white transition-colors"
            >
                ← Back to Login
            </button>
        </div>
    )

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
        } else if (data.session && data.user) {
            // Email confirmation is disabled, log in immediately

            // 1. Store Session Token
            await chrome.storage.local.set({
                session_token: data.session.access_token,
                user_uid: data.user.id
            })

            // 2. New users are not premium by default
            const isPremium = false

            setMsg({ type: "success", text: "Account created! Logging in..." })

            // Short delay to show success message
            setTimeout(() => {
                onLogin(data.user, isPremium)
            }, 1000)
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
