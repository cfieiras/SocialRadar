import { useState, useEffect, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({
    area: "local"
})
import {
    Users, Heart, MessageSquare, Settings, BarChart3, BarChart2, TrendingUp, Target, Grid,
    History, Shield, Zap, Search, Bell, ExternalLink,
    ChevronRight, ChevronDown, Calendar, Play, Pause, Database, Clock, Square,
    CheckCircle2, Circle, UserPlus, UserMinus, Trash2, AlertTriangle, Activity, X, Radar, Send, Monitor, Moon, RefreshCw, Download
} from "lucide-react"
import "../style.css"
import socialRadarLogo from "url:~assets/social_radar_logo.png"
import helpDemoVideo from "url:~assets/help/SocialRadar_demo_landscape_es.mp4"
import { detectActiveUsername, refreshUserProfile, runDeepScan, fetchCompetitorProfile, syncStatsToSupabase, fetchHistoryFromSupabase, reportCriticalError, resolveStoredAvatarUrl, sanitizeImageUrl, syncAccountSettingsToSupabase, fetchAccountSettingsFromSupabase, extractTopViralPosts, calculateCompetitorFormatBreakdown, type ViralPostItem, type Unfollower } from "../lib/instagramApi"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { supabase } from "../lib/supabaseClient"
import { SubscriptionScreen, LoginScreen, SignUpScreen } from "../components/AuthScreens"

const REMOTE_PACKAGE_URL = "https://raw.githubusercontent.com/cfieiras/SocialRadar/main/package.json"
const GIST_VERSION_URL = "https://gist.githubusercontent.com/cfieiras/a74789aead58df67812f31099ffe7e02/raw/social-radar-version.json"
const REPO_RELEASES_URL = "https://github.com/cfieiras/SocialRadar/releases/latest"
const ENABLE_FIRST_TIME_DASHBOARD_GUIDE = false


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

function BetaBadge({ label = "Beta", className = "" }: { label?: string, className?: string }) {
    return (
        <span className={`inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-300 ${className}`}>
            {label}
        </span>
    )
}

function getSessionReportPresentation(isRunning: boolean, stopReason?: string) {
    const normalizedReason = (stopReason || "").toLowerCase()

    if (isRunning) {
        return {
            badgeLabel: "CURRENT SESSION",
            title: "Running...",
            accentClass: "text-emerald-500",
            iconWrapClass: "bg-emerald-500/10 text-emerald-500",
            borderClass: "border-emerald-500/30",
            Icon: Play
        }
    }

    if (normalizedReason.includes("session lost") || normalizedReason.includes("logout") || normalizedReason.includes("session expired")) {
        return {
            badgeLabel: "LAST SESSION REPORT",
            title: "Paused: Session Expired",
            accentClass: "text-amber-400",
            iconWrapClass: "bg-amber-500/10 text-amber-400",
            borderClass: "border-amber-500/20",
            Icon: AlertTriangle
        }
    }

    if (normalizedReason.includes("account changed") || normalizedReason.includes("account switch")) {
        return {
            badgeLabel: "LAST SESSION REPORT",
            title: "Stopped: Account Switched",
            accentClass: "text-sky-400",
            iconWrapClass: "bg-sky-500/10 text-sky-400",
            borderClass: "border-sky-500/20",
            Icon: RefreshCw
        }
    }

    if (normalizedReason.includes("manual")) {
        return {
            badgeLabel: "LAST SESSION REPORT",
            title: "Stopped Manually",
            accentClass: "text-slate-500",
            iconWrapClass: "bg-slate-800 text-slate-400",
            borderClass: "border-slate-800",
            Icon: Pause
        }
    }

    return {
        badgeLabel: "LAST SESSION REPORT",
        title: stopReason || "Session Ended",
        accentClass: "text-rose-500",
        iconWrapClass: "bg-rose-500/10 text-rose-500",
        borderClass: "border-slate-800",
        Icon: AlertTriangle
    }
}

function GuideStep({
    step,
    title,
    description,
    accent
}: {
    step: string
    title: string
    description: string
    accent: string
}) {
    return (
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-black uppercase tracking-widest ${accent}`}>
                    {step}
                </div>
                <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h4>
            </div>
            <p className="text-sm leading-relaxed text-slate-400">{description}</p>
        </div>
    )
}

function Dashboard() {
    const [updateStatus, setUpdateStatus] = useState<{ available: boolean, remoteVersion: string }>({ available: false, remoteVersion: "" })
    const manifest = chrome.runtime.getManifest()
    const currentVersion = manifest.version

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

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                let remoteVer = ""
                const res = await fetch(`${REMOTE_PACKAGE_URL}?t=${Date.now()}`)
                if (res.ok) {
                    const data = await res.json()
                    remoteVer = data.version || ""
                } else {
                    const gistRes = await fetch(`${GIST_VERSION_URL}?t=${Date.now()}`)
                    if (gistRes.ok) {
                        const gistData = await gistRes.json()
                        remoteVer = gistData.version || ""
                    }
                }
                if (remoteVer && isNewerVersion(remoteVer, currentVersion)) {
                    setUpdateStatus({ available: true, remoteVersion: remoteVer })
                }
            } catch (e) { console.error(e) }
        }
        checkUpdate()
    }, [currentVersion])
    const [activeTab, setActiveTab] = useState("overview")

    const [userStats] = useStorage({ key: "currentUserStats", instance: storage }, null)
    const [lastKnownUsername] = useStorage({ key: "lastKnownUsername", instance: storage }, "")
    const activeDetectedUser = (userStats?.username || lastKnownUsername || "").toLowerCase()
    
    // Multi-Account Rotation State
    const [multiAccounts, setMultiAccounts] = useStorage({ key: "multiAccounts", instance: storage }, [] as { username: string, password: string }[])
    const [multiAccountEnabled, setMultiAccountEnabled] = useStorage({ key: "multiAccountEnabled", instance: storage }, false)
    const [newMultiUsername, setNewMultiUsername] = useState("")
    const [newMultiPassword, setNewMultiPassword] = useState("")

    // Account Selector for per-account strategy management
    const [selectedProfileUsername, setSelectedProfileUsername] = useState<string>("")
    const availableAccounts = Array.from(new Set([
        activeDetectedUser,
        ...(multiAccounts || []).map(a => a.username.toLowerCase())
    ])).filter(Boolean)

    const currentUsername = (selectedProfileUsername || activeDetectedUser || (availableAccounts.length > 0 ? availableAccounts[0] : "global")).toLowerCase()
    const competitorsDataKey = `${currentUsername}_competitorsData`

    const [termsAccepted] = useStorage<boolean>({ key: "termsAccepted", instance: storage })
    const [session, setSession] = useStorage({ key: "session", instance: storage }, { isLoggedIn: false, user: null, isPremium: false })
    const [isRegistering, setIsRegistering] = useState(false)
    const [isRunning, setIsRunning] = useStorage({ key: "isRunning", instance: storage }, false)
    const [statsData, setStatsData] = useStorage({ key: `${currentUsername}_stats`, instance: storage }, { follows: 0, likes: 0, dms: 0, unfollows: 0 })
    const [hashtags, setHashtags] = useStorage({ key: `${currentUsername}_targetHashtags`, instance: storage }, ["#digitalart"])
    const [competitors, setCompetitors] = useStorage({ key: `${currentUsername}_targetCompetitors`, instance: storage }, ["@leomessi"])
    const [targetPosts, setTargetPosts] = useStorage({ key: `${currentUsername}_targetPostUrls`, instance: storage }, [] as string[])
    const [postInteractions, setPostInteractions] = useStorage({ key: `${currentUsername}_postInteractions`, instance: storage }, { likers: true, commenters: false })
    const [commentTemplates, setCommentTemplates] = useStorage({ key: `${currentUsername}_commentTemplates`, instance: storage }, [
        "Great post, thanks for sharing!",
        "Really solid content 👏",
        "Love this perspective!",
        "Super useful. Keep it up!"
    ])
    const [competitorsData, setCompetitorsData] = useStorage({ key: `${currentUsername}_competitorsData`, instance: storage }, [])
    const [newTag, setNewTag] = useState("")
    const [newCompetitor, setNewCompetitor] = useState("")
    const [newPostUrl, setNewPostUrl] = useState("")
    const [newCommentTemplate, setNewCommentTemplate] = useState("")
    const [logs, setLogs] = useStorage({ key: `${currentUsername}_logs`, instance: storage }, [])
    const [followedUsers, setFollowedUsers] = useStorage({ key: `${currentUsername}_followedUsers`, instance: storage }, [])
    const [interactionHistory] = useStorage<any[]>({ key: `${currentUsername}_interactionHistory`, instance: storage }, [])
    const [historySearch, setHistorySearch] = useState("")
    const [historyActionFilter, setHistoryActionFilter] = useState<"all" | "follow" | "unfollow" | "like" | "comment">("all")
    const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({})
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
    const [showHelpVideoModal, setShowHelpVideoModal] = useState(false)
    const [selectedCompetitorDetail, setSelectedCompetitorDetail] = useState<any | null>(null)

    const [chartReady, setChartReady] = useState(false)
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackMessage, setFeedbackMessage] = useState("")
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

    // Release Notes Logic
    const [lastSeenVersion, setLastSeenVersion] = useStorage({ key: "lastSeenVersion", instance: storage }, "")
    const [showReleaseNotes, setShowReleaseNotes] = useState(false)
    const [dashboardGuideSeen, setDashboardGuideSeen] = useStorage({ key: "dashboardGuideSeen", instance: storage }, false)
    const [showDashboardGuide, setShowDashboardGuide] = useState(false)

    useEffect(() => {
        if (lastSeenVersion !== undefined && lastSeenVersion !== "" && lastSeenVersion !== currentVersion) {
            setShowReleaseNotes(true)
        } else if (lastSeenVersion === "") {
            setLastSeenVersion(currentVersion)
        }
    }, [lastSeenVersion, currentVersion])

    useEffect(() => {
        if (ENABLE_FIRST_TIME_DASHBOARD_GUIDE && termsAccepted && session?.isLoggedIn && dashboardGuideSeen === false) {
            setShowDashboardGuide(true)
        }
    }, [termsAccepted, session?.isLoggedIn, dashboardGuideSeen])

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
    const safeCurrentAvatar = resolveStoredAvatarUrl(userStats) || `https://ui-avatars.com/api/?name=${encodeURIComponent(userStats?.username || "user")}&background=0f172a&color=fff`
    const sessionReportState = getSessionReportPresentation(isRunning, lastReport?.stopReason)

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

    const handleReloadInstagramAccount = async () => {
        const loadedUsername = (userStats?.username || "").toLowerCase()
        const detectedUsername = (await detectActiveUsername())?.toLowerCase()
        const lastKnownUsername = (await storage.get<string>("lastKnownUsername"))?.toLowerCase() || ""
        const targetUsername = detectedUsername || lastKnownUsername || loadedUsername
        const targetUrl = targetUsername
            ? `https://www.instagram.com/${targetUsername}/?mode=deep&manual_refresh=true`
            : "https://www.instagram.com/?manual_refresh=true"

        window.open(targetUrl, "_blank")

        try {
            if (!targetUsername) {
                alert("No se pudo detectar una cuenta activa. Abrí Instagram, iniciá sesión y volvé a intentar.")
                return
            }

            const existingProfile = await storage.get<any>(`${targetUsername}_currentUserStats`)
            const existingHistory = await storage.get<any[]>(`${targetUsername}_followerHistory`) || []
            const isFirstAccountLoad = !existingProfile || existingHistory.length === 0 || !(existingProfile?.latestPosts?.length > 0)

            await storage.set("lastKnownUsername", targetUsername)

            // Important: refresh without explicit target so it stores as current user context.
            const freshProfile = await refreshUserProfile()
            if (!freshProfile) {
                alert("No se pudo refrescar el perfil. Revisá que estés logueado en Instagram e intentá de nuevo.")
                return
            }

            await loadHistory(freshProfile.username)
            await loadUnfollowers(freshProfile.username)

            if (isFirstAccountLoad) {
                await syncStatsToSupabase(freshProfile)
                try {
                    setIsScanning(true)
                    setScanProgress(0)
                    await runDeepScan((count) => setScanProgress(count))
                } catch (scanErr) {
                    console.warn("Dashboard: first-time deep scan failed", scanErr)
                } finally {
                    setIsScanning(false)
                }
            }

            const refreshedUsername = (freshProfile.username || "").toLowerCase()
            if (loadedUsername && refreshedUsername && loadedUsername !== refreshedUsername) {
                alert(`Cuenta cambiada: @${loadedUsername} -> @${refreshedUsername}. Recargando panel...`)
                window.location.reload()
                return
            }

            if (isFirstAccountLoad) {
                alert(`Cuenta @${freshProfile.username} cargada por primera vez. Se ejecutó el scraping inicial del informe.`)
            }
        } catch (e) {
            console.error("Dashboard: refresh account failed", e)
            void reportCriticalError({
                area: "dashboard_refresh_active_account",
                error: e,
                appSurface: "dashboard"
            })
            alert("Hubo un error al refrescar la cuenta activa.")
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
        sleepDuration: 8,
        onlyDeadAccountUnfollow: false
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
        sessionCommentLimit: 25,
        chaosFreq: 30, chaosDur: 5,
        deadAccountDays: 45
    })

    const closeDashboardGuide = async () => {
        setShowDashboardGuide(false)
        await setDashboardGuideSeen(true)
    }

    useEffect(() => {
        if (!currentUsername || currentUsername === "global") return
        const syncTimer = setTimeout(() => {
            void syncAccountSettingsToSupabase(currentUsername, {
                config,
                delays,
                targetHashtags: hashtags,
                targetCompetitors: competitors,
                targetPostUrls: targetPosts,
                commentTemplates
            })
        }, 1500)
        return () => clearTimeout(syncTimer)
    }, [currentUsername, config, delays, hashtags, competitors, targetPosts, commentTemplates])

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && newTag.trim()) {
            const formatted = newTag.startsWith("#") ? newTag : `#${newTag}`
            setHashtags([...(hashtags || []), formatted])
            setNewTag("")
        }
    }

    const addCompetitor = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || !newCompetitor.trim()) return

        e.preventDefault()

        if (newCompetitor.trim()) {
            const raw = newCompetitor.trim()
            const fixed = raw.startsWith("@") ? raw : `@${raw}`
            const username = fixed.replace('@', '')

            if (!competitors.includes(fixed)) {
                setCompetitors([...(competitors || []), fixed])
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
                    void reportCriticalError({
                        area: "dashboard_quick_fetch_competitor",
                        error: err,
                        appSurface: "dashboard",
                        instagramUsername: username
                    })
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

    const addTargetPost = (e: React.KeyboardEvent) => {
        if (e.key !== "Enter") return
        const raw = newPostUrl.trim()
        if (!raw) return
        const normalized = raw.startsWith("http") ? raw : `https://${raw}`
        if (!/instagram\.com\/(p|reel)\//i.test(normalized)) {
            alert("Use a valid Instagram post/reel URL.")
            return
        }
        if (!targetPosts.includes(normalized)) {
            setTargetPosts([normalized, ...(targetPosts || [])].slice(0, 100))
        }
        setNewPostUrl("")
    }

    const addCommentTemplate = (e: React.KeyboardEvent) => {
        if (e.key !== "Enter") return
        const text = newCommentTemplate.trim()
        if (!text) return
        if (!commentTemplates.includes(text)) {
            setCommentTemplates([text, ...commentTemplates].slice(0, 30))
        }
        setNewCommentTemplate("")
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
            void reportCriticalError({
                area: "dashboard_submit_feedback",
                error: e,
                appSurface: "dashboard"
            })
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
        { label: "Total Comments", value: (statsData?.dms || 0).toLocaleString(), trend: "Tracked", icon: MessageSquare, color: "text-emerald-400", tooltip: "Automated comments executed by the bot." },
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
            {showHelpVideoModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 px-3 py-4 backdrop-blur-md sm:px-5 sm:py-8">
                    <div className="relative w-full max-w-3xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40">
                        <button
                            onClick={() => setShowHelpVideoModal(false)}
                            className="absolute right-5 top-5 z-10 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-slate-400 transition-colors hover:text-white"
                            aria-label="Close help video">
                            <X className="h-5 w-5" />
                        </button>
                        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_24%)] px-4 py-4 sm:px-6 sm:py-5">
                            <div className="flex items-start justify-between gap-6">
                                <div className="max-w-3xl">
                                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
                                        Help Video
                                    </div>
                                    <h3 className="text-xl font-black tracking-tight text-white sm:text-2xl">How SocialRadar Works</h3>
                                    <p className="mt-3 text-xs leading-relaxed text-slate-400 sm:text-sm">
                                        Watch the quick walkthrough for setup, launch flow, targeting sources, and the main dashboard controls.
                                    </p>
                                </div>
                                <BetaBadge label="Quick Guide" className="shrink-0" />
                            </div>
                        </div>
                        <div className="p-2 sm:p-4">
                            <div className="overflow-hidden rounded-[1.1rem] border border-white/10 bg-black sm:rounded-[1.35rem]">
                                <video
                                    key={helpDemoVideo}
                                    src={helpDemoVideo}
                                    controls
                                    autoPlay
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="aspect-video w-full bg-black"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showDashboardGuide && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 px-6 py-10 backdrop-blur-md">
                    <div className="relative w-full max-w-4xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.16),transparent_28%)] pointer-events-none" />
                        <div className="relative z-10 p-8 md:p-10">
                            <div className="mb-8 flex items-start justify-between gap-6">
                                <div className="max-w-2xl">
                                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">
                                        Welcome
                                    </div>
                                    <h2 className="text-4xl font-black tracking-tighter text-white">How the bot works</h2>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-400">
                                        This is a quick setup guide for first-time users. Start with Strategy, choose your targeting sources,
                                        turn on only the modules you want, and launch the bot when your account is ready.
                                    </p>
                                </div>
                                <button
                                    onClick={closeDashboardGuide}
                                    className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-400 transition-colors hover:text-white"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <GuideStep
                                    step="1"
                                    title="Choose Strategy"
                                    description="Go to Strategy & Source and decide where the bot should find people: hashtags, competitors, or specific posts."
                                    accent="bg-primary-500/15 text-primary-300 border border-primary-500/20"
                                />
                                <GuideStep
                                    step="2"
                                    title="Activate Modules"
                                    description="Turn on the actions you want to allow, like follows, likes, comments, or auto-unfollow. Beta features are marked inside the panel."
                                    accent="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                />
                                <GuideStep
                                    step="3"
                                    title="Review Safety"
                                    description="Check delays, session limits, and unfollow maturity in Settings before running long sessions. Start conservative on new accounts."
                                    accent="bg-amber-500/15 text-amber-300 border border-amber-500/20"
                                />
                                <GuideStep
                                    step="4"
                                    title="Launch And Monitor"
                                    description="Press Launch Bot, let the session run, and use Dashboard plus Churn Analysis to monitor results, queue health, and unfollows."
                                    accent="bg-sky-500/15 text-sky-300 border border-sky-500/20"
                                />
                            </div>

                            <div className="mt-8 rounded-[2rem] border border-white/10 bg-slate-950/60 p-6">
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Recommended first run</p>
                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <button
                                        onClick={() => {
                                            setActiveTab("targeting")
                                            void closeDashboardGuide()
                                        }}
                                        className="rounded-2xl bg-primary-600 px-5 py-4 text-left text-sm font-black text-white transition-all hover:bg-primary-500"
                                    >
                                        Open Strategy
                                    </button>
                                    <button
                                        onClick={() => {
                                            setActiveTab("settings")
                                            void closeDashboardGuide()
                                        }}
                                        className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left text-sm font-black text-slate-200 transition-all hover:bg-white/10"
                                    >
                                        Review Settings
                                    </button>
                                    <button
                                        onClick={closeDashboardGuide}
                                        className="rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-left text-sm font-black text-slate-400 transition-all hover:text-white"
                                    >
                                        I got it
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Sidebar */}
            <aside className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col p-8 backdrop-blur-xl">
                <div className="flex items-center gap-3 mb-12 px-2">
                    <div className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center shadow-lg shadow-emerald-500/10 overflow-hidden">
                        <img src={socialRadarLogo} alt="SocialRadar logo" className="w-8 h-8 object-contain" />
                    </div>
                    <div>
                        <h1 className="text-xl font-outfit font-bold tracking-tight text-white">SocialRadar</h1>
                        <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-500 uppercase">Pro Edition</span>
                    </div>
                </div>

                <nav className="space-y-3 flex-grow">
                    {[
                        { id: "overview", label: "Dashboard", icon: BarChart3 },
                        { id: "competitors", label: "Competitor Analysis", icon: Users, beta: true },
                        { id: "targeting", label: "Strategy & Source", icon: Search },
                        { id: "multiaccount", label: "Multi-Account", icon: RefreshCw, beta: true },
                        { id: "unfollow", label: "Unfollow Tracker", icon: UserPlus },
                        { id: "history", label: "Historial de Interacciones", icon: Activity },
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
                            {item.beta && <BetaBadge className={`${activeTab === item.id ? "border-white/25 bg-white/15 text-white" : ""} ml-auto`} />}
                        </button>
                    ))}
                </nav>

                <div className="mt-auto pt-8 border-t border-slate-800/50 space-y-4">
                    <button
                        onClick={() => setShowHelpVideoModal(true)}
                        className="w-full flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-left text-slate-300 transition-all duration-300 hover:bg-slate-800 hover:text-white"
                        title="Open help video"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                            <Play className="w-4 h-4 fill-current" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Help</p>
                            <p className="text-sm font-bold tracking-tight text-white">Watch setup guide</p>
                        </div>
                    </button>
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
                            {activeTab === 'multiaccount' && 'Multi-Account Rotation Engine'}
                            {activeTab === 'unfollow' && 'Churn Analysis'}
                            {activeTab === 'history' && 'Historial de Interacciones'}
                            {activeTab === 'settings' && 'Latency Control'}
                            {activeTab === 'database' && 'Audience Database'}
                        </h2>
                        <p className="text-sm text-slate-500 font-medium">Real-time modular bot configuration.</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <button
                            onClick={handleReloadInstagramAccount}
                            className="h-12 px-6 rounded-2xl font-black text-xs tracking-widest uppercase transition-all duration-300 flex items-center gap-2 bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white"
                            title="Refresh active Instagram account"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>

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

                                    const actualUser = currentUsername !== "global" ? currentUsername : (lastKnownUsername || "global")
                                    await storage.set("sessionLikes", 0)
                                    await storage.set("sessionFollows", 0)
                                    await storage.set("sessionUnfollows", 0)
                                    await storage.set(`${actualUser}_postTargetQueue`, [])

                                    // Auto-save pending post URL if user forgot to press Enter
                                    let currentTargetUrl = newPostUrl.trim()
                                    if (currentTargetUrl && (currentTargetUrl.includes('/p/') || currentTargetUrl.includes('/reels/') || currentTargetUrl.includes('/reel/'))) {
                                        if (!currentTargetUrl.startsWith('http')) currentTargetUrl = 'https://' + currentTargetUrl
                                        const currentPosts = targetPosts || []
                                        if (!currentPosts.includes(currentTargetUrl)) {
                                            const updatedPosts = [...currentPosts, currentTargetUrl]
                                            setTargetPosts(updatedPosts)
                                            await storage.set(`${currentUsername}_targetPostUrls`, updatedPosts)
                                        }
                                        setNewPostUrl("")
                                    }
                                    
                                    // Remove 'post:' entries from ALL processedHistory to guarantee re-scraping
                                    const allData = await chrome.storage.local.get(null)
                                    for (const key of Object.keys(allData)) {
                                        if (key.endsWith("_processedHistory")) {
                                            let history = allData[key]
                                            try {
                                                if (typeof history === 'string') history = JSON.parse(history)
                                            } catch(e){}
                                            
                                            if (Array.isArray(history)) {
                                                const cleaned = history.filter(h => typeof h === 'string' && !h.startsWith('post:'))
                                                await chrome.storage.local.set({ [key]: JSON.stringify(cleaned) })
                                            }
                                        }
                                    }
                                    
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
                                                    src={safeCurrentAvatar}
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
                                <div className={`bg-slate-900/60 border ${sessionReportState.borderClass} rounded-[2rem] p-6 mb-8 flex items-center justify-between animate-in fade-in slide-in-from-top-4`}>
                                    <div className="flex items-center gap-6">
                                        <div className={`p-4 rounded-2xl ${sessionReportState.iconWrapClass}`}>
                                            <sessionReportState.Icon className={`w-6 h-6 ${isRunning ? "animate-pulse" : ""}`} />
                                        </div>
                                        <div>
                                            <h4 className={`text-xs font-black uppercase tracking-widest ${sessionReportState.accentClass} mb-1`}>{sessionReportState.badgeLabel}</h4>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-bold text-white">{sessionReportState.title}</h3>
                                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono">{isRunning ? elapsedTime : lastReport?.durationStr}</span>
                                            </div>
                                            {!isRunning && lastReport && <p className="text-xs text-slate-400 mt-1">{lastReport?.stopReason} • ended at {new Date(lastReport.endTime).toLocaleTimeString()} on {new Date(lastReport.endTime).toLocaleDateString()}</p>}
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
                                                        <img src={sanitizeImageUrl(post.url)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
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
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="text-xl font-black tracking-tight">Activity Log</h3>
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={async () => {
                                                    setLogs([])
                                                    await storage.set(`${currentUsername}_logs`, [])
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-bold rounded-xl transition-colors border border-rose-500/20"
                                                title="Clear activity log"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Clear Logs
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    const logText = (logs || []).map((l: any) => `[${l.time}] ${l.type ? l.type.toUpperCase() : 'INFO'}: ${l.msg}`).join('\n');
                                                    const blob = new Blob([logText], { type: "text/plain" });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `socialradar_logs_${currentUsername}_${new Date().toISOString().split('T')[0]}.txt`;
                                                    a.click();
                                                    URL.revokeObjectURL(url);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-xl transition-colors"
                                            >
                                                <Download className="w-4 h-4" />
                                                Export Logs
                                            </button>
                                        </div>
                                    </div>
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

                    {activeTab === "competitors" && (() => {
                        try {
                            const topViralPosts = extractTopViralPosts(competitorsData || [])
                            const formatBreakdown = calculateCompetitorFormatBreakdown(competitorsData || [])
                            const totalFormatPosts = formatBreakdown.reels.count + formatBreakdown.images.count + formatBreakdown.carousels.count || 1

                        return (
                            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Header Section */}
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                                            <Users className="w-8 h-8 text-primary-500" />
                                            Competitor Analysis & Market Intelligence
                                        </h3>
                                        <p className="text-slate-400 font-medium mt-1">Head-to-head benchmarking, viral content prospecting, and format breakdown powered by 0-extra-request GraphQL interception.</p>
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

                                {/* Section 1: Head-to-Head Benchmarking */}
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xl font-black text-white flex items-center gap-3">
                                            <BarChart2 className="w-6 h-6 text-indigo-400" />
                                            Head-to-Head Benchmarking
                                        </h4>
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Comparison</span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-800 text-slate-500 text-[11px] font-black uppercase tracking-wider">
                                                    <th className="pb-4">Cuenta</th>
                                                    <th className="pb-4">Seguidores</th>
                                                    <th className="pb-4">Posts</th>
                                                    <th className="pb-4">Engagement Rate</th>
                                                    <th className="pb-4">Frecuencia</th>
                                                    <th className="pb-4">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50">
                                                {/* My Account Row */}
                                                <tr className="bg-primary-500/5 font-bold">
                                                    <td className="py-4 flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full border-2 border-primary-500 overflow-hidden">
                                                            <img src={safeCurrentAvatar} className="w-full h-full object-cover" />
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-black">@{userStats?.username || currentUsername} (Tu Cuenta)</p>
                                                            <span className="text-[10px] text-primary-400 font-bold uppercase">Cuenta Principal</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-white font-black">{(userStats?.stats?.followers || 0).toLocaleString()}</td>
                                                    <td className="py-4 text-slate-300 font-bold">{(userStats?.stats?.posts || 0).toLocaleString()}</td>
                                                    <td className="py-4">
                                                        <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-black text-xs">
                                                            {userStats?.engagementRate || "2.4"}%
                                                        </span>
                                                    </td>
                                                    <td className="py-4 text-slate-400 text-xs font-semibold">Diario</td>
                                                    <td className="py-4">
                                                        <span className="text-xs text-slate-500 italic">Baseline</span>
                                                    </td>
                                                </tr>

                                                {/* Competitors Rows */}
                                                {(competitorsData || []).map((comp: any) => {
                                                    const posts = comp.latestPosts || []
                                                    let postingFreq = "N/A"
                                                    if (posts.length >= 2) {
                                                        const first = posts[0].timestamp
                                                        const last = posts[posts.length - 1].timestamp
                                                        const diffDays = Math.max(1, ((first - last) / 86400))
                                                        postingFreq = `${(diffDays / posts.length).toFixed(1)}d / post`
                                                    }
                                                    const engNum = Number(comp.engagementRate) || 0

                                                    return (
                                                        <tr key={comp.username} className="hover:bg-slate-800/30 transition-colors">
                                                            <td className="py-4 flex items-center gap-3 cursor-pointer" onClick={() => setSelectedCompetitorDetail(comp)}>
                                                                <div className="w-10 h-10 rounded-full border border-slate-700 overflow-hidden">
                                                                    <img src={sanitizeImageUrl(comp.avatarUrl) || `https://ui-avatars.com/api/?name=${comp.username}&background=0f172a&color=fff`} className="w-full h-full object-cover" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-white font-bold hover:text-primary-400 transition-colors">@{comp.username}</p>
                                                                    <p className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">{comp.fullName}</p>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 text-slate-200 font-bold">{(Number(comp.stats?.followers) || 0).toLocaleString()}</td>
                                                            <td className="py-4 text-slate-400 font-semibold">{(Number(comp.stats?.posts) || 0).toLocaleString()}</td>
                                                            <td className="py-4">
                                                                <span className={`px-3 py-1 rounded-lg font-black text-xs ${engNum >= 3.0 ? 'bg-emerald-500/10 text-emerald-400' : engNum >= 1.5 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                                                                    {engNum}%
                                                                </span>
                                                            </td>
                                                            <td className="py-4 text-slate-400 text-xs font-semibold">{postingFreq}</td>
                                                            <td className="py-4 flex items-center gap-2">
                                                                <button
                                                                    onClick={() => setSelectedCompetitorDetail(comp)}
                                                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all"
                                                                >
                                                                    Ver detalles
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setCompetitors(competitors.filter(c => c !== `@${comp.username}`))
                                                                        setCompetitorsData((competitorsData || []).filter((c: any) => c.username !== comp.username))
                                                                    }}
                                                                    className="p-2 rounded-xl bg-slate-950 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                                                                    title="Eliminar Competidor"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Section 2: Top Performing Content & 1-Click Targeting */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-2xl font-black text-white flex items-center gap-3">
                                                <TrendingUp className="w-6 h-6 text-emerald-400" />
                                                Contenido Viral de la Competencia
                                            </h4>
                                            <p className="text-slate-400 text-sm font-medium">Posts con mayor rendimiento en tu nicho. Haz clic en "Apuntar a este Post" para que el bot interactúe con sus usuarios.</p>
                                        </div>
                                    </div>

                                    {topViralPosts.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {topViralPosts.map((post: ViralPostItem, idx: number) => (
                                                <div key={idx} className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] overflow-hidden group hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                                                    <div className="space-y-4">
                                                        {/* Post Image Thumbnail */}
                                                        <div className="relative h-44 w-full bg-slate-950 overflow-hidden">
                                                            <img
                                                                src={post.url}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                                alt={`Post de @${post.username}`}
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${post.username}&background=0f172a&color=fff`
                                                                }}
                                                            />
                                                            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-black flex items-center gap-2 border border-slate-700">
                                                                <img src={post.avatarUrl} className="w-4 h-4 rounded-full" />
                                                                <span>@{post.username}</span>
                                                            </div>
                                                            <div className="absolute top-3 right-3 flex items-center gap-2">
                                                                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/90 backdrop-blur-md text-slate-950 text-[11px] font-black shadow-lg">
                                                                    🔥 {post.viralScore}x Avg
                                                                </span>
                                                                <a
                                                                    href={post.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md border border-slate-700 transition-colors"
                                                                    title="Ver post en Instagram"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </a>
                                                            </div>
                                                        </div>

                                                        <div className="p-6 pt-0 space-y-4">
                                                            <div className="grid grid-cols-2 gap-3 text-center py-2 bg-slate-950/40 rounded-xl border border-slate-800">
                                                                <div>
                                                                    <p className="text-[10px] uppercase font-black text-slate-500">Likes</p>
                                                                    <p className="text-white font-black text-sm">{post.likes.toLocaleString()}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] uppercase font-black text-slate-500">Comentarios</p>
                                                                    <p className="text-white font-black text-sm">{post.comments.toLocaleString()}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="p-6 pt-0">
                                                        <button
                                                            onClick={async () => {
                                                                const currentUrls = targetPosts || []
                                                                if (!currentUrls.includes(post.url)) {
                                                                    const updated = [...currentUrls, post.url]
                                                                    setTargetPosts(updated)
                                                                    setConfig({ ...config, sourcePosts: true })
                                                                    alert(`✅ Post de @${post.username} agregado a los objetivos del bot!`)
                                                                } else {
                                                                    alert(`ℹ️ El post ya está en la lista de objetivos.`)
                                                                }
                                                            }}
                                                            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <Target className="w-4 h-4" />
                                                            🎯 Apuntar a este Post
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-12 bg-slate-900/20 border border-dashed border-slate-800 rounded-[2rem] text-center">
                                            <p className="text-slate-500 font-bold text-sm">Agrega competidores o ejecuta un audit para extraer los posts virales con mayor interacción.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Section 3: Format Breakdown & Intelligence */}
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 space-y-6">
                                    <h4 className="text-xl font-black text-white flex items-center gap-3">
                                        <Grid className="w-6 h-6 text-purple-400" />
                                        Desglose por Formato de Contenido
                                    </h4>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Reels */}
                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-white flex items-center gap-2">🎬 Reels</span>
                                                <span className="text-xs text-purple-400 font-bold">{Math.round((formatBreakdown.reels.count / totalFormatPosts) * 100)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.round((formatBreakdown.reels.count / totalFormatPosts) * 100)}%` }} />
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-400 pt-2 font-medium">
                                                <span>Prom. Likes: <strong className="text-white">{formatBreakdown.reels.avgLikes}</strong></span>
                                                <span>Prom. Coms: <strong className="text-white">{formatBreakdown.reels.avgComments}</strong></span>
                                            </div>
                                        </div>

                                        {/* Single Posts */}
                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-white flex items-center gap-2">📸 Posts Estáticos</span>
                                                <span className="text-xs text-indigo-400 font-bold">{Math.round((formatBreakdown.images.count / totalFormatPosts) * 100)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.round((formatBreakdown.images.count / totalFormatPosts) * 100)}%` }} />
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-400 pt-2 font-medium">
                                                <span>Prom. Likes: <strong className="text-white">{formatBreakdown.images.avgLikes}</strong></span>
                                                <span>Prom. Coms: <strong className="text-white">{formatBreakdown.images.avgComments}</strong></span>
                                            </div>
                                        </div>

                                        {/* Carousels */}
                                        <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-white flex items-center gap-2">🖼️ Carruseles</span>
                                                <span className="text-xs text-emerald-400 font-bold">{Math.round((formatBreakdown.carousels.count / totalFormatPosts) * 100)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.round((formatBreakdown.carousels.count / totalFormatPosts) * 100)}%` }} />
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-400 pt-2 font-medium">
                                                <span>Prom. Likes: <strong className="text-white">{formatBreakdown.carousels.avgLikes}</strong></span>
                                                <span>Prom. Coms: <strong className="text-white">{formatBreakdown.carousels.avgComments}</strong></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    } catch (err) {
                        console.error("Dashboard: Error rendering Competitor Analysis tab", err)
                        return (
                            <div className="p-12 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] text-center space-y-4">
                                <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
                                <h4 className="text-xl font-black text-white">Error al cargar la pestaña de Competidores</h4>
                                <p className="text-slate-400 text-sm max-w-md mx-auto">Ocurrió un inconveniente al procesar la información de los competidores. Intenta recargar la página o volver a intentar.</p>
                            </div>
                        )
                    }
                    })()}

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
                            {/* Per-Account Strategy Selector Banner */}
                            {availableAccounts.length > 0 && (
                                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Account Strategy Profile</h4>
                                            <p className="text-xs text-slate-400 font-medium">Select an Instagram profile to configure its independent strategy and targets.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-400">Editing Strategy For:</span>
                                        <select
                                            value={currentUsername}
                                            onChange={(e) => setSelectedProfileUsername(e.target.value)}
                                            className="bg-slate-950 text-amber-400 font-bold text-sm px-4 py-2.5 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400 cursor-pointer shadow-lg shadow-amber-500/5"
                                        >
                                            {availableAccounts.map(acc => (
                                                <option key={acc} value={acc}>@{acc}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-8">
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                    <h3 className="text-lg font-black tracking-tight mb-8 uppercase text-slate-400 tracking-[0.2em]">Active Action Modules</h3>
                                    <div className="space-y-4">
                                        {[
                                            { id: "likeEnabled", label: "Automated Likes", icon: Heart, color: "text-rose-400" },
                                            { id: "followEnabled", label: "Smart Follow", icon: UserPlus, color: "text-blue-400" },
                                            { id: "unfollowEnabled", label: "Auto-Unfollow (Clean)", icon: Trash2, color: "text-amber-400" },
                                            { id: "dmEnabled", label: "Comments Auto-Pilot", icon: MessageSquare, color: "text-emerald-400", beta: true }
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
                                                    {item.beta && <BetaBadge />}
                                                </div>
                                                {config[item.id] ? <CheckCircle2 className="w-6 h-6 text-primary-500" /> : <Circle className="w-6 h-6 text-slate-800" />}
                                                {item.label.includes("(Dev)") && <span className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[8px] font-bold rounded uppercase">In Dev</span>}
                                            </button>
                                        ))}

                                        <button
                                            onClick={() => setMultiAccountEnabled(!multiAccountEnabled)}
                                            className={`w-full flex items-center justify-between p-6 rounded-2xl transition-all border ${multiAccountEnabled
                                                ? "bg-slate-900 border-amber-500/50 shadow-lg shadow-amber-500/5"
                                                : "bg-slate-950/50 border-slate-800 opacity-50 grayscale"
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <Users className={`w-5 h-5 ${multiAccountEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
                                                <span className="font-bold text-white">Multi-Account Rotation</span>
                                                <BetaBadge className="ml-2 border-amber-500/30 bg-amber-500/10 text-amber-400" />
                                            </div>
                                            {multiAccountEnabled ? <CheckCircle2 className="w-6 h-6 text-amber-500" /> : <Circle className="w-6 h-6 text-slate-800" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10">
                                    <h3 className="text-lg font-black tracking-tight mb-8 uppercase text-slate-400 tracking-[0.2em]">Data Sources</h3>
                                    <div className="space-y-4">
                                        {[
                                            { id: "sourceHashtags", label: "Monitor Hashtags", icon: Search, color: "text-indigo-400" },
                                            { id: "sourceCompetitors", label: "Target Competitors", icon: Zap, color: "text-primary-400" },
                                            { id: "sourcePosts", label: "Specific Posts Targeting", icon: Heart, color: "text-rose-400", beta: true }
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
                                                    {sourceItem.beta && <BetaBadge />}
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
                                            Target Specific Posts
                                        </h3>
                                        <div className="p-8 bg-slate-950/50 border border-slate-800 rounded-[2rem]">
                                            <div className="flex flex-wrap gap-3 mb-6">
                                                {(targetPosts || []).map((url) => (
                                                    <span key={url} className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 font-bold flex items-center gap-2">
                                                        <span className="max-w-[380px] truncate">{url}</span>
                                                        <button
                                                            onClick={() => setTargetPosts((targetPosts || []).filter((u) => u !== url))}
                                                            className="text-slate-500 hover:text-rose-400"
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                            <input
                                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-semibold"
                                                placeholder="Paste Instagram post/reel URL and press Enter..."
                                                value={newPostUrl}
                                                onChange={(e) => setNewPostUrl(e.target.value)}
                                                onKeyDown={addTargetPost}
                                            />
                                            <p className="text-xs text-slate-500 mt-3">When enabled, bot can start missions directly from these posts.</p>
                                            
                                            <div className="mt-6 space-y-3 border-t border-slate-800 pt-6">
                                                <h4 className="text-sm font-bold text-slate-300">Interact With:</h4>
                                                <div className="flex gap-4">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={postInteractions.likers}
                                                            onChange={(e) => setPostInteractions({ ...postInteractions, likers: e.target.checked })}
                                                            className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500 focus:ring-offset-slate-950"
                                                        />
                                                        <span className="text-sm font-medium text-slate-400">Likers</span>
                                                    </label>
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={postInteractions.commenters}
                                                            onChange={(e) => setPostInteractions({ ...postInteractions, commenters: e.target.checked })}
                                                            className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500 focus:ring-offset-slate-950"
                                                        />
                                                        <span className="text-sm font-medium text-slate-400">Commenters</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "multiaccount" && (
                        <div className="space-y-12 pb-24 max-w-6xl">
                            {/* Hero Card */}
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                            <RefreshCw className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="text-2xl font-black text-white tracking-tight">Multi-Account Rotation Engine</h3>
                                                <BetaBadge className="border-amber-500/30 bg-amber-500/10 text-amber-400" />
                                            </div>
                                            <p className="text-slate-400 text-sm font-medium max-w-xl">
                                                Automatically cycle between multiple Instagram accounts linked under Meta Accounts Center when daily action limits (Likes, Follows) are reached.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setMultiAccountEnabled(!multiAccountEnabled)}
                                        className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all text-sm shrink-0 border ${multiAccountEnabled
                                            ? "bg-amber-500 text-slate-950 border-amber-400 shadow-xl shadow-amber-500/20 hover:bg-amber-400"
                                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white"
                                            }`}
                                    >
                                        <RefreshCw className={`w-5 h-5 ${multiAccountEnabled ? 'animate-spin' : ''}`} />
                                        {multiAccountEnabled ? "ROTATION ENABLED" : "ROTATION DISABLED"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-800/60">
                                    <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-5 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                            <Zap className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block">Current Active Context</span>
                                            <span className="text-sm font-bold text-white">@{currentUsername}</span>
                                        </div>
                                    </div>

                                    <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-5 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block">Account Switch Trigger</span>
                                            <span className="text-sm font-bold text-white">Per-Session Limit Reached</span>
                                        </div>
                                    </div>

                                    <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-5 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                            <Shield className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block">Switch Mode</span>
                                            <span className="text-sm font-bold text-white">Meta UI Switcher (No Re-auth)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Account Manager Card */}
                            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-bold text-white">Target Accounts Queue</h4>
                                            <p className="text-slate-400 text-xs font-medium">Add linked Instagram usernames to include in the rotation order.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2">
                                    <div className="flex gap-4">
                                        <input
                                            type="text"
                                            placeholder="Instagram Username (e.g. jdoe)"
                                            value={newMultiUsername}
                                            onChange={(e) => setNewMultiUsername(e.target.value.toLowerCase().trim().replace('@', ''))}
                                            className="flex-1 bg-slate-950/50 border border-slate-800 rounded-xl px-5 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors text-sm font-medium"
                                        />
                                        <button
                                            onClick={() => {
                                                if (newMultiUsername) {
                                                    const newAcc = { username: newMultiUsername, password: "" }
                                                    setMultiAccounts([...(multiAccounts || []), newAcc])
                                                    setNewMultiUsername("")
                                                }
                                            }}
                                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 rounded-xl transition-colors text-sm flex items-center gap-2"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Add Account
                                        </button>
                                    </div>

                                    {multiAccounts && multiAccounts.length > 0 ? (
                                        <div className="grid gap-3 mt-6">
                                            {multiAccounts.map((acc, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-slate-950/40 border border-slate-800/50 rounded-2xl p-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 text-xs">
                                                            #{idx + 1}
                                                        </div>
                                                        <div>
                                                            <div className="text-white font-bold">@{acc.username}</div>
                                                            <div className="text-xs text-amber-500/70 font-medium">Linked Account (Meta UI Switcher)</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setMultiAccounts(multiAccounts.filter((_, i) => i !== idx))
                                                        }}
                                                        className="p-2 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                                                        title="Remove account"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-slate-600 text-center font-medium italic py-8 border border-dashed border-slate-800/80 rounded-2xl text-xs">
                                            No accounts in rotation queue. Add linked profiles above.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Workflow & Setup Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                            <RefreshCw className="w-5 h-5" />
                                        </div>
                                        <h4 className="text-xl font-bold text-white">How Multi-Account Works</h4>
                                    </div>
                                    <div className="space-y-4 text-sm text-slate-400 font-medium leading-relaxed">
                                        <div className="flex gap-4 items-start">
                                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                                            <p><strong className="text-white">Action Limit Reached:</strong> When your active account reaches the configured Like or Follow limit (e.g., 100 Likes), the engine triggers an automatic switch.</p>
                                        </div>
                                        <div className="flex gap-4 items-start">
                                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                                            <p><strong className="text-white">Automated UI Navigation:</strong> SocialRadar opens Instagram's sidebar menu, selects <em>"Switch Accounts" / "Cambiar de cuenta"</em>, and clicks the next linked profile in your list.</p>
                                        </div>
                                        <div className="flex gap-4 items-start">
                                            <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                                            <p><strong className="text-white">Seamless Sequence Resume:</strong> Once logged into the next profile, SocialRadar automatically performs its routine audit and resumes the growth strategy without manual password input.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-10 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <h4 className="text-xl font-bold text-white">Prerequisites & Setup</h4>
                                    </div>
                                    <div className="space-y-4 text-sm text-slate-400 font-medium leading-relaxed">
                                        <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50">
                                            <span className="font-bold text-white block mb-1">🔗 Link Accounts in Instagram</span>
                                            Make sure all accounts you wish to rotate are already logged into Instagram and linked under Meta Accounts Center (visible under the <em>"Cambiar de cuenta"</em> popup).
                                        </div>
                                        <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50">
                                            <span className="font-bold text-white block mb-1">⚙️ Independent Profile Settings</span>
                                            Each Instagram profile maintains its own independent logs, statistics, hashtags, and limit settings in SocialRadar.
                                        </div>
                                    </div>
                                </div>
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
                                        <BetaBadge className="mr-4" />
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

                                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-rose-500/30 transition-all group">
                                        <div className="flex justify-between items-start mb-8">
                                            <div>
                                                <h3 className="text-sm font-black text-white group-hover:text-rose-400 transition-colors uppercase tracking-[0.2em] mb-2">Max Session Comments</h3>
                                                <p className="text-xs text-slate-500 font-medium">Auto-stop comments after this limit</p>
                                            </div>
                                            <div className="px-4 py-1.5 bg-rose-500/10 text-rose-400 rounded-full text-[10px] font-black tracking-widest border border-rose-500/20 shadow-lg shadow-rose-500/10 uppercase">
                                                REC: 15 - 30
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            value={delays?.sessionCommentLimit || 25}
                                            onChange={(e) => setDelays({ ...delays, sessionCommentLimit: parseInt(e.target.value) || 0 })}
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

                                {config.dmEnabled && (
                                    <div className="mt-8 bg-slate-900/40 border border-slate-800/50 rounded-[2rem] p-10 hover:border-emerald-500/30 transition-all group">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Comment Templates</h3>
                                            <span className="text-xs text-slate-500 font-bold">Press Enter to add</span>
                                        </div>
                                        <div className="flex flex-wrap gap-3 mb-5">
                                            {(commentTemplates || []).map((template) => (
                                                <span key={template} className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-semibold flex items-center gap-2">
                                                    <span className="max-w-[480px] truncate">{template}</span>
                                                    <button onClick={() => setCommentTemplates((commentTemplates || []).filter((t) => t !== template))} className="text-slate-500 hover:text-rose-400">×</button>
                                                </span>
                                            ))}
                                        </div>
                                        <input
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:border-emerald-500"
                                            placeholder="Add a comment template..."
                                            value={newCommentTemplate}
                                            onChange={(e) => setNewCommentTemplate(e.target.value)}
                                            onKeyDown={addCommentTemplate}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "history" && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            {/* Header Banner */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
                                <div className="relative z-10 space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-bold uppercase tracking-wider">
                                        <Activity className="w-3.5 h-3.5" /> Log General
                                    </div>
                                    <h2 className="text-3xl font-outfit font-black text-white tracking-tight">Historial de Interacciones</h2>
                                    <p className="text-slate-400 text-sm max-w-xl">
                                        Registro unificado de todas las acciones del bot (Follows, Unfollows, Likes y Comentarios) agrupadas por fecha.
                                    </p>
                                </div>
                                <div className="relative z-10 flex items-center gap-3">
                                    <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-center min-w-[120px]">
                                        <p className="text-2xl font-black text-white">{interactionHistory?.length || 0}</p>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Acciones</p>
                                    </div>
                                </div>
                            </div>

                            {/* Filter Controls Bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/40 border border-slate-800">
                                {/* Search Input */}
                                <div className="relative flex-grow max-w-md">
                                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por usuario (@ejemplo)..."
                                        value={historySearch}
                                        onChange={(e) => setHistorySearch(e.target.value)}
                                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl pl-11 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 transition-colors"
                                    />
                                    {historySearch && (
                                        <button
                                            onClick={() => setHistorySearch("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Action Filter Pills */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {[
                                        { id: "all", label: "Todos", count: interactionHistory?.length || 0 },
                                        { id: "follow", label: "Follows", count: (interactionHistory || []).filter((r: any) => r.action === "follow").length },
                                        { id: "unfollow", label: "Unfollows", count: (interactionHistory || []).filter((r: any) => r.action === "unfollow").length },
                                        { id: "like", label: "Likes", count: (interactionHistory || []).filter((r: any) => r.action === "like").length },
                                        { id: "comment", label: "Comentarios", count: (interactionHistory || []).filter((r: any) => r.action === "comment").length }
                                    ].map(filter => (
                                        <button
                                            key={filter.id}
                                            onClick={() => setHistoryActionFilter(filter.id as any)}
                                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                                historyActionFilter === filter.id
                                                    ? "bg-primary-600 text-white shadow-lg shadow-primary-600/20"
                                                    : "bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white"
                                            }`}
                                        >
                                            {filter.label}
                                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                                                historyActionFilter === filter.id ? "bg-white/20 text-white" : "bg-slate-700/60 text-slate-400"
                                            }`}>
                                                {filter.count}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Grouped Accordions */}
                            {(() => {
                                const filtered = (interactionHistory || []).filter((rec: any) => {
                                    const matchesUser = !historySearch || rec.username.toLowerCase().includes(historySearch.toLowerCase().replace("@", ""))
                                    const matchesAction = historyActionFilter === "all" || rec.action === historyActionFilter
                                    return matchesUser && matchesAction
                                })

                                if (filtered.length === 0) {
                                    return (
                                        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-3">
                                            <Activity className="w-10 h-10 text-slate-600 mx-auto" />
                                            <p className="text-slate-300 font-bold">No se encontraron interacciones</p>
                                            <p className="text-slate-500 text-xs">
                                                {interactionHistory?.length === 0
                                                    ? "El bot registrará automáticamente aquí todos los Follows, Unfollows, Likes y Comentarios al iniciar misiones."
                                                    : "No hay registros que coincidan con la búsqueda o filtro seleccionado."}
                                            </p>
                                        </div>
                                    )
                                }

                                // Group by Date string
                                const grouped: Record<string, any[]> = {}
                                filtered.forEach((rec: any) => {
                                    const dateKey = rec.dateStr || new Date(rec.timestamp).toISOString().split('T')[0]
                                    if (!grouped[dateKey]) grouped[dateKey] = []
                                    grouped[dateKey].push(rec)
                                })

                                const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

                                return (
                                    <div className="space-y-4">
                                        {sortedDates.map((dateStr, index) => {
                                            const records = grouped[dateStr]
                                            const isExpanded = expandedDates[dateStr] ?? (index === 0) // Default expand today/latest

                                            const toggleDate = () => {
                                                setExpandedDates(prev => ({ ...prev, [dateStr]: !isExpanded }))
                                            }

                                            // Format date string nicely
                                            let formattedDateTitle = dateStr
                                            try {
                                                const [year, month, day] = dateStr.split('-')
                                                if (year && month && day) {
                                                    const d = new Date(Number(year), Number(month) - 1, Number(day))
                                                    formattedDateTitle = d.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                                                    formattedDateTitle = formattedDateTitle.charAt(0).toUpperCase() + formattedDateTitle.slice(1)
                                                }
                                            } catch (e) {}

                                            return (
                                                <div key={dateStr} className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden transition-all">
                                                    {/* Accordion Header */}
                                                    <button
                                                        onClick={toggleDate}
                                                        className="w-full px-6 py-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/60 transition-colors text-left"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 rounded-xl bg-primary-500/10 text-primary-400">
                                                                <Calendar className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-white text-base">{formattedDateTitle}</h3>
                                                                <span className="text-xs text-slate-500 font-mono">{dateStr}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300">
                                                                {records.length} {records.length === 1 ? 'interacción' : 'interacciones'}
                                                            </span>
                                                            <div className={`p-1.5 rounded-lg bg-slate-800 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                                                <ChevronDown className="w-4 h-4" />
                                                            </div>
                                                        </div>
                                                    </button>

                                                    {/* Accordion Content (Table List Layout) */}
                                                    {isExpanded && (
                                                        <div className="border-t border-slate-800/80 overflow-x-auto">
                                                            <table className="w-full text-left text-sm">
                                                                <thead>
                                                                    <tr className="bg-slate-950/40 border-b border-slate-800/60 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                                                        <th className="px-6 py-4">Usuario</th>
                                                                        <th className="px-6 py-4">Acción Realizada</th>
                                                                        <th className="px-6 py-4">Hora</th>
                                                                        <th className="px-6 py-4">Detalle / Origen</th>
                                                                        <th className="px-6 py-4 text-right">Ver Perfil</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-800/40">
                                                                    {records.map((item: any) => {
                                                                        const actionBadges: Record<string, { label: string, color: string, icon: any }> = {
                                                                            follow: { label: "Followed", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: UserPlus },
                                                                            unfollow: { label: "Unfollowed", color: "bg-rose-500/10 text-rose-400 border-rose-500/20", icon: UserMinus },
                                                                            like: { label: "Liked", color: "bg-pink-500/10 text-pink-400 border-pink-500/20", icon: Heart },
                                                                            comment: { label: "Commented", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", icon: MessageSquare }
                                                                        }

                                                                        const badge = actionBadges[item.action] || { label: item.action, color: "bg-slate-800 text-slate-300 border-slate-700", icon: Activity }
                                                                        const IconComponent = badge.icon

                                                                        return (
                                                                            <tr key={item.id || `${item.timestamp}_${item.username}`} className="hover:bg-slate-800/30 transition-colors group">
                                                                                <td className="px-6 py-4">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-black text-primary-400 group-hover:bg-primary-600 group-hover:text-white transition-all">
                                                                                            {item.username?.[0]?.toUpperCase() || "?"}
                                                                                        </div>
                                                                                        <a
                                                                                            href={item.url || `https://www.instagram.com/${item.username}`}
                                                                                            target="_blank"
                                                                                            rel="noreferrer"
                                                                                            className="font-bold text-white hover:text-primary-400 flex items-center gap-1.5 transition-colors"
                                                                                        >
                                                                                            @{item.username}
                                                                                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                                        </a>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-4">
                                                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase border ${badge.color}`}>
                                                                                        <IconComponent className="w-3 h-3" />
                                                                                        {badge.label}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-6 py-4 text-xs font-mono text-slate-400">
                                                                                    <span className="flex items-center gap-1.5">
                                                                                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                                                                                        {item.timeStr || new Date(item.timestamp).toLocaleTimeString()}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-6 py-4 text-xs text-slate-400">
                                                                                    <span className="truncate max-w-[220px] block" title={item.details}>
                                                                                        {item.details || "Automated Task"}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-6 py-4 text-right">
                                                                                    <a
                                                                                        href={item.url || `https://www.instagram.com/${item.username}`}
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-primary-600 hover:text-white text-slate-300 text-xs font-bold transition-all border border-slate-700 hover:border-primary-500"
                                                                                    >
                                                                                        Perfil <ExternalLink className="w-3 h-3" />
                                                                                    </a>
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
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
                                                        <img src={sanitizeImageUrl(post.url)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
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

                {/* Competitor Detail Modal */}
                {selectedCompetitorDetail && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 backdrop-blur-xl bg-black/60 animate-in fade-in duration-300">
                        <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                            <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-full border-2 border-primary-500 overflow-hidden">
                                        <img src={sanitizeImageUrl(selectedCompetitorDetail.avatarUrl) || `https://ui-avatars.com/api/?name=${selectedCompetitorDetail.username}&background=0f172a&color=fff`} className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white flex items-center gap-2">
                                            {selectedCompetitorDetail.fullName || selectedCompetitorDetail.username}
                                            {selectedCompetitorDetail.isVerified && <CheckCircle2 className="w-5 h-5 text-blue-500 fill-current" />}
                                        </h3>
                                        <a href={`https://www.instagram.com/${selectedCompetitorDetail.username}/`} target="_blank" rel="noreferrer" className="text-primary-500 font-bold text-sm hover:underline flex items-center gap-1">
                                            @{selectedCompetitorDetail.username} <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedCompetitorDetail(null)} className="p-3 rounded-2xl bg-slate-800 text-slate-400 hover:text-white transition-all">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
                                {selectedCompetitorDetail.bio && (
                                    <p className="text-slate-300 text-sm font-medium bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
                                        {selectedCompetitorDetail.bio}
                                    </p>
                                )}

                                {/* Metrics Grid */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                                        <p className="text-[10px] font-black uppercase text-slate-500">Seguidores</p>
                                        <p className="text-xl font-black text-white">{(Number(selectedCompetitorDetail.stats?.followers) || 0).toLocaleString()}</p>
                                    </div>
                                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                                        <p className="text-[10px] font-black uppercase text-slate-500">Publicaciones</p>
                                        <p className="text-xl font-black text-white">{(Number(selectedCompetitorDetail.stats?.posts) || 0).toLocaleString()}</p>
                                    </div>
                                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center">
                                        <p className="text-[10px] font-black uppercase text-slate-500">Engagement</p>
                                        <p className="text-xl font-black text-emerald-400">{selectedCompetitorDetail.engagementRate || 0}%</p>
                                    </div>
                                </div>

                                {/* Posts List */}
                                <div>
                                    <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-4">Últimas Publicaciones</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        {(selectedCompetitorDetail.latestPosts || []).map((p: any, idx: number) => (
                                            <a key={idx} href={p.url || `https://www.instagram.com/p/${p.shortcode}/`} target="_blank" rel="noreferrer" className="group bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 hover:border-primary-500/50 transition-all">
                                                <div className="h-32 bg-slate-900 overflow-hidden">
                                                    <img src={p.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                </div>
                                                <div className="p-3 flex justify-between text-xs text-slate-400 font-bold">
                                                    <span>❤️ {p.likes || 0}</span>
                                                    <span>💬 {p.comments || 0}</span>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                                    <button
                                        onClick={() => {
                                            setCompetitors(competitors.filter(c => c !== `@${selectedCompetitorDetail.username}`))
                                            setCompetitorsData((competitorsData || []).filter((c: any) => c.username !== selectedCompetitorDetail.username))
                                            setSelectedCompetitorDetail(null)
                                        }}
                                        className="px-6 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-black text-xs transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" /> Eliminar Competidor
                                    </button>

                                    <button
                                        onClick={() => {
                                            const url = `https://www.instagram.com/${selectedCompetitorDetail.username}/?audit=true&target=competitor&mode=deep`
                                            chrome.tabs.create({ url, active: true })
                                        }}
                                        className="px-8 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black text-xs shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2"
                                    >
                                        <Zap className="w-4 h-4 fill-current" /> DEEP AUDIT
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



