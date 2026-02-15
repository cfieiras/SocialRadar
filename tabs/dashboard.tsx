import { useState, useEffect } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({
    area: "local"
})
import {
    Users, Heart, MessageSquare, Settings, BarChart3,
    History, Shield, Zap, Search, Bell, ExternalLink,
    ChevronRight, Play, Pause, Database, Clock, Square,
    CheckCircle2, Circle, UserPlus, Trash2, AlertTriangle, Activity, X
} from "lucide-react"
import "../style.css"
import { refreshUserProfile, runDeepScan, fetchCompetitorProfile, type Unfollower } from "../lib/instagramApi"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { supabase } from "../lib/supabaseClient"

const GIST_VERSION_URL = "https://gist.githubusercontent.com/cfieiras/a74789aead58df67812f31099ffe7e02/raw/social-radar-version.json"
const REPO_RELEASES_URL = "https://github.com/cfieiras/SocialRadar/releases/latest"

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
    const [isRunning, setIsRunning] = useStorage({ key: "isRunning", instance: storage }, false)
    const [statsData, setStatsData] = useStorage({ key: "stats", instance: storage }, { follows: 0, likes: 0, dms: 0, unfollows: 0 })
    const [hashtags, setHashtags] = useStorage({ key: "targetHashtags", instance: storage }, ["#digitalart", "#photography"])
    const [competitors, setCompetitors] = useStorage({ key: "targetCompetitors", instance: storage }, ["@cristiano"])
    const [competitorsData, setCompetitorsData] = useStorage({ key: "competitorsData", instance: storage }, [])
    const [newTag, setNewTag] = useState("")
    const [newCompetitor, setNewCompetitor] = useState("")
    const [logs] = useStorage({ key: "logs", instance: storage }, [])
    const [followedUsers, setFollowedUsers] = useStorage({ key: "followedUsers", instance: storage }, [])
    const [botStartTime] = useStorage({ key: "botStartTime", instance: storage }, 0)
    const [userStats] = useStorage({ key: "currentUserStats", instance: storage }, null)
    const [followerHistory] = useStorage({ key: "followerHistory", instance: storage }, [])
    const [elapsedTime, setElapsedTime] = useState("00:00:00")
    const [isScanning, setIsScanning] = useState(false)
    const [scanProgress, setScanProgress] = useState(0)
    const [unfollowers, setUnfollowers] = useState<Unfollower[]>([])
    const [showScoreModal, setShowScoreModal] = useState(false)
    const [showEngagementModal, setShowEngagementModal] = useState(false)
    const [chartReady, setChartReady] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setChartReady(true), 1000)
        return () => clearTimeout(timer)
    }, [])

    useEffect(() => {
        refreshUserProfile()
        loadUnfollowers()
    }, [])

    const loadUnfollowers = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data } = await supabase
            .from('unfollowers_detected')
            .select('*')
            .eq('user_id', session.user.id)
            .order('detected_at', { ascending: false })

        if (data) setUnfollowers(data)
    }

    const handleDeepScan = async () => {
        if (isScanning) return
        setIsScanning(true)
        setScanProgress(0)
        try {
            await runDeepScan((count) => setScanProgress(count))
            await loadUnfollowers()
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
    const [config, setConfig] = useStorage({ key: "botConfig", instance: storage }, {
        likeEnabled: true,
        followEnabled: false,
        dmEnabled: false,
        unfollowEnabled: false,
        sourceHashtags: true,
        sourceCompetitors: false,
        chaosEnabled: false,
        continuousSession: false
    })

    const toggleProtect = (username: string) => {
        const updated = (followedUsers || []).map((u: any) => {
            if (u.username === username) return { ...u, protected: !u.protected }
            return u
        })
        setFollowedUsers(updated)
    }

    const [delays, setDelays] = useStorage({ key: "delays", instance: storage }, {
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
                    const currentComps = await storage.get<any[]>("competitorsData") || []
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
                    await storage.set("competitorsData", currentComps)
                    setCompetitorsData(currentComps)
                } catch (err) {
                    console.error("Dashboard: Quick fetch failed for competitor", err)
                    // Ensure we still show something even on error
                    const currentComps = await storage.get<any[]>("competitorsData") || []
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
                        await storage.set("competitorsData", currentComps)
                        setCompetitorsData(currentComps)
                    }
                }
            } else {
                setNewCompetitor("")
            }
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

    const authorityStats = [
        {
            label: "Account Trust Score",
            value: `${userStats?.trustScore || 0}`,
            trend: (userStats?.trustScore || 0) > 70 ? "High Trust" : "Building",
            trendColor: (userStats?.trustScore || 0) > 70 ? "bg-blue-500/10 text-blue-400" : "bg-slate-800 text-slate-400",
            tooltip: "Master score based on your engagement, ratio, and posting frequency. Higher scores mean better algorithm reach.",
            icon: Shield, color: "text-blue-500",
            action: () => setShowScoreModal(true),
            hidden: !userStats?.analyzedPostsCount || userStats.analyzedPostsCount === 0
        },
        {
            label: "Engagement Rate",
            value: `${userStats?.engagementRate || 0}%`,
            trend: (userStats?.engagementRate || 0) > 3 ? "Excellent" : "Regular",
            trendColor: (userStats?.engagementRate || 0) > 3 ? "bg-purple-500/10 text-purple-400" : "bg-slate-800 text-slate-400",
            tooltip: "Percentage of your followers interacting with your content. 3%+ is the industry benchmark for healthy accounts.",
            icon: Activity, color: "text-purple-400",
            action: () => setShowEngagementModal(true),
            hidden: !userStats?.analyzedPostsCount || userStats.analyzedPostsCount === 0
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
        { label: "Total DMs", value: (statsData?.dms || 0).toLocaleString(), trend: "Stable", icon: MessageSquare, color: "text-emerald-400", tooltip: "Direct messages sent by the bot during active cycles." },
    ]

    return (
        <div className="flex h-screen bg-slate-950 text-slate-50 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col p-8 backdrop-blur-xl">
                <div className="flex items-center gap-4 mb-12 px-2">
                    <div className="p-3 bg-primary-600 rounded-2xl shadow-2xl shadow-primary-500/40 animate-pulse">
                        <Zap className="w-8 h-8 text-white" fill="white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">SOCIALRADAR</h1>
                        <span className="text-[10px] font-bold tracking-[0.2em] text-primary-500 uppercase">Pro Edition</span>
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
                                {updateStatus.available ? "Update Available" : "Build Profile"}
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
            </aside>

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
                        <p className="text-sm text-slate-500 font-medium">Real-time modular engine configuration.</p>
                    </div>
                    <div className="flex items-center gap-6">
                        {isRunning && (
                            <div className="px-5 py-3 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center gap-3">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                                <span className="font-mono font-bold text-emerald-400 tabular-nums tracking-widest">{elapsedTime}</span>
                            </div>
                        )}
                        <button
                            onClick={() => {
                                const nextState = !isRunning
                                setIsRunning(nextState)
                                if (nextState) {
                                    window.open("https://www.instagram.com/", "_blank")
                                }
                            }}
                            className={`h-12 px-8 rounded-2xl font-black text-sm tracking-widest uppercase transition-all duration-300 flex items-center gap-3 ${isRunning
                                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                                : "bg-white text-black hover:bg-primary-500 hover:text-white"
                                }`}
                        >
                            {isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                            {isRunning ? "Stop Automation" : "Launch Engine"}
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
                                        {userStats?.analyzedPostsCount > 0 && (
                                            <>
                                                <div className="w-px h-12 bg-slate-800" />
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary-500 mb-2">Engagement</p>
                                                    <p className="text-3xl font-black text-primary-400 tracking-tighter">{userStats.engagementRate || 0}%</p>
                                                </div>
                                            </>
                                        )}
                                        <div className="w-px h-12 bg-slate-800" />
                                        <button
                                            onClick={() => {
                                                const url = `https://www.instagram.com/${userStats.username}/?audit=true`
                                                chrome.tabs.create({ url, active: true })
                                            }}
                                            className="px-6 py-3 rounded-2xl bg-primary-600/10 border border-primary-500/20 text-primary-400 text-xs font-black hover:bg-primary-600 hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <Activity className="w-4 h-4" />
                                            SYNC PERFORMANCE
                                        </button>
                                    </div>
                                </div>
                            )}

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

                            {/* No Data Sync Notice */}
                            {userStats && (!userStats.analyzedPostsCount || userStats.analyzedPostsCount === 0) && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 flex items-center justify-between animate-in fade-in duration-500">
                                    <div className="flex items-center gap-6">
                                        <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400">
                                            <Activity className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-amber-400 uppercase tracking-tight">Performance Sync Required</h4>
                                            <p className="text-sm text-slate-400 font-medium">Click "SYNC PERFORMANCE" to calculate your engagement and trust scores.</p>
                                        </div>
                                    </div>
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
                                                <p className="text-sm font-black text-primary-500 uppercase tracking-widest mb-1">Content Activity</p>
                                                <h4 className="text-2xl font-black text-white tracking-tight">
                                                    {userStats?.latestPosts?.[0]
                                                        ? `Last post: ${Math.floor((Date.now() / 1000 - userStats.latestPosts[0].timestamp) / 3600)}h ago`
                                                        : "No recent activity"}
                                                    {userStats?.latestPosts?.length >= 2 && (
                                                        <span className="ml-4 text-xs font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                                                            Avg. Freq: {((userStats.latestPosts[0].timestamp - userStats.latestPosts[userStats.latestPosts.length - 1].timestamp) / 3600 / 24 / userStats.latestPosts.length).toFixed(1)}d
                                                        </span>
                                                    )}
                                                </h4>
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

                            <div className="grid grid-cols-3 gap-8">
                                {authorityStats.filter(s => !s.hidden).map((stat: any, idx) => (
                                    <div
                                        key={idx}
                                        onClick={stat.action}
                                        className={`bg-slate-900/40 border border-slate-800/50 p-8 rounded-[2.5rem] hover:border-primary-500/30 transition-all duration-500 group ${stat.action ? 'cursor-pointer active:scale-95' : ''}`}
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <div className={`p-4 rounded-2xl bg-slate-950 group-hover:scale-110 transition-transform duration-500 ${stat.color}`}>
                                                <stat.icon className="w-7 h-7" />
                                            </div>
                                            <div
                                                title={stat.tooltip}
                                                className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest cursor-help ${stat.trendColor ? stat.trendColor : (stat.trend.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400')}`}
                                            >
                                                {stat.trend}
                                            </div>
                                        </div>
                                        <h3 className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-2">{stat.label}</h3>
                                        <p className="text-4xl font-black text-white tracking-tighter">{stat.value}</p>
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
                                                data={[...followerHistory].reverse().map(item => ({
                                                    date: new Date(item.timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
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
                                    <h3 className="text-xl font-black tracking-tight mb-8">System Execution Stream</h3>
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
                                            Deep Scan Engine
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
                                            { id: "dmEnabled", label: "Messenger Auto-Pilot", icon: MessageSquare, color: "text-emerald-400" }
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
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                    <h3 className="text-lg font-black tracking-tight mb-8 uppercase text-slate-400 tracking-[0.2em]">Data Sources</h3>
                                    <div className="space-y-4">
                                        {[
                                            { id: "sourceHashtags", label: "Monitor Hashtags", icon: Search, color: "text-indigo-400" },
                                            { id: "sourceCompetitors", label: "Target Competitors", icon: Zap, color: "text-primary-400" }
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
                            </div>
                        </div>
                    )}

                    {activeTab === "settings" && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-6xl">

                            {/* New Chaotic Behavior Section */}
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-purple-500/30 transition-all group">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="p-4 bg-purple-500/20 rounded-2xl text-purple-400">
                                            <Activity className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-white tracking-tight">Chaotic Behavior</h2>
                                            <p className="text-sm text-slate-500 font-medium">Simulates random human browsing to confuse algorithms.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setConfig({ ...config, chaosEnabled: !config.chaosEnabled })}
                                        className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold transition-all ${config.chaosEnabled
                                            ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                                            : "bg-slate-800 text-slate-400"
                                            }`}
                                    >
                                        {config.chaosEnabled ? "ENABLED" : "DISABLED"}
                                        <div className={`w-3 h-3 rounded-full ${config.chaosEnabled ? "bg-white" : "bg-slate-600"}`} />
                                    </button>
                                </div>

                                {config.chaosEnabled && (
                                    <div className="grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <div>
                                            <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Frequency (Every X min)</label>
                                            <input
                                                type="number"
                                                value={delays.chaosFreq || 30}
                                                onChange={(e) => setDelays({ ...delays, chaosFreq: parseInt(e.target.value) || 0 })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-purple-500 outline-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Duration (For X min)</label>
                                            <input
                                                type="number"
                                                value={delays.chaosDur || 5}
                                                onChange={(e) => setDelays({ ...delays, chaosDur: parseInt(e.target.value) || 0 })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-purple-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Continuous Session Section */}
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-emerald-500/30 transition-all group">
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
                                        onClick={() => setConfig({ ...config, continuousSession: !config.continuousSession })}
                                        className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold transition-all ${config.continuousSession
                                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                                            : "bg-slate-800 text-slate-400"
                                            }`}
                                    >
                                        {config.continuousSession ? "ACTIVADO" : "DESACTIVADO"}
                                        <div className={`w-3 h-3 rounded-full ${config.continuousSession ? "bg-white" : "bg-slate-600"}`} />
                                    </button>
                                </div>

                                {config.continuousSession && (
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                        <p className="text-sm text-emerald-400 font-medium">
                                            ✅ Modo continuo activo. El bot trabajará durante todo el día y reiniciará sesiones automáticamente al día siguiente.
                                        </p>
                                    </div>
                                )}
                            </div>

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
                                                    value={delays[`${item.id}Min`]}
                                                    onChange={(e) => setDelays({ ...delays, [`${item.id}Min`]: parseInt(e.target.value) || 0 })}
                                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-indigo-500 outline-none transition-all shadow-inner"
                                                />
                                            </div>
                                            <div className="flex-grow">
                                                <label className="text-[10px] text-slate-600 font-black uppercase tracking-widest block mb-3 pl-1">Max Ceiling (s)</label>
                                                <input
                                                    type="number"
                                                    value={delays[`${item.id}Max`]}
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
                                            value={delays.batchLimit}
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
                                            value={delays.batchPause}
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
                                            value={delays.sessionLikeLimit || 100}
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
                                            value={delays.sessionFollowLimit || 100}
                                            onChange={(e) => setDelays({ ...delays, sessionFollowLimit: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-black text-lg focus:border-rose-500 outline-none transition-all shadow-inner"
                                        />
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
                                                            {isReady ? (
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

                <a
                    href="https://docs.google.com/document/d/1U_kTVZbGKAv9jW4D3sy9rt-cnqK1_Lx5HHAZPcSXBBY/edit?tab=t.0"
                    target="_blank"
                    className="fixed bottom-8 right-8 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white px-6 py-3 rounded-full shadow-2xl hover:bg-primary-600 hover:border-primary-500 transition-all duration-300 hover:-translate-y-1 font-black text-xs tracking-widest uppercase flex items-center gap-3 group"
                >
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse group-hover:bg-white" />
                    Sugerencias
                    <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-white" />
                </a>

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
                    )
                }

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
                    )
                }
            </main>
        </div>
    )
}

export default Dashboard
