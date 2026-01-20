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
    CheckCircle2, Circle, UserPlus, Trash2, AlertTriangle, Activity
} from "lucide-react"
import "../style.css"

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
    const [statsData] = useStorage({ key: "stats", instance: storage }, { follows: 0, likes: 0, dms: 0, unfollows: 0 })
    const [hashtags, setHashtags] = useStorage({ key: "targetHashtags", instance: storage }, ["#digitalart", "#photography"])
    const [competitors, setCompetitors] = useStorage({ key: "targetCompetitors", instance: storage }, ["@cristiano"])
    const [newTag, setNewTag] = useState("")
    const [newCompetitor, setNewCompetitor] = useState("")
    const [logs] = useStorage({ key: "logs", instance: storage }, [])
    const [followedUsers, setFollowedUsers] = useStorage({ key: "followedUsers", instance: storage }, [])

    // Configuración de módulos activos
    const [config, setConfig] = useStorage({ key: "botConfig", instance: storage }, {
        likeEnabled: true,
        followEnabled: false,
        dmEnabled: false,
        unfollowEnabled: false,
        sourceHashtags: true,
        sourceCompetitors: false,
        chaosEnabled: false
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
        chaosFreq: 30, chaosDur: 5
    })

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && newTag.trim()) {
            setHashtags([...hashtags, newTag.startsWith("#") ? newTag : `#${newTag}`])
            setNewTag("")
        }
    }

    const addCompetitor = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && newCompetitor.trim()) {
            setCompetitors([...competitors, newCompetitor.startsWith("@") ? newCompetitor : `@${newCompetitor}`])
            setNewCompetitor("")
        }
    }

    const clearDatabase = () => {
        if (window.confirm("¿Estás seguro de que quieres borrar el historial de follows?")) {
            setFollowedUsers([])
        }
    }

    const stats = [
        { label: "Total Follows", value: (statsData?.follows || 0).toLocaleString(), trend: "+12%", icon: Users, color: "text-blue-400" },
        { label: "Total Likes", value: (statsData?.likes || 0).toLocaleString(), trend: "+8%", icon: Heart, color: "text-rose-400" },
        { label: "Total Unfollows", value: (statsData?.unfollows || 0).toLocaleString(), trend: "Cleaning", icon: Trash2, color: "text-amber-400" },
        { label: "Total DMs", value: (statsData?.dms || 0).toLocaleString(), trend: "Stable", icon: MessageSquare, color: "text-emerald-400" },
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
                        { id: "targeting", label: "Strategy & Source", icon: Search },
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
                            {activeTab === 'targeting' && 'Operation Strategy'}
                            {activeTab === 'settings' && 'Latency Control'}
                            {activeTab === 'database' && 'Audience Database'}
                        </h2>
                        <p className="text-sm text-slate-500 font-medium">Real-time modular engine configuration.</p>
                    </div>
                    <div className="flex items-center gap-6">
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
                            <div className="grid grid-cols-4 gap-8">
                                {stats.map((stat, idx) => (
                                    <div key={idx} className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-[2.5rem] hover:border-primary-500/30 transition-all duration-500 group">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className={`p-4 rounded-2xl bg-slate-950 group-hover:scale-110 transition-transform duration-500 ${stat.color}`}>
                                                <stat.icon className="w-7 h-7" />
                                            </div>
                                            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest ${stat.trend.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                                                {stat.trend}
                                            </div>
                                        </div>
                                        <h3 className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-2">{stat.label}</h3>
                                        <p className="text-4xl font-black text-white tracking-tighter">{stat.value}</p>
                                    </div>
                                ))}
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
            </main >
        </div >
    )
}

export default Dashboard
