import { useState, useEffect } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import { LayoutDashboard, Play, Settings, Zap, Users, Heart, MessageSquare, ShieldCheck, Square, Lock, ArrowRight, LogIn, AlertCircle, Radar } from "lucide-react"
import { supabase } from "../lib/supabaseClient"

const storage = new Storage({
    area: "local"
})

const REPO_OWNER = "cfieiras"
const REPO_NAME = "SocialRadar"

export function UpdateBanner() {
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
                <div className="mx-auto w-20 h-20 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 group hover:scale-105 transition-transform">
                    <Radar className="text-white w-10 h-10" />
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
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [rememberMe, setRememberMe] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")

    // Pre-fill email on load
    useEffect(() => {
        if (rememberedEmail) {
            setEmail(rememberedEmail)
            setRememberMe(true)
        }
    }, [rememberedEmail])

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
                <div className="mx-auto w-20 h-20 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 group hover:scale-105 transition-transform">
                    <Radar className="text-white w-10 h-10" />
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

export function SignUpScreen({ onBack, onLogin }: { onBack: () => void, onLogin: (user: any, isPremium: boolean) => void }) {
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
