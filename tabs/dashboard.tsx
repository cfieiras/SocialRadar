import { useState, useEffect, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({
    area: "local"
})
import {
    Users, Heart, MessageSquare, Settings, BarChart3,
    History, Shield, Zap, Search, Bell, ExternalLink,
    ChevronRight, Play, Pause, Database, Clock, Square,
    CheckCircle2, Circle, UserPlus, Trash2, AlertTriangle, Activity, X, Radar, Send, Monitor, Moon
} from "lucide-react"
import "../style.css"
import { refreshUserProfile, runDeepScan, fetchCompetitorProfile, syncStatsToSupabase, fetchHistoryFromSupabase, type Unfollower } from "../lib/instagramApi"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { supabase } from "../lib/supabaseClient"
import { SubscriptionScreen, LoginScreen, SignUpScreen } from "../components/AuthScreens"

const GIST_VERSION_URL = "https://gist.githubusercontent.com/cfieiras/a74789aead58df67812f31099ffe7e02/raw/social-radar-version.json"
const REPO_RELEASES_URL = "https://github.com/cfieiras/SocialRadar/releases/latest"


const Sparkline = ({ data, dataKey, color }: { data: any[], dataKey: string, color: string }) => {
    const validData = [...(data || [])].reverse().filter(d => d[dataKey] !== undefined)
    if (validData.length < 2) return <div className="h-8 mt-2" />
    return (
        <div className="h-8 w-24 mt-0 opacity-70">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={validData}>
                    <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

function Dashboard() {
    const [updateStatus, setUpdateStatus] = useState<{ available: boolean, remoteVersion: string }>({ available: false, remoteVersion: "" })
    const manifest = chrome.runtime.getManifest()
    const currentVersion = manifest.version

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const res = await fetch(`${GIST_VERSION_URL}?t=${Date.now()}`)
                if (!res.ok) return
                const data = await res.json()
                if (data.version !== currentVersion) {
                    setUpdateStatus({ available: true, remoteVersion: data.version })
                }
            } catch (e) { console.error(e) }
        }
        checkUpdate()
    }, [])
    const [activeTab, setActiveTab] = useState("overview")

    const [userStats] = useStorage({ key: "currentUserStats", instance: storage }, null)
    const currentUsername = userStats?.username || "global"
    const competitorsDataKey = `${currentUsername}_competitorsData`

    const [termsAccepted] = useStorage<boolean>({ key: "termsAccepted", instance: storage })
    const [session, setSession] = useStorage({ key: "session", instance: storage }, { isLoggedIn: false, user: null, isPremium: false })
    const [isRegistering, setIsRegistering] = useState(false)
    const [isRunning, setIsRunning] = useStorage({ key: "isRunning", instance: storage }, false)
    const [statsData, setStatsData] = useStorage({ key: `${currentUsername}_stats`, instance: storage }, { follows: 0, likes: 0, dms: 0, unfollows: 0 })
    const [hashtags, setHashtags] = useStorage({ key: `${currentUsername}_targetHashtags`, instance: storage }, ["#digitalart"])
    const [competitors, setCompetitors] = useStorage({ key: `${currentUsername}_targetCompetitors`, instance: storage }, ["@leomessi"])
    const [competitorsData, setCompetitorsData] = useStorage({ key: `${currentUsername}_competitorsData`, instance: storage }, [])
    const [newTag, setNewTag] = useState("")
    const [newCompetitor, setNewCompetitor] = useState("")
    const [logs] = useStorage({ key: `${currentUsername}_logs`, instance: storage }, [])
    const [followedUsers, setFollowedUsers] = useStorage({ key: `${currentUsername}_followedUsers`, instance: storage }, [])
    const [botStartTime] = useStorage({ key: "botStartTime", instance: storage }, 0)
    const [lastReport] = useStorage({ key: `${currentUsername}_lastSessionReport`, instance: storage }, null)
    const [followerHistory] = useStorage({ key: `${currentUsername}_followerHistory`, instance: storage }, [])
    const [elapsedTime, setElapsedTime] = useState("00:00:00")
    const [isScanning, setIsScanning] = useState(false)
    const [scanProgress, setScanProgress] = useState(0)
    const [unfollowers, setUnfollowers] = useState<Unfollower[]>([])

    // Live Session Stats
    const [sessionLikes] = useStorage({ key: `${currentUsername}_sessionLikes`, instance: storage }, 0)
    const [sessionFollows] = useStorage({ key: `${currentUsername}_sessionFollows`, instance: storage }, 0)
    const [sessionUnfollows] = useStorage({ key: `${currentUsername}_sessionUnfollows`, instance: storage }, 0)
    const [showScoreModal, setShowScoreModal] = useState(false)
    const [showEngagementModal, setShowEngagementModal] = useState(false)

    const [chartReady, setChartReady] = useState(false)
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackMessage, setFeedbackMessage] = useState("")
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

    // Release Notes Logic
    const [lastSeenVersion, setLastSeenVersion] = useStorage({ key: "lastSeenVersion", instance: storage }, "")
    const [showReleaseNotes, setShowReleaseNotes] = useState(false)

    useEffect(() => {
        if (lastSeenVersion !== undefined && lastSeenVersion !== "" && lastSeenVersion !== currentVersion) {
            setShowReleaseNotes(true)
        } else if (lastSeenVersion === "") {
            // First time or fresh install - mark as seen but dont show notes (they saw onboarding)
            setLastSeenVersion(currentVersion)
        }
    }, [lastSeenVersion, currentVersion])

    useEffect(() => {
        const timer = setTimeout(() => setChartReady(true), 1000)
        return () => clearTimeout(timer)
    }, [])

    const lastProcessedTs = useRef(0)
    /* 
    // Disabled automatic sync from useEffect to prevent race conditions with refreshUserProfile
    useEffect(() => {
        if (!userStats?.timestamp) return

        // Only sync if the stats are new (or at least different from what we last saw this session)
        // AND checks if the stats are actually from today (avoid syncing stale data on reload)
        if (userStats.timestamp > lastProcessedTs.current) {
            const statDate = new Date(userStats.timestamp).toDateString()
            const today = new Date().toDateString()

            if (statDate === today) {
                // syncStatsToSupabase(userStats) 
            }
            lastProcessedTs.current = userStats.timestamp
        }
    }, [userStats])
    */

    const [supabaseHistory, setSupabaseHistory] = useState<any[]>([])
    const [displayStats, setDisplayStats] = useState<any>(null)
    const [isOutdated, setIsOutdated] = useState(false)
    const [lastSupabaseSync] = useStorage({ key: "lastSupabaseSync", instance: storage }, "")

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0]
        const hasHistoryToday = displayStats?.date === today
        const hasSyncedToday = lastSupabaseSync === today

        // If we have history for today OR we just synced today, it's NOT outdated
        setIsOutdated(!hasHistoryToday && !hasSyncedToday)
    }, [displayStats, lastSupabaseSync])

    useEffect(() => {
        if (userStats?.username) {
            loadUnfollowers(userStats.username)
            loadHistory(userStats.username)
        }
    }, [userStats?.username])

    const loadHistory = async (username?: string) => {
        const targetUsername = username || userStats?.username
        if (!targetUsername) return
        const history = await fetchHistoryFromSupabase(targetUsername)
        if (history && history.length > 0) {
            setSupabaseHistory(history.reverse())
            // history[0] is the latest entry (DESC from API)
            const rawLast = history[0]
            setDisplayStats(rawLast)
        } else {
            setSupabaseHistory([])
            setDisplayStats(null)
        }
    }

    const loadUnfollowers = async (username?: string) => {
        const targetUsername = username || userStats?.username
        if (!targetUsername) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data } = await supabase
            .from('unfollowers_detected')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('instagram_username', targetUsername)
            .order('detected_at', { ascending: false })

        if (data) setUnfollowers(data)
        else setUnfollowers([])
    }

    const handleDeepScan = async () => {
        if (isScanning) return
        setIsScanning(true)
        setScanProgress(0)
        try {
            await runDeepScan((count) => setScanProgress(count))
            if (userStats?.username) {
                await loadUnfollowers(userStats.username)
            }
            alert("Deep Scan completado con éxito.")
        } catch (err) {
            alert("Error en el escaneo: " + (err as Error).message)
        } finally {
            setIsScanning(false)
        }
    }

    useEffect(() => {
        let interval: NodeJS.Timeout
        if (isRunning && botStartTime) {
            interval = setInterval(() => {
                const diff = Math.floor((Date.now() - botStartTime) / 1000)
                const h = Math.floor(diff / 3600).toString().padStart(2, '0')
                const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0')
                const s = (diff % 60).toString().padStart(2, '0')
                setElapsedTime(`${h}:${m}:${s}`)
            }, 1000)
        } else {
            setElapsedTime("00:00:00")
        }
        return () => clearInterval(interval)
    }, [isRunning, botStartTime])

    // Configuración de módulos activos
    const [config, setConfig] = useStorage({ key: `${currentUsername}_botConfig`, instance: storage }, {
        likeEnabled: true,
        followEnabled: false,
        dmEnabled: false,
        unfollowEnabled: false,
        sourceHashtags: true,
        sourceCompetitors: false,
        chaosEnabled: false,
        continuousSession: false,
        overlayEnabled: true,
        sourcePosts: false,
        sleepEnabled: false,
        sleepStart: "23:00",
        sleepDuration: 8
    })

    const toggleProtect = (username: string) => {
        const updated = (followedUsers || []).map((u: any) => {
            if (u.username === username) return { ...u, protected: !u.protected }
            return u
        })
        setFollowedUsers(updated)
    }

    const [delays, setDelays] = useStorage({ key: `${currentUsername}_delays`, instance: storage }, {
        navMin: 10, navMax: 20,
        viewMin: 8, viewMax: 15,
        actionMin: 3, actionMax: 7,
        gridMin: 10, gridMax: 15,
        batchLimit: 15,
        batchPause: 720,
        unfollowDays: 3,
        sessionLikeLimit: 100, sessionFollowLimit: 100,
        chaosFreq: 30, chaosDur: 5
    })

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && newTag.trim()) {
            setHashtags([...hashtags, newTag.startsWith("#") ? newTag : `#${newTag}`])
            setNewTag("")
        }
    }

    const addCompetitor = async (e: React.KeyboardEvent | React.FocusEvent) => {
        if (newCompetitor.trim()) {
            const raw = newCompetitor.trim()
            const fixed = raw.startsWith("@") ? raw : `@${raw}`
            const username = fixed.replace('@', '')

            if (!competitors.includes(fixed)) {
                setCompetitors([...competitors, fixed])
                setNewCompetitor("")

                // Background fetch for the new competitor
                try {
                    const profile = await fetchCompetitorProfile(username)
                    const currentComps = [...(competitorsData || [])]
                    const exists = currentComps.findIndex(c => c.username === username)

                    const finalProfile = profile || {
                        username,
                        fullName: username,
                        avatarUrl: `https://ui-avatars.com/api/?name=${username}&background=0f172a&color=fff`,
                        bio: "Bio not available. Try Deep Audit.",
                        stats: { followers: 0, posts: 0, following: 0 },
                        engagementRate: 0,
                        isVerified: false,
                        latestPosts: []
                    }

                    if (exists > -1) {
                        currentComps[exists] = finalProfile
                    } else {
                        currentComps.push(finalProfile)
                    }
                    await storage.set(competitorsDataKey, currentComps)
                    setCompetitorsData(currentComps)
                } catch (err) {
                    console.error("Dashboard: Quick fetch failed for competitor", err)
                    // Ensure we still show something even on error
                    const currentComps = [...(competitorsData || [])]
                    if (!currentComps.find(c => c.username === username)) {
                        currentComps.push({
                            username,
                            fullName: username,
                            avatarUrl: `https://ui-avatars.com/api/?name=${username}&background=0f172a&color=fff`,
                            bio: "Error fetching profile. Try Deep Audit.",
                            stats: { followers: 0, posts: 0, following: 0 },
                            engagementRate: 0,
                            isVerified: false,
                            latestPosts: []
                        })
                        await storage.set(competitorsDataKey, currentComps)
                        setCompetitorsData(currentComps)
                    }
                }
            } else {
                setNewCompetitor("")
            }
        }
    }


    const submitFeedback = async () => {
        if (!feedbackMessage.trim()) return
        setIsSubmittingFeedback(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const { error } = await supabase
                .from('feedback')
                .insert({
                    message: feedbackMessage,
                    user_id: session?.user?.id,
                    type: 'suggestion'
                })

            if (error) throw error

            alert("¡Gracias por tu sugerencia! La hemos recibido correctamente.")
            setFeedbackMessage("")
            setShowFeedbackModal(false)
        } catch (e) {
            console.error("Error sending feedback:", e)
            alert("Error al enviar la sugerencia. Por favor intenta nuevamente.")
        } finally {
            setIsSubmittingFeedback(false)
        }
    }

    const clearDatabase = () => {
        if (window.confirm("¿Estás seguro de que quieres borrar el historial de follows?")) {
            setFollowedUsers([])
        }
    }

    const calculateGrowth = () => {
        if (!followerHistory || followerHistory.length < 2) return "0"
        const diff = followerHistory[0].followers - followerHistory[1].followers
        return diff >= 0 ? `+${diff}` : `${diff}`
    }

    const getRatioStats = () => {
        const ratio = userStats?.stats?.following ? (userStats.stats.followers / userStats.stats.following) : 0
        if (ratio < 0.5) return { label: "Poor", color: "bg-rose-500/10 text-rose-400", desc: "You follow way more people than follow you. Try cleaning your following list." }
        if (ratio < 1.0) return { label: "Normal", color: "bg-amber-500/10 text-amber-400", desc: "Balanced growth. You are in the process of building your audience authority." }
        if (ratio < 2.0) return { label: "Good", color: "bg-emerald-500/10 text-emerald-400", desc: "Healthy account. People are following you based on your content quality." }
        return { label: "Excellent", color: "bg-blue-500/10 text-blue-400", desc: "High Authority. You are seen as an influencer or a leader in your niche." }
    }

    const ratioInfo = getRatioStats()

    const erValue = (userStats?.engagementRate || 0) > 0 ? userStats.engagementRate : (displayStats?.engagementRate || 0)
    const trustValue = (userStats?.trustScore || 0) > 0 ? userStats.trustScore : (displayStats?.trustScore || 0)

    const authorityStats = [
        {
            label: "Trust Score",
            value: trustValue > 0 ? trustValue : "—",
            trend: trustValue > 0 ? (trustValue > 70 ? "Excellent" : "Improving") : "No Data",
            trendColor: trustValue > 0 ? (trustValue > 70 ? "bg-blue-500/10 text-blue-400" : "bg-slate-800 text-slate-400") : "bg-slate-900 text-slate-600",
            tooltip: "Master score based on your engagement, ratio, and posting frequency. Higher scores mean better algorithm reach.",
            icon: Shield, color: "text-blue-500",
            action: () => setShowScoreModal(true),
            hidden: false,
            dataKey: "trustScore",
            colorHex: "#3b82f6"
        },
        {
            label: "Engagement Rate",
            value: erValue > 0 ? `${erValue}%` : "—",
            trend: erValue > 0 ? (erValue > 3 ? "Excellent" : "Regular") : "No Data",
            trendColor: erValue > 0 ? (erValue > 3 ? "bg-purple-500/10 text-purple-400" : "bg-slate-800 text-slate-400") : "bg-slate-900 text-slate-600",
            tooltip: "Percentage of your followers interacting with your content. 3%+ is the industry benchmark for healthy accounts.",
            icon: Activity, color: "text-purple-400",
            action: () => setShowEngagementModal(true),
            hidden: false,
            dataKey: "engagementRate",
            colorHex: "#c084fc"
        },
        {
            label: "Follow/Following Ratio",
            value: userStats?.stats?.following ? (userStats.stats.followers / userStats.stats.following).toFixed(2) : "0",
            trend: ratioInfo.label,
            trendColor: ratioInfo.color,
            tooltip: ratioInfo.desc,
            icon: Zap, color: "text-amber-400"
        },
    ]

    const performanceStats = [
        {
            label: "Followers Trend",
            value: (userStats?.stats?.followers || 0).toLocaleString(),
            trend: `${calculateGrowth()} today`,
            tooltip: `Growth Velocity: ${userStats?.growthVelocity || 0}% compared to previous period.`,
            icon: Users, color: "text-blue-400"
        },
        {
            label: "Total Likes",
            value: (statsData?.likes || 0).toLocaleString(),
            trend: "Reset",
            icon: Heart,
            color: "text-rose-400",
            action: () => {
                if (window.confirm("¿Reiniciar el contador de likes?")) {
                    setStatsData({ ...statsData, likes: 0 })
                }
            }
        },
        { label: "Total Comments", value: (statsData?.dms || 0).toLocaleString(), trend: "Dev Mode", icon: MessageSquare, color: "text-emerald-400", tooltip: "Automated comments feature (Currently in Development)." },
    ]


    // Gating Logic & Handlers
    const handleLogout = async () => {
        await supabase.auth.signOut()
        await chrome.storage.local.remove(['session_token', 'user_uid'])
        setSession({ isLoggedIn: false, user: null, isPremium: false })
        setIsRunning(false)
    }

    const verifySubscription = async () => {
        if (!session?.user?.id) return
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_premium')
            .eq('id', session.user.id)
            .single()

        if (profile?.is_premium) {
            setSession(prev => ({ ...prev, isPremium: true }))
        }
    }

    if (termsAccepted === undefined) return null // Loading state

    if (!termsAccepted) {
        window.location.href = "onboarding.html"
        return null
    }

    if (!session?.isLoggedIn) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-slate-950">
                {isRegistering ? (
                    <SignUpScreen onBack={() => setIsRegistering(false)} onLogin={(user, isPremium) => setSession({ isLoggedIn: true, user, isPremium })} />
                ) : (
                    <LoginScreen onLogin={(user, isPremium) => setSession({ isLoggedIn: true, user, isPremium })} onGoToSignUp={() => setIsRegistering(true)} />
                )}
            </div>
        )
    }

    if (!session?.isPremium) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-slate-950">
                <SubscriptionScreen user={session.user} onCheckPayment={verifySubscription} onLogout={handleLogout} />
            </div>
        )
    }

    return (
        <div className="flex h-screen bg-slate-950 text-slate-50 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col p-8 backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-12 px-2">
                    <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Radar className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-outfit font-bold tracking-tight text-white">SocialRadar</h1>
                        <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-500 uppercase">Pro Edition</span>
                    </div>
                </div>

                <nav className="space-y-3 flex-grow">
                    {[
                        { id: "overview", label: "Dashboard", icon: BarChart3 },
                        { id: "competitors", label: "Competitor Analysis", icon: Users },
                        { id: "targeting", label: "Strategy & Source", icon: Search },
                        { id: "unfollow", label: "Unfollow Tracker", icon: UserPlus }, // New Tab
                        { id: "settings", label: "Settings", icon: Settings },
                        { id: "database", label: "Audience Database", icon: History },
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${activeTab === item.id
                                ? "bg-primary-600 shadow-xl shadow-primary-600/20 text-white translate-x-3"
                                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                                }`}
                        >
                            <item.icon className={`w-5 h-5 ${activeTab === item.id ? "text-white" : "group-hover:text-primary-400"}`} />
                            <span className="font-bold tracking-tight">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="mt-auto pt-8 border-t border-slate-800/50">
                    <div className={`p-6 rounded-3xl border relative overflow-hidden group transition-all duration-300 ${updateStatus.available ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 cursor-pointer" : "bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800"}`} onClick={() => updateStatus.available && window.open(REPO_RELEASES_URL, "_blank")}>
                        {updateStatus.available && <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />}
                        <div className="relative z-10">
                            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${updateStatus.available ? "text-emerald-400" : "text-primary-500"}`}>
                                {updateStatus.available ? "Update Available" : "Private Beta"}
                            </p>
                            <div className="flex items-center gap-2">
                                <p className={`text-sm font-bold italic ${updateStatus.available ? "text-white" : "text-slate-400"}`}>
                                    v{currentVersion} {updateStatus.available && `→ v${updateStatus.remoteVersion}`}
                                </p>
                                {updateStatus.available && <ExternalLink className="w-3 h-3 text-emerald-400" />}
                            </div>
                            {updateStatus.available && (
                                <p className="text-[10px] text-emerald-300 mt-2 font-bold">Click to upgrade</p>
                            )}
                        </div>
                    </div>
                </div>
            </aside >

            {/* Main Content */}
            <main className="flex-grow flex flex-col overflow-y-auto relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.05),transparent)] pointer-events-none" />

                {/* Top Navbar */}
                <header className="h-24 px-12 flex items-center justify-between sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">
                            {activeTab === 'overview' && 'System Analytics'}
                            {activeTab === 'competitors' && 'Market Intelligence'}
                            {activeTab === 'targeting' && 'Operation Strategy'}
                            {activeTab === 'unfollow' && 'Churn Analysis'}
                            {activeTab === 'settings' && 'Latency Control'}
                            {activeTab === 'database' && 'Audience Database'}
                        </h2>
                        <p className="text-sm text-slate-500 font-medium">Real-time modular bot configuration.</p>
                    </div>
                    <div className="flex items-center gap-6">

                        <button
                            onClick={async () => {
                                const nextState = !isRunning
                                if (nextState) {
                                    // 1. Check for stale stats (< 24h)
                                    const now = Date.now()
                                    const lastCheck = userStats?.timestamp || 0
                                    const hoursDiff = (now - lastCheck) / (1000 * 60 * 60)
                                    const lastKnownUsername = await storage.get<string>("lastKnownUsername")

                                    let targetUrl = "https://www.instagram.com/"

                                    if (hoursDiff > 24 || !userStats?.engagementRate) {
                                        if (lastKnownUsername) {
                                            targetUrl = `https://www.instagram.com/${lastKnownUsername}/?mode=deep&start_audit=true`
                                        } else {
                                            targetUrl = "https://www.instagram.com/?start_audit=true"
                                        }
                                    }

                                    await storage.set("sessionLikes", 0)
                                    await storage.set("sessionFollows", 0)
                                    await storage.set("sessionUnfollows", 0)
                                    window.open(targetUrl, "_blank")
                                }
                                setIsRunning(nextState)
                            }}
                            className={`h-12 px-8 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-300 flex items-center gap-3 ${isRunning
                                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                                : "bg-white text-black hover:bg-primary-500 hover:text-white"
                                }`}
                        >
                            {isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                            {isRunning ? "Stop Automation" : "Launch Bot"}
                        </button>
                    </div>
                </header>

                <div className="p-12 space-y-12 relative z-10">
                    {activeTab === "overview" && (
                        <>
                            {/* Profile Overview Card */}
                            {userStats && (
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 flex items-center justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div className="flex items-center gap-6">
                                        <div className="relative">
                                            <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-rose-500 to-purple-600 flex items-center justify-center overflow-hidden">
                                                <img
                                                    src={userStats.avatarUrl}
                                                    className="w-full h-full rounded-full border-4 border-slate-950 object-cover"
                                                    alt="Avatar"
                                                    referrerPolicy="no-referrer"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${userStats.username}&background=0f172a&color=fff`
                                                    }}
                                                />
                                            </div>
                                            {userStats.isVerified && (
                                                <div className="absolute bottom-1 right-1 bg-blue-500 rounded-full p-1 border-2 border-slate-900">
                                                    <CheckCircle2 className="w-4 h-4 text-white fill-current" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-3xl font-black text-white tracking-tight">{userStats.fullName || userStats.username}</h3>
                                                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700">@{userStats.username}</span>
                                            </div>
                                            <p className="text-slate-400 mt-2 max-w-xl text-sm leading-relaxed font-medium line-clamp-2">{userStats.bio}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-12 bg-slate-950/50 p-8 rounded-3xl border border-slate-800">
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Followers</p>
                                            <p className="text-3xl font-black text-white tracking-tighter">{Number(userStats.stats.followers).toLocaleString()}</p>
                                        </div>
                                        <div className="w-px h-12 bg-slate-800" />
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Following</p>
                                            <p className="text-3xl font-black text-white tracking-tighter">{Number(userStats.stats.following).toLocaleString()}</p>
                                        </div>
                                        <div className="w-px h-12 bg-slate-800" />
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Posts</p>
                                            <p className="text-3xl font-black text-white tracking-tighter">{Number(userStats.stats.posts).toLocaleString()}</p>
                                        </div>

                                    </div>
                                </div>
                            )}

                            {(isRunning || lastReport) && (
                                <div className={`bg-slate-900/60 border ${isRunning ? 'border-emerald-500/30' : 'border-slate-800'} rounded-[2rem] p-6 mb-8 flex items-center justify-between animate-in fade-in slide-in-from-top-4`}>
                                    <div className="flex items-center gap-6">
                                        <div className={`p-4 rounded-2xl ${isRunning ? "bg-emerald-500/10 text-emerald-500" : (lastReport?.stopReason.includes("Manual") ? "bg-slate-800 text-slate-400" : "bg-rose-500/10 text-rose-500")}`}>
                                            {isRunning ? <Play className="w-6 h-6 animate-pulse" /> : (lastReport?.stopReason.includes("Manual") ? <Pause className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />)}
                                        </div>
                                        <div>
                                            <h4 className={`text-xs font-black uppercase tracking-widest ${isRunning ? "text-emerald-500" : "text-slate-500"} mb-1`}>{isRunning ? "CURRENT SESSION" : "LAST SESSION REPORT"}</h4>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-bold text-white">{isRunning ? "Running..." : lastReport?.stopReason}</h3>
                                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono">{isRunning ? elapsedTime : lastReport?.durationStr}</span>
                                            </div>
                                            {!isRunning && lastReport && <p className="text-xs text-slate-400 mt-1">ended at {new Date(lastReport.endTime).toLocaleTimeString()} on {new Date(lastReport.endTime).toLocaleDateString()}</p>}
                                        </div>
                                    </div>
                                    <div className="flex gap-8 pr-4">
                                        <div className="text-center">
                                            <div className="text-2xl font-black text-white">{isRunning ? sessionLikes : lastReport?.actions.likes}</div>
                                            <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Likes</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-black text-white">{isRunning ? sessionFollows : lastReport?.actions.follows}</div>
                                            <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Follows</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-black text-white">{isRunning ? sessionUnfollows : lastReport?.actions.unfollows}</div>
                                            <div className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Unfollows</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* In Development Notice */}
                            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-3xl p-6 flex items-center justify-between mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center gap-6">
                                    <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400">
                                        <Zap className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-indigo-400 uppercase tracking-tight">New Features In Development</h4>
                                        <p className="text-sm text-slate-400 font-medium">Comments Auto-Pilot, Specific Post Targeting, and Advanced Competitor Analysis are coming soon.</p>
                                    </div>
                                </div>
                                <span className="px-4 py-1.5 bg-indigo-500 text-white text-[10px] font-black uppercase rounded-full shadow-lg shadow-indigo-500/20">
                                    BETA
                                </span>
                            </div>

                            {/* Engagement Warning Notice */}
                            {userStats && (userStats.engagementRate === 0 || !userStats.engagementRate) && userStats.analyzedPostsCount > 0 && (
                                <div className="bg-rose-500/10 border border-rose-500/30 rounded-3xl p-6 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div className="flex items-center gap-6">
                                        <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400">
                                            <AlertTriangle className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-rose-400 uppercase tracking-tight">Low Engagement Detected</h4>
                                            <p className="text-sm text-slate-400 font-medium whitespace-nowrap">Your recent posts haven't captured interactions. This might affect your account trust score.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowEngagementModal(true)}
                                        className="px-6 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                                    >
                                        Check Analysis
                                    </button>
                                </div>
                            )}



                            {/* New Stats Row: Engagement & Last Post */}
                            {userStats && userStats.analyzedPostsCount > 0 && (
                                <div className="grid grid-cols-12 gap-8">
                                    <div className="col-span-12 bg-gradient-to-r from-primary-900/10 to-transparent border border-primary-500/20 rounded-[2.5rem] p-10 flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                            <div className="p-5 rounded-3xl bg-primary-500/10 border border-primary-500/20 text-primary-400">
                                                <Clock className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-primary-500 uppercase tracking-widest mb-4">Content Activity</p>
                                                <div className="flex items-center gap-8">
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1">Last Post</p>
                                                        <h4 className="text-3xl font-black text-white tracking-tighter">
                                                            {userStats?.latestPosts?.[0]
                                                                ? `${Math.floor((Date.now() / 1000 - userStats.latestPosts[0].timestamp) / 3600)}h ago`
                                                                : "N/A"}
                                                        </h4>
                                                    </div>
                                                    {userStats?.latestPosts?.length >= 2 && (
                                                        <>
                                                            <div className="w-px h-10 bg-slate-800" />
                                                            <div>
                                                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1">Avg Frequency</p>
                                                                <h4 className="text-3xl font-black text-white tracking-tighter">
                                                                    {((userStats.latestPosts[0].timestamp - userStats.latestPosts[userStats.latestPosts.length - 1].timestamp) / 3600 / 24 / userStats.latestPosts.length).toFixed(1)} <span className="text-sm text-slate-500 font-bold">days</span>
                                                                </h4>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            {[... (userStats?.latestPosts || [])]
                                                .sort((a, b) => b.likes - a.likes)
                                                .slice(0, 3)
                                                .map((post, i) => (
                                                    <div key={i} className="group relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-slate-800 hover:border-primary-500 transition-all cursor-pointer" onClick={() => window.open(`https://instagram.com/p/${post.shortcode}`, "_blank")}>
                                                        <img src={post.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                            <Heart className="w-4 h-4 text-white fill-current" />
                                                        </div>
                                                    </div>
                                                ))}
                                            <div className="flex flex-col justify-center ml-2">
                                                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Top 3 Performing</p>
                                                <p className="text-xs font-bold text-slate-300">Based on likes</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-8">
                                {/* Engagement Rate Unified Card */}
                                <div className={`bg-slate-900/40 border ${isOutdated ? 'border-amber-500/30' : 'border-slate-800/50'} rounded-[2.5rem] p-8 relative overflow-hidden group hover:border-purple-500/30 transition-all duration-500`}>
                                    <div className="flex items-start justify-between relative z-10 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 rounded-2xl bg-slate-950 text-purple-400 group-hover:scale-110 transition-transform duration-500">
                                                <Activity className="w-7 h-7" />
                                            </div>
                                            <div>
                                                <h3 className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-1">Engagement Rate</h3>
                                                <p className="text-4xl font-black text-white tracking-tighter">
                                                    {erValue > 0 ? `${erValue}%` : "—"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {isOutdated ? (
                                                <div className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest bg-amber-500/10 text-amber-400 flex items-center gap-2">
                                                    <AlertTriangle className="w-3 h-3" /> OUTDATED
                                                </div>
                                            ) : (
                                                <div
                                                    className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest ${erValue > 0 ? (erValue > 3 ? "bg-purple-500/10 text-purple-400" : "bg-slate-800 text-slate-400") : "bg-slate-900/50 text-slate-600"}`}
                                                >
                                                    {erValue > 0 ? (erValue > 3 ? "EXCELLENT" : "REGULAR") : "NO DATA"}
                                                </div>
                                            )}

                                            <button
                                                onClick={async () => {
                                                    if (isOutdated) {
                                                        const confirm = window.confirm("This will perform a deep analysis of your current profile. It may take a few seconds. Continue?")
                                                        if (!confirm) return

                                                        // Force fresh analysis
                                                        const freshProfile = await refreshUserProfile()
                                                        if (freshProfile) {
                                                            await syncStatsToSupabase(freshProfile)
                                                            setTimeout(() => {
                                                                alert("Analysis updated & Synced successfully.")
                                                                loadHistory()
                                                                // Also update local state to reflect changes immediately
                                                                // (The useStorage hook might handle this, but forcing a reload ensures it)
                                                                window.location.reload()
                                                            }, 1000)
                                                        } else {
                                                            alert("Failed to analyze profile. Please try again later.")
                                                        }
                                                    } else {
                                                        setShowEngagementModal(true)
                                                    }
                                                }}
                                                className={`text-[10px] font-bold flex items-center gap-1 transition-colors ${isOutdated ? 'text-amber-500 hover:text-amber-400' : 'text-slate-500 hover:text-white'}`}
                                            >
                                                {isOutdated ? "SYNC NOW" : "ANALYSIS"} <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="h-32 w-full opacity-60 group-hover:opacity-100 transition-opacity relative z-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={supabaseHistory.length > 0 ? supabaseHistory : []}>
                                                <defs>
                                                    <linearGradient id="colorEngUnified" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#c084fc" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px', color: '#f8fafc' }}
                                                    itemStyle={{ color: '#c084fc', fontWeight: 'bold' }}
                                                    labelFormatter={(label, payload) => payload[0]?.payload?.date || ''}
                                                />
                                                <Area type="monotone" dataKey="engagementRate" stroke="#c084fc" strokeWidth={3} fillOpacity={1} fill="url(#colorEngUnified)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Trust Score Unified Card */}
                                <div className={`bg-slate-900/40 border ${isOutdated ? 'border-amber-500/30' : 'border-slate-800/50'} rounded-[2.5rem] p-8 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-500`}>
                                    <div className="flex items-start justify-between relative z-10 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 rounded-2xl bg-slate-950 text-blue-500 group-hover:scale-110 transition-transform duration-500">
                                                <Shield className="w-7 h-7" />
                                            </div>
                                            <div>
                                                <h3 className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-1">Account Trust Score</h3>
                                                <p className="text-4xl font-black text-white tracking-tighter">
                                                    {trustValue > 0 ? trustValue : "—"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {isOutdated ? (
                                                <div className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest bg-amber-500/10 text-amber-400 flex items-center gap-2">
                                                    <AlertTriangle className="w-3 h-3" /> OUTDATED
                                                </div>
                                            ) : (
                                                <div
                                                    className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest ${trustValue > 0 ? (trustValue > 70 ? "bg-blue-500/10 text-blue-400" : "bg-slate-800 text-slate-400") : "bg-slate-900/50 text-slate-600"}`}
                                                >
                                                    {trustValue > 0 ? (trustValue > 70 ? "HIGH TRUST" : "BUILDING") : "NO DATA"}
                                                </div>
                                            )}

                                            <button
                                                onClick={async () => {
                                                    if (isOutdated) {
                                                        const confirm = window.confirm("This will refresh your Trust Score analysis. Continue?")
                                                        if (!confirm) return

                                                        const freshProfile = await refreshUserProfile()
                                                        if (freshProfile) {
                                                            await syncStatsToSupabase(freshProfile)
                                                            setTimeout(() => {
                                                                alert("Trust Score updated & Synced.")
                                                                loadHistory()
                                                                window.location.reload()
                                                            }, 1000)
                                                        } else {
                                                            alert("Failed to refresh profile.")
                                                        }
                                                    } else {
                                                        setShowScoreModal(true)
                                                    }
                                                }}
                                                className={`text-[10px] font-bold flex items-center gap-1 transition-colors ${isOutdated ? 'text-amber-500 hover:text-amber-400' : 'text-slate-500 hover:text-white'}`}
                                            >
                                                {isOutdated ? "SYNC NOW" : "DETAILS"} <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="h-32 w-full opacity-60 group-hover:opacity-100 transition-opacity relative z-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={supabaseHistory.length > 0 ? supabaseHistory : []}>
                                                <defs>
                                                    <linearGradient id="colorTrustUnified" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px', color: '#f8fafc' }}
                                                    itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                                                    labelFormatter={(label, payload) => payload[0]?.payload?.date || ''}
                                                />
                                                <Area type="monotone" dataKey="trustScore" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTrustUnified)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Ratio Stats (Single Row) */}
                            <div className="grid grid-cols-1">
                                {authorityStats.filter(s => s.label.includes("Ratio")).map((stat: any, idx) => (
                                    <div
                                        key={idx}
                                        className={`bg-slate-900/40 border border-slate-800/50 p-6 rounded-[2rem] hover:border-amber-500/30 transition-all duration-500 flex items-center justify-between group`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl bg-slate-950 group-hover:scale-110 transition-transform duration-500 ${stat.color}`}>
                                                <stat.icon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-0.5">{stat.label}</h3>
                                                <p className="text-2xl font-black text-white tracking-tighter">{stat.value}</p>
                                            </div>
                                        </div>
                                        <div
                                            title={stat.tooltip}
                                            className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest cursor-help ${stat.trendColor}`}
                                        >
                                            {stat.trend}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-3 gap-8">
                                {performanceStats.map((stat: any, idx) => (
                                    <div key={idx} className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-[2.5rem] hover:border-primary-500/30 transition-all duration-500 group">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className={`p-4 rounded-2xl bg-slate-950 group-hover:scale-110 transition-transform duration-500 ${stat.color}`}>
                                                <stat.icon className="w-7 h-7" />
                                            </div>
                                            {stat.action ? (
                                                <button
                                                    onClick={stat.action}
                                                    className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest bg-slate-800 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-all"
                                                >
                                                    {stat.trend}
                                                </button>
                                            ) : (
                                                <div
                                                    title={stat.tooltip}
                                                    className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest cursor-help ${stat.trendColor ? stat.trendColor : (stat.trend.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400')}`}
                                                >
                                                    {stat.trend}
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-2">{stat.label}</h3>
                                        <p className="text-4xl font-black text-white tracking-tighter">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Growth Chart Section */}
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                <div className="flex items-center justify-between mb-10">
                                    <div>
                                        <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                                            <Activity className="w-5 h-5 text-primary-500" />
                                            Follower Growth Analysis
                                        </h3>
                                        <p className="text-sm text-slate-500 font-medium">Historical performance audit for @{userStats?.username}</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="px-5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-400">
                                            Last 30 Days
                                        </div>
                                    </div>
                                </div>
                                <div className="h-[300px] w-full mt-4 relative">
                                    {followerHistory && followerHistory.length > 0 && chartReady ? (
                                        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                                            <AreaChart
                                                data={supabaseHistory.length > 0 ? supabaseHistory : [...followerHistory].reverse().map(item => ({
                                                    date: item.date || new Date(item.timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
                                                    followers: item.followers
                                                }))}
                                                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                            >
                                                <defs>
                                                    <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.15} />
                                                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                                <XAxis
                                                    dataKey="date"
                                                    stroke="#64748b"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    stroke="#64748b"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    width={40}
                                                    domain={['dataMin', 'dataMax']}
                                                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                                                />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px', color: '#f8fafc' }}
                                                    itemStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="followers"
                                                    stroke="#38bdf8"
                                                    strokeWidth={3}
                                                    fillOpacity={1}
                                                    fill="url(#colorFollowers)"
                                                    animationDuration={1500}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                                            <div className="p-4 rounded-full bg-slate-800/50">
                                                <BarChart3 className="w-8 h-8 opacity-20" />
                                            </div>
                                            <p className="text-sm font-medium italic">Collecting historical data points... Check back in 24h.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                    <h3 className="text-xl font-black tracking-tight mb-8">Activity Log</h3>
                                    <div className="space-y-4 font-mono text-[11px] overflow-y-auto max-h-[400px] pr-4 custom-scrollbar">
                                        {(logs || []).length > 0 ? (logs || []).map((log: any, i: number) => (
                                            <div key={i} className="flex gap-4 items-start group">
                                                <span className="text-slate-700 font-bold shrink-0 mt-1">{log?.time}</span>
                                                <div className={`flex-grow p-3 rounded-xl border border-transparent transition-all duration-300 ${log?.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' :
                                                    log?.type === 'warning' ? 'bg-rose-500/5 border-rose-500/10 text-rose-400' :
                                                        log?.type === 'wait' ? 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400' : 'bg-slate-800/30 text-slate-400'
                                                    }`}>
                                                    {log?.msg}
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-slate-700 text-center font-bold italic py-20 uppercase tracking-widest">No active stream</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "competitors" && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Header Section */}
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 flex items-center justify-between">
                                <div>
                                    <h3 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                                        <Users className="w-8 h-8 text-primary-500" />
                                        Competitor Watchlist
                                    </h3>
                                    <p className="text-slate-400 font-medium mt-1">Add and analyze your niche competitors to steal their growth strategies.</p>
                                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                        </span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Advanced features in development</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-3xl border border-slate-800 focus-within:border-primary-500 transition-all">
                                    <Search className="w-5 h-5 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Add @username..."
                                        className="bg-transparent outline-none text-white font-bold text-sm min-w-[250px]"
                                        value={newCompetitor}
                                        onChange={(e) => setNewCompetitor(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addCompetitor(e)}
                                        onBlur={(e) => addCompetitor(e)}
                                    />
                                </div>
                            </div>

                            {/* Competitors Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {competitors && competitors.length > 0 ? (
                                    competitors.map((usernameTag: string) => {
                                        const username = usernameTag.replace('@', '')
                                        const comp = (competitorsData || []).find((c: any) => c.username === username)

                                        if (!comp) {
                                            // Loading / Placeholder state
                                            return (
                                                <div key={usernameTag} className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 flex items-center justify-between animate-pulse">
                                                    <div className="flex items-center gap-6">
                                                        <div className="w-20 h-20 rounded-full bg-slate-800" />
                                                        <div>
                                                            <div className="h-6 w-32 bg-slate-800 rounded-lg mb-2" />
                                                            <div className="h-4 w-24 bg-slate-700 rounded-lg" />
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-600 font-bold text-xs uppercase tracking-widest">Fetching Profile...</div>
                                                </div>
                                            )
                                        }

                                        const posts = comp.latestPosts || []
                                        let postingFreq = "N/A"
                                        if (posts.length >= 2) {
                                            const first = posts[0].timestamp
                                            const last = posts[posts.length - 1].timestamp
                                            const diffHours = (first - last) / 3600
                                            const diffDays = diffHours / 24
                                            postingFreq = `${(diffDays / posts.length).toFixed(1)}d`
                                        }

                                        return (
                                            <div key={comp.username} className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] overflow-hidden group hover:border-primary-500/30 transition-all duration-500">
                                                <div className="p-8">
                                                    <div className="flex items-start justify-between mb-8">
                                                        <div className="flex items-center gap-6">
                                                            <div className="relative">
                                                                <div className="w-20 h-20 rounded-full p-[2px] bg-gradient-to-tr from-primary-500 to-purple-600">
                                                                    <img
                                                                        src={comp.avatarUrl}
                                                                        className="w-full h-full rounded-full border-4 border-slate-900 object-cover"
                                                                        alt={comp.username}
                                                                        referrerPolicy="no-referrer"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${comp.username}&background=0f172a&color=fff`
                                                                        }}
                                                                    />
                                                                </div>
                                                                {comp.isVerified && (
                                                                    <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1 border-2 border-slate-900">
                                                                        <CheckCircle2 className="w-3 h-3 text-white fill-current" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xl font-black text-white">{comp.fullName || comp.username}</h4>
                                                                <a
                                                                    href={`https://www.instagram.com/${comp.username}/`}
                                                                    target="_blank"
                                                                    className="text-primary-500 font-bold text-sm tracking-tight italic hover:text-primary-400 flex items-center gap-1 group/link"
                                                                >
                                                                    @{comp.username}
                                                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                                                </a>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setCompetitors(competitors.filter(c => c !== `@${comp.username}`))
                                                                setCompetitorsData((competitorsData || []).filter((c: any) => c.username !== comp.username))
                                                            }}
                                                            className="p-2 rounded-xl bg-slate-950 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </div>

                                                    <p className="text-slate-400 text-sm font-medium line-clamp-2 mb-8 h-10 leading-relaxed">
                                                        {comp.bio || "No biography provided."}
                                                    </p>

                                                    <div className="grid grid-cols-3 gap-4 mb-8">
                                                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center">
                                                            <p className="text-[10px] font-black uppercase text-slate-600 mb-1">Followers</p>
                                                            <p className="text-lg font-black text-white">{(Number(comp.stats?.followers) || 0).toLocaleString()}</p>
                                                        </div>
                                                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center">
                                                            <p className="text-[10px] font-black uppercase text-slate-600 mb-1">Posts</p>
                                                            <p className="text-lg font-black text-white">{(Number(comp.stats?.posts) || 0).toLocaleString()}</p>
                                                        </div>
                                                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-center">
                                                            <p className="text-[10px] font-black uppercase text-slate-600 mb-1">Engagement</p>
                                                            <p className="text-lg font-black text-primary-400">{comp.engagementRate || 0}%</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex -space-x-3">
                                                                {(comp.latestPosts || []).slice(0, 3).map((p: any, i: number) => (
                                                                    <div key={i} className="w-10 h-10 rounded-xl border-2 border-slate-900 overflow-hidden bg-slate-800">
                                                                        <img src={p.url} className="w-full h-full object-cover" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">
                                                                Freq: <span className="text-white ml-1">{postingFreq}</span>
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                const url = `https://www.instagram.com/${comp.username}/?audit=true&target=competitor&mode=deep`
                                                                chrome.tabs.create({ url, active: true })
                                                            }}
                                                            className="px-6 py-3 rounded-2xl bg-primary-600 text-white text-xs font-black shadow-lg shadow-primary-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                                        >
                                                            <Zap className="w-4 h-4 fill-current" />
                                                            DEEP AUDIT
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <div className="col-span-2 py-32 bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center text-center">
                                        <div className="p-6 rounded-full bg-slate-900 mb-6 text-slate-700">
                                            <Users className="w-16 h-16" />
                                        </div>
                                        <h4 className="text-xl font-black text-white mb-2">No Competitors Tracked</h4>
                                        <p className="text-slate-500 max-w-sm font-medium">Add your first competitor using the input field above to start spying on their performance.</p>
                                    </div>
                                )}

                                {/* Placeholder for empty slots */}
                                {competitors.map(username => {
                                    const cleaned = username.replace('@', '').trim()
                                    if (competitorsData?.find((c: any) => c.username === cleaned)) return null
                                    return (
                                        <div key={username} className="bg-slate-900/20 border border-dashed border-slate-800 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center group hover:border-primary-500/30 transition-all">
                                            <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mb-6 text-slate-700 font-black text-2xl group-hover:text-primary-500 transition-all">
                                                {cleaned[0]?.toUpperCase() || '?'}
                                            </div>
                                            <h4 className="text-white font-black mb-1">@{cleaned}</h4>
                                            <button
                                                onClick={() => {
                                                    const url = `https://www.instagram.com/${cleaned}/?audit=true&target=competitor&mode=deep`
                                                    chrome.tabs.create({ url, active: true })
                                                }}
                                                className="px-8 py-3 rounded-2xl bg-primary-600 text-white text-xs font-black shadow-lg shadow-primary-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <Zap className="w-4 h-4" />
                                                DEEP AUDIT
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === "unfollow" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                            <Shield className="w-6 h-6 text-rose-500" />
                                            Deep Scan Bot
                                        </h3>
                                        <p className="text-sm text-slate-500 font-medium">Analyze your audience to find who stopped following you.</p>
                                    </div>
                                    <button
                                        onClick={handleDeepScan}
                                        disabled={isScanning}
                                        className={`h-14 px-10 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-300 flex items-center gap-3 ${isScanning ? 'bg-slate-800 text-slate-500' : 'bg-primary-600 text-white hover:bg-primary-500 shadow-lg shadow-primary-600/20'}`}
                                    >
                                        {isScanning ? <Clock className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                                        {isScanning ? `Scanning... (${scanProgress})` : "Start Deep Scan"}
                                    </button>
                                </div>
                                {isScanning && (
                                    <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden mb-4 border border-slate-800">
                                        <div className="bg-primary-500 h-full animate-pulse transition-all duration-500" style={{ width: `${Math.min((scanProgress / (Number(userStats?.stats?.followers) || 1)) * 100, 100)}%` }} />
                                    </div>
                                )}
                                <div className="p-6 rounded-2xl bg-slate-950/50 border border-slate-800/50 flex items-start gap-4">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-1" />
                                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                        <strong className="text-amber-400">Important:</strong> The first scan will establish your current follower base. Subsequent scans will compare against this base to detect losses. Keep scans infrequent (max once per hour) to maintain account safety.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] overflow-hidden">
                                <div className="p-10 border-b border-slate-800/50 flex items-center justify-between">
                                    <h3 className="text-xl font-black tracking-tight">Detected Unfollowers</h3>
                                    <span className="px-4 py-1.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-black tracking-widest uppercase">
                                        {unfollowers.length} Losses Found
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-800/50 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {unfollowers.length > 0 ? unfollowers.map((unf: any, i) => (
                                        <div key={i} className="p-6 flex items-center justify-between hover:bg-slate-800/20 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full border-2 border-slate-800 p-0.5 group-hover:border-rose-500/50 transition-colors">
                                                    <img src={unf.avatar_url || `https://ui-avatars.com/api/?name=${unf.username}&background=random`} className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0" alt="" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-200 group-hover:text-white transition-colors">@{unf.username}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Detected: {new Date(unf.detected_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <a
                                                href={`https://instagram.com/${unf.username}`}
                                                target="_blank"
                                                className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </div>
                                    )) : (
                                        <div className="py-24 text-center">
                                            <div className="w-20 h-20 bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800 text-slate-700">
                                                <Users className="w-10 h-10 opacity-20" />
                                            </div>
                                            <p className="text-slate-500 font-medium italic">No unfollowers detected yet. Try running a Deep Scan.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "targeting" && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                    <h3 className="text-lg font-black tracking-tight mb-8 uppercase text-slate-400 tracking-[0.2em]">Active Action Modules</h3>
                                    <div className="space-y-4">
                                        {[
                                            { id: "likeEnabled", label: "Automated Likes", icon: Heart, color: "text-rose-400" },
                                            { id: "followEnabled", label: "Smart Follow", icon: UserPlus, color: "text-blue-400" },
                                            { id: "unfollowEnabled", label: "Auto-Unfollow (Clean)", icon: Trash2, color: "text-amber-400" },
                                            { id: "dmEnabled", label: "Comments Auto-Pilot (Dev)", icon: MessageSquare, color: "text-emerald-400" }
                                        ].map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => setConfig({ ...config, [item.id]: !config[item.id] })}
                                                className={`w-full flex items-center justify-between p-6 rounded-2xl transition-all border ${config[item.id]
                                                    ? "bg-slate-900 border-primary-500/50 shadow-lg shadow-primary-500/5"
                                                    : "bg-slate-950/50 border-slate-800 opacity-50 grayscale"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <item.icon className={`w-5 h-5 ${item.color}`} />
                                                    <span className="font-bold text-white">{item.label}</span>
                                                </div>
                                                {config[item.id] ? <CheckCircle2 className="w-6 h-6 text-primary-500" /> : <Circle className="w-6 h-6 text-slate-800" />}
                                                {item.label.includes("(Dev)") && <span className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[8px] font-bold rounded uppercase">In Dev</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                    <h3 className="text-lg font-black tracking-tight mb-8 uppercase text-slate-400 tracking-[0.2em]">Data Sources</h3>
                                    <div className="space-y-4">
                                        {[
                                            { id: "sourceHashtags", label: "Monitor Hashtags", icon: Search, color: "text-indigo-400" },
                                            { id: "sourceCompetitors", label: "Target Competitors", icon: Zap, color: "text-primary-400" },
                                            { id: "sourcePosts", label: "Specific Posts Analysis (Dev)", icon: Heart, color: "text-rose-400" }
                                        ].map(sourceItem => (
                                            <button
                                                key={sourceItem.id}
                                                onClick={() => setConfig({ ...config, [sourceItem.id]: !config[sourceItem.id] })}
                                                className={`w-full flex items-center justify-between p-6 rounded-2xl transition-all border ${config[sourceItem.id]
                                                    ? "bg-slate-900 border-primary-500/50 shadow-lg shadow-primary-500/5"
                                                    : "bg-slate-950/50 border-slate-800 opacity-50 grayscale"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <sourceItem.icon className={`w-5 h-5 ${sourceItem.color}`} />
                                                    <span className="font-bold text-white">{sourceItem.label}</span>
                                                </div>
                                                {config[sourceItem.id] ? <CheckCircle2 className="w-6 h-6 text-primary-500" /> : <Circle className="w-6 h-6 text-slate-800" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-8 max-w-5xl">
                                {config.sourceHashtags && (
                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-12 animate-in fade-in slide-in-from-left-8 duration-500">
                                        <h3 className="text-xl font-black text-white tracking-tight mb-6 flex items-center gap-3">
                                            <div className="w-2 h-6 bg-indigo-500 rounded-full" />
                                            Active Mission Keywords
                                        </h3>
                                        <div className="flex flex-wrap gap-3 p-8 bg-slate-950/50 border border-slate-800 rounded-[2rem]">
                                            {(hashtags || []).map(tag => (
                                                <span key={tag} className="px-5 py-2.5 bg-slate-900 text-white text-xs rounded-xl font-bold border border-slate-800 flex items-center gap-3">
                                                    <span className="text-primary-500 font-black">#</span> {tag.replace('#', '')}
                                                    <button onClick={() => setHashtags((hashtags || []).filter(t => t !== tag))} className="text-slate-600 hover:text-rose-500 font-black text-lg">×</button>
                                                </span>
                                            ))}
                                            <input
                                                className="bg-transparent text-sm font-bold outline-none text-white min-w-[200px] ml-4"
                                                placeholder="Add tag..."
                                                value={newTag}
                                                onChange={(e) => setNewTag(e.target.value)}
                                                onKeyDown={addTag}
                                            />
                                        </div>
                                    </div>
                                )}

                                {config.sourceCompetitors && (
                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-12 animate-in fade-in slide-in-from-right-8 duration-500">
                                        <h3 className="text-xl font-black text-white tracking-tight mb-6 flex items-center gap-3">
                                            <div className="w-2 h-6 bg-primary-500 rounded-full" />
                                            Authority Benchmark Profiles
                                        </h3>
                                        <div className="flex flex-wrap gap-3 p-8 bg-slate-950/50 border border-slate-800 rounded-[2rem]">
                                            {(competitors || []).map(c => (
                                                <span key={c} className="px-5 py-2.5 bg-primary-500/10 text-primary-300 text-xs rounded-xl font-bold border border-primary-500/20 flex items-center gap-3">
                                                    <span className="text-primary-500 font-black">@</span> {c.replace('@', '')}
                                                    <button onClick={() => setCompetitors((competitors || []).filter(i => i !== c))} className="text-primary-800 hover:text-rose-500 font-black text-lg">×</button>
                                                </span>
                                            ))}
                                            <input
                                                className="bg-transparent text-sm font-bold outline-none text-white min-w-[200px] ml-4"
                                                placeholder="Add @username..."
                                                value={newCompetitor}
                                                onChange={(e) => setNewCompetitor(e.target.value)}
                                                onKeyDown={addCompetitor}
                                            />
                                        </div>
                                    </div>
                                )}

                                {config.sourcePosts && (
                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-12 animate-in fade-in slide-in-from-right-8 duration-500 col-span-2">
                                        <h3 className="text-xl font-black text-white tracking-tight mb-6 flex items-center gap-3">
                                            <div className="w-2 h-6 bg-rose-500 rounded-full" />
                                            Target Specific Posts (Development Preview)
                                        </h3>
                                        <div className="p-8 bg-slate-950/50 border border-slate-800 rounded-[2rem] flex flex-col items-center justify-center text-center py-16">
                                            <div className="p-4 rounded-full bg-slate-900 mb-4 text-slate-700">
                                                <Heart className="w-8 h-8" />
                                            </div>
                                            <h4 className="text-lg font-black text-white mb-2">Feature Under Construction</h4>
                                            <p className="text-slate-500 max-w-md">Soon you will be able to paste a specific post URL here, and the bot will engage with users who liked or commented on that exact post.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "settings" && (
                        <div className="space-y-12 pb-24 max-w-6xl">


                            {/* Overlay & Maintenance Section */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-indigo-500/30 transition-all group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400">
                                                <Monitor className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-white tracking-tight">Show Overlay</h2>
                                                <p className="text-sm text-slate-500 font-medium">Displays the bot status window on Instagram.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setConfig({ ...config, overlayEnabled: !config?.overlayEnabled })}
                                            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold transition-all ${config?.overlayEnabled
                                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                                                : "bg-slate-800 text-slate-400"
                                                }`}
                                        >
                                            {config?.overlayEnabled ? "ENABLED" : "DISABLED"}
                                            <div className={`w-3 h-3 rounded-full ${config?.overlayEnabled ? "bg-white" : "bg-slate-600"}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-purple-500/30 transition-all group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 bg-purple-500/20 rounded-2xl text-purple-400">
                                                <Activity className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-white tracking-tight">Chaotic Behavior</h2>
                                                <p className="text-sm text-slate-500 font-medium">Simulates human browsing.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setConfig({ ...config, chaosEnabled: !config?.chaosEnabled })}
                                            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold transition-all ${config?.chaosEnabled
                                                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                                                : "bg-slate-800 text-slate-400"
                                                }`}
                                        >
                                            {config?.chaosEnabled ? "ENABLED" : "DISABLED"}
                                            <div className={`w-3 h-3 rounded-full ${config?.chaosEnabled ? "bg-white" : "bg-slate-600"}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Continuous Session & Sleep Section */}
                            <div className="grid grid-cols-1 gap-8">
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 hover:border-emerald-500/30 transition-all group">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-400">
                                                <Clock className="w-8 h-8" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-white tracking-tight">Sesión Continua</h2>
                                                <p className="text-sm text-slate-500 font-medium">El bot no se detiene al completar tareas. Reinicia automáticamente cada día.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setConfig({ ...config, continuousSession: !config?.continuousSession })}
                                            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold transition-all ${config?.continuousSession
                                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                                                : "bg-slate-800 text-slate-400"
                                                }`}
                                        >
                                            {config?.continuousSession ? "ACTIVADO" : "DESACTIVADO"}
                                            <div className={`w-3 h-3 rounded-full ${config?.continuousSession ? "bg-white" : "bg-slate-600"}`} />
                                        </button>
                                    </div>

                                    {config.continuousSession && (
                                        <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500 border-t border-slate-800/50 pt-8 mt-8">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                                                        <Moon className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-black text-white">Modo Dormir (Simulación Humana)</h3>
                                                        <p className="text-xs text-slate-500">Define una ventana de tiempo donde el bot descansará.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setConfig({ ...config, sleepEnabled: !config.sleepEnabled })}
                                                    className={`px-6 py-2 rounded-xl font-bold text-xs transition-all ${config?.sleepEnabled ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-500"}`}
                                                >
                                                    {config?.sleepEnabled ? "ACTIVO" : "INACTIVO"}
                                                </button>
                                            </div>

                                            {config.sleepEnabled && (
                                                <div className="grid grid-cols-2 gap-8 bg-slate-950/50 p-6 rounded-[2rem] border border-slate-800">
                                                    <div>
                                                        <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Hora de Inicio (24h)</label>
                                                        <input
                                                            type="time"
                                                            value={config.sleepStart}
                                                            onChange={(e) => setConfig({ ...config, sleepStart: e.target.value })}
                                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Duración (Horas)</label>
                                                        <input
                                                            type="number"
                                                            value={config.sleepDuration}
                                                            onChange={(e) => setConfig({ ...config, sleepDuration: parseInt(e.target.value) || 0 })}
                                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {config.chaosEnabled && (
                                <div className="grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div>
                                        <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Frequency (Every X min)</label>
                                        <input
                                            type="number"
                                            value={delays?.chaosFreq || 30}
                                            onChange={(e) => setDelays({ ...delays, chaosFreq: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Duration (For X min)</label>
                                        <input
                                            type="number"
                                            value={delays?.chaosDur || 5}
                                            onChange={(e) => setDelays({ ...delays, chaosDur: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-4 mb-4 pt-8 border-t border-slate-800/50">
                                <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400">
                                    <Settings className="w-8 h-8" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white tracking-tight">Latency Settings</h2>
                                    <p className="text-sm text-slate-500 font-medium">Finetune internal execution timers.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {[
                                    { id: "nav", label: "Rotation Cycle", desc: "Delay between changing mission targets", recom: "10s - 20s" },
                                    { id: "view", label: "Analysis Phase", desc: "Simulated content consumption duration", recom: "8s - 15s" },
                                    { id: "action", label: "Execution Buffer", desc: "Post-engagement cool down period", recom: "3s - 7s" },
                                    { id: "grid", label: "Discovery Rate", desc: "Wait time between targeting posts", recom: "10s - 15s" },
                                    { id: "unfollow", label: "Unfollow Pacing", desc: "Pause between each unfollow action", recom: "10s - 20s" }
                                ].map((item) => (
                                    <div key={item.id} className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-indigo-500/30 transition-all group">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors uppercase tracking-[0.2em] mb-2">{item.label}</h3>
                                                <p className="text-xs text-slate-500 font-medium">{item.desc}</p>
                                            </div>
                                            <div className="px-4 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black tracking-widest border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                                                REC: {item.recom}
                                            </div>
                                        </div>
                                        <div className="flex gap-6 items-center">
                                            <div className="flex-grow">
                                                <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Min Floor (s)</label>
                                                <input
                                                    type="number"
                                                    value={delays?.[`${item.id}Min`] || 0}
                                                    onChange={(e) => setDelays({ ...delays, [`${item.id}Min`]: parseInt(e.target.value) || 0 })}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-indigo-500 outline-none transition-all shadow-inner"
                                                />
                                            </div>
                                            <div className="flex-grow">
                                                <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Max Ceiling (s)</label>
                                                <input
                                                    type="number"
                                                    value={delays?.[`${item.id}Max`] || 0}
                                                    onChange={(e) => setDelays({ ...delays, [`${item.id}Max`]: parseInt(e.target.value) || 0 })}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-indigo-500 outline-none transition-all shadow-inner"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-12 border-t border-slate-800/50">
                                <div className="flex items-center gap-4 mb-10">
                                    <div className="p-4 bg-rose-500/20 rounded-2xl text-rose-400">
                                        <Shield className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white tracking-tight">Security Batching</h2>
                                        <p className="text-sm text-slate-500 font-medium">Auto-pilot safety mechanism to prevent account flagging.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-rose-500/30 transition-all group">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-[0.2em] mb-2">Max Session Actions</h3>
                                                <p className="text-xs text-slate-500 font-medium">Number of interactions before a long rest</p>
                                            </div>
                                            <div className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-black tracking-widest border border-rose-500/20 shadow-lg shadow-rose-500/10 uppercase">
                                                Safe: 15-25
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            value={delays?.batchLimit || 0}
                                            onChange={(e) => setDelays({ ...delays, batchLimit: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-rose-500 outline-none transition-all shadow-inner"
                                        />
                                    </div>

                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-rose-500/30 transition-all group">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-[0.2em] mb-2">Rest Duration (s)</h3>
                                                <p className="text-xs text-slate-500 font-medium">Wait time after reaching batch limit</p>
                                            </div>
                                            <div className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-black tracking-widest border border-rose-500/20 shadow-lg shadow-rose-500/10 uppercase">
                                                REC: 720s (12m)
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            value={delays?.batchPause || 0}
                                            onChange={(e) => setDelays({ ...delays, batchPause: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-rose-500 outline-none transition-all shadow-inner"
                                        />
                                    </div>


                                    {/* SESSION LIMITS */}
                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-rose-500/30 transition-all group">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-[0.2em] mb-2">Max Session Likes</h3>
                                                <p className="text-xs text-slate-500 font-medium">Auto-stop likes after this limit</p>
                                            </div>
                                            <div className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-black tracking-widest border border-rose-500/20 shadow-lg shadow-rose-500/10 uppercase">
                                                REC: 100
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            value={delays?.sessionLikeLimit || 100}
                                            onChange={(e) => setDelays({ ...delays, sessionLikeLimit: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-rose-500 outline-none transition-all shadow-inner"
                                        />
                                    </div>

                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-rose-500/30 transition-all group">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-[0.2em] mb-2">Max Session Follows</h3>
                                                <p className="text-xs text-slate-500 font-medium">Auto-stop follows after this limit</p>
                                            </div>
                                            <div className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-black tracking-widest border border-rose-500/20 shadow-lg shadow-rose-500/10 uppercase">
                                                REC: 100
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            value={delays?.sessionFollowLimit || 100}
                                            onChange={(e) => setDelays({ ...delays, sessionFollowLimit: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-rose-500 outline-none transition-all shadow-inner"
                                        />
                                    </div>

                                    {/* Visual Feedback Toggle */}
                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-emerald-500/30 transition-all group col-span-2">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors uppercase tracking-[0.2em] mb-2">Live Status Overlay</h3>
                                                <p className="text-xs text-slate-500 font-medium">Show real-time logs and stats on the Instagram tab while running.</p>
                                            </div>
                                            <button
                                                onClick={() => setConfig({ ...config, overlayEnabled: !(config.overlayEnabled !== false) })}
                                                className={`w-14 h-8 rounded-full p-1 transition-colors ${config.overlayEnabled !== false ? "bg-emerald-500" : "bg-slate-800"}`}
                                            >
                                                <div className={`w-6 h-6 rounded-full bg-white shadow-lg transition-transform ${config.overlayEnabled !== false ? "translate-x-6" : ""}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-amber-500/30 transition-all group">
                                    <div className="flex justify-between items-start mb-8">
                                        <div>
                                            <h3 className="text-sm font-black text-white group-hover:text-amber-400 transition-colors uppercase tracking-[0.2em] mb-2">Unfollow Threshold (Days)</h3>
                                            <p className="text-xs text-slate-500 font-medium">Minimum age required to trigger unfollow task</p>
                                        </div>
                                        <div className="px-4 py-1.5 bg-amber-500/10 text-amber-400 rounded-full text-[10px] font-black tracking-widest border border-amber-500/20 shadow-lg shadow-amber-500/10 uppercase">
                                            REC: 3 - 7 Days
                                        </div>
                                    </div>
                                    <input
                                        type="number"
                                        value={delays.unfollowDays}
                                        onChange={(e) => setDelays({ ...delays, unfollowDays: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-amber-500 outline-none transition-all shadow-inner"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "database" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            <div className="flex items-center justify-between mb-10">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-primary-500/20 rounded-2xl text-primary-400">
                                        <Database className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white tracking-tight">Audience Database</h2>
                                        <div className="flex gap-4 mt-1">
                                            <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                                                <Users className="w-3 h-3" /> Total Targets: {(followedUsers || []).length}
                                            </span>
                                            <span className="text-xs font-bold text-amber-500 flex items-center gap-2">
                                                <Trash2 className="w-3 h-3" /> Eligible for cleanup: {(followedUsers || []).filter((u: any) => !u.protected && (Date.now() - (u.timestamp || 0)) > (delays.unfollowDays * 86400 * 1000)).length}
                                            </span>
                                            <span className="text-xs font-bold text-indigo-500 flex items-center gap-2">
                                                <History className="w-3 h-3" /> Total Unfollows: {statsData?.unfollows || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={clearDatabase}
                                    className="flex items-center gap-2 px-6 py-3 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl hover:bg-rose-500 hover:text-white transition-all font-bold text-sm"
                                >
                                    <Trash2 className="w-4 h-4" /> Clear Database
                                </button>
                            </div>

                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-950/50 border-b border-slate-800/50">
                                            <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Target User</th>
                                            <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Interaction Date</th>
                                            <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                                            <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {(followedUsers && followedUsers.length > 0) ? (followedUsers || []).map((user: any, i: number) => {
                                            const ageMs = Date.now() - (user.timestamp || 0)
                                            const thresholdMs = (delays.unfollowDays || 3) * 86400 * 1000
                                            const isReady = ageMs > thresholdMs && !user.protected

                                            return (
                                                <tr key={i} className={`hover:bg-slate-800/20 transition-colors group ${isReady ? 'bg-amber-500/5' : ''}`}>
                                                    <td className="px-10 py-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black transition-all text-sm ${isReady ? 'bg-amber-500/20 text-amber-500' : 'bg-primary-600/20 text-primary-500 group-hover:bg-primary-600 group-hover:text-white'}`}>
                                                                {user?.username?.[0]?.toUpperCase() || "?"}
                                                            </div>
                                                            <span className={`font-bold tracking-tight ${isReady ? 'text-amber-200' : 'text-white'}`}>@{user?.username || "unknown"}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-10 py-6">
                                                        <span className="text-slate-400 font-medium text-sm">{user?.dateStr || "—"}</span>
                                                    </td>
                                                    <td className="px-10 py-6">
                                                        <div className="flex items-center gap-3">
                                                            {user.unfollowFailed ? (
                                                                <span className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-black tracking-widest border border-rose-500/20">
                                                                    UNFOLLOW FAILED
                                                                </span>
                                                            ) : isReady ? (
                                                                <span className="px-4 py-1.5 bg-amber-500/10 text-amber-400 rounded-full text-[10px] font-black tracking-widest border border-amber-500/20">
                                                                    READY TO UNFOLLOW
                                                                </span>
                                                            ) : (
                                                                <span className="px-4 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black tracking-widest border border-indigo-500/20">
                                                                    FOLLOWED
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={() => toggleProtect(user.username)}
                                                                className={`p-2 rounded-xl transition-all border ${user.protected ? 'bg-primary-500 border-primary-400 text-white shadow-lg shadow-primary-500/20' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-primary-400'}`}
                                                                title={user.protected ? "Protected from Unfollow" : "Don't unfollow this user"}
                                                            >
                                                                <Shield className={`w-4 h-4 ${user.protected ? 'fill-current' : ''}`} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (window.confirm(`Remove @${user.username} from database?`)) {
                                                                        const updated = followedUsers.filter((u: any) => u.username !== user.username)
                                                                        setFollowedUsers(updated)
                                                                    }
                                                                }}
                                                                className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-500 hover:bg-rose-500/10 hover:border-rose-500/50 hover:text-rose-500 transition-all"
                                                                title="Remove from database"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-10 py-6 text-right">
                                                        <a
                                                            href={user.url}
                                                            target="_blank"
                                                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs ${isReady ? 'bg-amber-600/20 text-amber-200 hover:bg-amber-600 hover:text-white' : 'bg-slate-800 text-slate-300 hover:bg-primary-600 hover:text-white'}`}
                                                        >
                                                            Profile <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    </td>
                                                </tr>
                                            )
                                        }) : (
                                            <tr>
                                                <td colSpan={4} className="px-10 py-32 text-center">
                                                    <div className="flex flex-col items-center gap-4 opacity-30">
                                                        <Users className="w-12 h-12" />
                                                        <p className="font-black text-sm uppercase tracking-widest text-slate-500">No audience data captured yet</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => setShowFeedbackModal(true)}
                    className="fixed bottom-8 right-8 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white px-6 py-3 rounded-full shadow-2xl hover:bg-primary-600 hover:border-primary-500 transition-all duration-300 hover:-translate-y-1 font-black text-xs tracking-widest uppercase flex items-center gap-3 group"
                >
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse group-hover:bg-white" />
                    Sugerencias
                    <MessageSquare className="w-3 h-3 text-slate-400 group-hover:text-white" />
                </button>

                {/* Score Explanation Modal */}
                {
                    showScoreModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-md bg-black/60 animate-in fade-in duration-300 transition-all">
                            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                                <div className="p-10 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-primary-900/20 to-transparent">
                                    <div className="flex items-center gap-6">
                                        <div className="p-5 rounded-3xl bg-primary-600 shadow-xl shadow-primary-600/20 text-white">
                                            <Shield className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black tracking-tight">Trust Score Breakdown</h2>
                                            <p className="text-slate-400 font-medium">How the algorithm calculates your authority.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowScoreModal(false)}
                                        className="p-4 rounded-2xl bg-slate-800 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-all active:scale-90"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="p-10 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                    <div className="flex gap-8 items-start p-6 rounded-3xl bg-slate-950 border border-slate-800 shadow-inner group hover:border-purple-500/30 transition-all duration-500">
                                        <div className="p-4 rounded-2xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                                            <Activity className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                                                Engagement Factor
                                                <span className="text-xs text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full">40% Weight</span>
                                            </h4>
                                            <p className="text-sm text-slate-400 leading-relaxed font-medium">
                                                We analyze your latest 12 posts. A <span className="text-white font-bold">5% interaction rate</span> earns you max points. High engagement tells Instagram that your content is valuable and worth promoting.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-8 items-start p-6 rounded-3xl bg-slate-950 border border-slate-800 shadow-inner group hover:border-amber-500/30 transition-all duration-500">
                                        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                                            <Zap className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                                                Profile Authority
                                                <span className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">30% Weight</span>
                                            </h4>
                                            <p className="text-sm text-slate-400 leading-relaxed font-medium">
                                                The ratio between Followers and Following. Accounts that have a <span className="text-white font-bold">ratio of 2.0+</span> are considered authorities by our AI, signaling social proof.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-8 items-start p-6 rounded-3xl bg-slate-950 border border-slate-800 shadow-inner group hover:border-emerald-500/30 transition-all duration-500">
                                        <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                                            <Heart className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                                                Posting Consistency
                                                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">30% Weight</span>
                                            </h4>
                                            <p className="text-sm text-slate-400 leading-relaxed font-medium">
                                                Instagram rewards active users. Posting <span className="text-white font-bold">at least 3 times a week</span> maintains your momentum and prevents the algorithm from restricting your account reach.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-10 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Your Rating</p>
                                        <p className={`text-2xl font-black ${(userStats?.trustScore || 0) > 70 ? 'text-primary-400' : 'text-slate-300'}`}>
                                            {(userStats?.trustScore || 0)} Points
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowScoreModal(false)}
                                        className="px-10 h-14 rounded-2xl bg-primary-600 text-white font-black text-sm tracking-widest uppercase hover:bg-primary-500 shadow-xl shadow-primary-600/20 transition-all"
                                    >
                                        Understood
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                {
                    showEngagementModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-md bg-black/60 animate-in fade-in duration-300 transition-all">
                            <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                                <div className="p-10 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-900/20 to-transparent">
                                    <div className="flex items-center gap-6">
                                        <div className="p-5 rounded-3xl bg-purple-600 shadow-xl shadow-purple-600/20 text-white">
                                            <Activity className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black tracking-tight">Engagement Analysis</h2>
                                            <p className="text-slate-400 font-medium">Detailed breakdown of how your audience interacts.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowEngagementModal(false)}
                                        className="p-4 rounded-2xl bg-slate-800 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-all active:scale-90"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="p-10 grid grid-cols-12 gap-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                    {/* Summary Column */}
                                    <div className="col-span-4 space-y-6">
                                        <div className="p-8 rounded-[2rem] bg-slate-950 border border-slate-800">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Formula</p>
                                            <div className="p-4 rounded-2xl bg-slate-900 font-mono text-xs text-purple-400 leading-relaxed border border-slate-800/50">
                                                ((Interactions / Posts) / Followers) * 100
                                            </div>
                                            <p className="text-xs text-slate-500 mt-4 leading-relaxed italic">
                                                We calculate the average interactions across your latest posts relative to your follower count.
                                            </p>
                                        </div>

                                        <div className="p-8 rounded-[2rem] bg-gradient-to-br from-purple-600/10 to-transparent border border-purple-500/20">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-6">Execution Data</p>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-400 font-bold">Analyzed Posts</span>
                                                    <span className="text-white font-black">{userStats?.analyzedPostsCount || 0}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-400 font-bold">Total Social Inter.</span>
                                                    <span className="text-white font-black">{userStats?.totalLikesCaptured || 0}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-4">
                                                    <span className="text-slate-400 font-bold">Avg. per Post</span>
                                                    <span className="text-white font-black">
                                                        {userStats?.analyzedPostsCount
                                                            ? (userStats.totalLikesCaptured / userStats.analyzedPostsCount).toFixed(0)
                                                            : 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Posts Grid Column */}
                                    <div className="col-span-8">
                                        <h4 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center justify-between">
                                            Latest Post Breakdown
                                            <span className="text-[10px] text-slate-500">Source: Last Account Sync</span>
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {(userStats?.latestPosts || []).map((post, i) => (
                                                <div key={i} className="flex gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/30 transition-all group cursor-pointer" onClick={() => window.open(`https://instagram.com/p/${post.shortcode}`, '_blank')}>
                                                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0">
                                                        <img src={post.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    </div>
                                                    <div className="flex-grow flex flex-col justify-center">
                                                        <div className="flex items-center gap-4 text-xs">
                                                            <div className="flex items-center gap-1.5 text-rose-400 font-black">
                                                                <Heart className="w-3.5 h-3.5 fill-current" />
                                                                {post.likes}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-primary-400 font-black">
                                                                <MessageSquare className="w-3.5 h-3.5 fill-current" />
                                                                {post.comments}
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-bold mt-2">
                                                            {post.timestamp ? new Date(post.timestamp * 1000).toLocaleDateString() : 'Recent'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            {(userStats?.latestPosts?.length === 0) && (
                                                <div className="col-span-2 py-12 text-center">
                                                    <p className="text-slate-500 font-bold text-sm">No post data available. Please sync performance.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-10 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-8">
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Current Engagement</p>
                                            <p className="text-3xl font-black text-purple-400">{userStats?.engagementRate || 0}%</p>
                                        </div>
                                        <div className="w-px h-10 bg-slate-800" />
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Status</p>
                                            <p className={`text-sm font-black ${(userStats?.engagementRate || 0) > 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {(userStats?.engagementRate || 0) > 3 ? 'EXCELLENT AUTHORITY' : 'OPTIMIZATION NEEDED'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowEngagementModal(false)}
                                        className="px-10 h-14 rounded-2xl bg-purple-600 text-white font-black text-sm tracking-widest uppercase hover:bg-purple-500 shadow-xl shadow-purple-600/20 transition-all"
                                    >
                                        CLOSE ANALYSIS
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}


                {/* Feedback Modal */}
                {
                    showFeedbackModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
                            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                                <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-900/20 to-transparent">
                                    <div>
                                        <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                                            <MessageSquare className="w-5 h-5 text-emerald-400" />
                                            Buzón de Sugerencias
                                        </h2>
                                        <p className="text-sm text-slate-400 font-medium mt-1">Ayúdanos a mejorar SocialRadar</p>
                                    </div>
                                    <button
                                        onClick={() => setShowFeedbackModal(false)}
                                        className="p-3 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="p-8 space-y-6">
                                    <textarea
                                        className="w-full h-32 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-sm font-medium focus:border-emerald-500 outline-none resize-none transition-all placeholder:text-slate-600"
                                        placeholder="Cuéntanos tu idea, reporta un error, o dinos qué te gustaría ver en la próxima versión..."
                                        value={feedbackMessage}
                                        onChange={(e) => setFeedbackMessage(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setShowFeedbackModal(false)}
                                            className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition-colors text-xs uppercase tracking-wider"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={submitFeedback}
                                            disabled={!feedbackMessage.trim() || isSubmittingFeedback}
                                            className={`px-8 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-all flex items-center gap-2 ${(!feedbackMessage.trim() || isSubmittingFeedback) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                                        >
                                            {isSubmittingFeedback ? (
                                                <>Enviando...</>
                                            ) : (
                                                <>
                                                    Enviar <Send className="w-3 h-3" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                {/* What's New Modal */}
                {showReleaseNotes && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 backdrop-blur-xl bg-black/40 animate-in fade-in duration-500">
                        <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3.5rem] overflow-hidden shadow-[0_0_100px_rgba(59,130,246,0.15)] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                            <div className="relative h-48 bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center overflow-hidden">
                                <div className="absolute inset-0 opacity-20">
                                    <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
                                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-primary-400 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
                                </div>
                                <div className="relative z-10 text-center">
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white font-black text-[10px] uppercase tracking-widest mb-4 border border-white/20">
                                        Update v{currentVersion}
                                    </div>
                                    <h2 className="text-4xl font-black text-white tracking-tighter">What's New in SocialRadar</h2>
                                </div>
                                <button
                                    onClick={() => { setShowReleaseNotes(false); setLastSeenVersion(currentVersion); }}
                                    className="absolute top-8 right-8 p-3 rounded-2xl bg-black/20 text-white hover:bg-black/40 transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-12 space-y-10">
                                <div className="grid gap-8">
                                    <div className="flex gap-6 group">
                                        <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center text-primary-400 group-hover:scale-110 group-hover:bg-primary-500 group-hover:text-white transition-all duration-300 shadow-lg shadow-transparent group-hover:shadow-primary-500/20 flex-shrink-0">
                                            <Users className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white mb-2 uppercase tracking-wide">Multi-Account Support</h3>
                                            <p className="text-sm text-slate-400 font-medium leading-relaxed">
                                                Independent configurations, stats, and logs for every Instagram profile you manage. The engine now detects context switches automatically.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-6 group">
                                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 shadow-lg shadow-transparent group-hover:shadow-emerald-500/20 flex-shrink-0">
                                            <Monitor className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white mb-2 uppercase tracking-wide">Enhanced Mission HUD</h3>
                                            <p className="text-sm text-slate-400 font-medium leading-relaxed">
                                                The on-page overlay now displays the active @username and your current targeting mission in real-time.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-6 group">
                                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300 shadow-lg shadow-transparent group-hover:shadow-amber-500/20 flex-shrink-0">
                                            <Zap className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white mb-2 uppercase tracking-wide">Dynamic Engine Polish</h3>
                                            <p className="text-sm text-slate-400 font-medium leading-relaxed">
                                                Faster account detection and a re-engineered storage system for smoother transitions between automation tasks.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-slate-800 flex items-center justify-between">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        Build: Stable Release
                                    </div>
                                    <button
                                        onClick={() => { setShowReleaseNotes(false); setLastSeenVersion(currentVersion); }}
                                        className="px-12 py-5 rounded-2xl bg-slate-800 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-primary-600 hover:shadow-2xl hover:shadow-primary-600/20 transition-all active:scale-95 border border-slate-700 hover:border-primary-500"
                                    >
                                        Let's Go
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main >
        </div >
    )
}

export default Dashboard
