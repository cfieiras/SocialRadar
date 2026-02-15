import type { PlasmoCSConfig } from "plasmo"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
    matches: ["https://www.instagram.com/*"]
}

const storage = new Storage({
    area: "local"
})

interface BotStats {
    follows: number
    likes: number
    dms: number
    unfollows: number
}

interface LogEntry {
    time: string
    msg: string
    type: "success" | "info" | "warning" | "wait"
}

interface FollowedUser {
    username: string
    url: string
    timestamp: number
    dateStr: string
    protected?: boolean
}

class InstagramBot {
    private active: boolean = false
    private sessionStart = Date.now()
    private stats: BotStats = { follows: 0, likes: 0, dms: 0, unfollows: 0 }
    private logs: LogEntry[] = []
    private followedUsers: FollowedUser[] = []
    private processedHistory: string[] = []

    private sessionEngagedProfiles: Set<string> = new Set()
    private currentSessionActions: number = 0
    private sessionLikes: number = 0
    private sessionFollows: number = 0
    private capturedGraphQLData: any[] = []

    private config: any = {
        likeEnabled: true,
        followEnabled: false,
        dmEnabled: false,
        unfollowEnabled: false,
        sourceHashtags: true,
        sourceCompetitors: false,
        chaosEnabled: false,
        continuousSession: false
    }

    private delayConfig: any = {
        navMin: 10, navMax: 20,
        viewMin: 8, viewMax: 15,
        actionMin: 3, actionMax: 7,
        gridMin: 10, gridMax: 15,
        batchLimit: 15,
        batchPause: 720,
        unfollowDays: 3,
        unfollowMin: 10, unfollowMax: 20,
        chaosFreq: 30, chaosDur: 5,
        sessionLikeLimit: 100, sessionFollowLimit: 100
    }

    constructor() {
        this.init()
    }

    async init() {
        try {
            console.log("GrowthBot: Engine Started")

            // Listener para los datos interceptados por interceptor.ts
            window.addEventListener("message", (event) => {
                if (event.data.type === "SOCIAL_RADAR_GRAPHQL_DATA") {
                    this.capturedGraphQLData.push(event.data.payload)
                }
            })

            const [savedConfig, savedDelays, savedStats, savedLogs, savedFollows, savedHistory, savedHashtags, savedCompetitors] = await Promise.all([
                storage.get("botConfig"),
                storage.get("delays"),
                storage.get<BotStats>("stats"),
                storage.get<LogEntry[]>("logs"),
                storage.get<FollowedUser[]>("followedUsers"),
                storage.get<string[]>("processedHistory"),
                storage.get<string[]>("targetHashtags"),
                storage.get<string[]>("targetCompetitors")
            ])

            if (savedConfig) this.config = savedConfig
            if (savedDelays) this.delayConfig = savedDelays
            if (savedStats) this.stats = { ...this.stats, ...savedStats }
            if (savedLogs) this.logs = savedLogs
            if (savedFollows) this.followedUsers = savedFollows
            if (savedHistory) this.processedHistory = (savedHistory || []).map(h => h.toLowerCase())

            // Initialize defaults if missing
            if (!savedHashtags) await storage.set("targetHashtags", ["#digitalart", "#photography"])
            if (!savedCompetitors) await storage.set("targetCompetitors", ["@cristiano"])

            this.listenToToggles()

            // --- FORCED AUDIT CHECK ---
            // If the URL has ?audit=true, run the analysis even if the bot is not "Running"
            const isAudit = new URLSearchParams(window.location.search).get('audit') === 'true'
            if (isAudit) {
                this.addLog("⚡ Manual Audit Triggered. Intercepting Network...", "info")
                setTimeout(() => this.analyzeOwnProfile(), 2000)
            }
        } catch (e) { }
    }

    async listenToToggles() {
        const isRunning = await storage.get<boolean>("isRunning")
        this.active = !!isRunning
        if (this.active) {
            this.addLog("Bot initialized and running", "success")
            this.runLoop()
        }

        try {
            storage.watch({
                "isRunning": async (c) => {
                    const wasActive = this.active
                    this.active = !!c.newValue

                    if (this.active && !wasActive) {
                        this.addLog(">>> ENGINE LAUNCHED: Automation Online", "success")
                        const conf = await storage.get("botConfig")
                        const del = await storage.get("delays")
                        if (conf) this.config = conf
                        if (del) this.delayConfig = del
                        await storage.set("lastNavTime", 0)
                        await storage.set("botStartTime", Date.now())
                        this.currentSessionActions = 0
                        this.sessionLikes = 0
                        this.sessionFollows = 0
                        this.sessionEngagedProfiles.clear()
                        this.runLoop()
                    } else if (!this.active && wasActive) {
                        this.addLog("<<< ENGINE STOPPED: Automation Offline", "warning")
                        await storage.remove("botStartTime")
                    }
                },
                "botConfig": (c) => { if (c.newValue) this.config = c.newValue },
                "delays": (c) => { if (c.newValue) this.delayConfig = c.newValue }
            })
        } catch (e) {
            console.warn("GrowthBot: Extension context invalidated. Stopping watchers.")
            this.active = false
        }
    }

    private async addToHistory(url: string) {
        if (!url) return
        const cleanUrl = url.split('?')[0].replace(/\/$/, "").toLowerCase()
        if (!this.processedHistory.includes(cleanUrl)) {
            this.processedHistory = [cleanUrl, ...this.processedHistory].slice(0, 5000)
            await storage.set("processedHistory", this.processedHistory)
        }
    }

    private async saveFollowedTarget(username: string, url: string) {
        if (!username || username.trim() === "") return
        try {
            const entry: FollowedUser = {
                username: username.trim(),
                url: url.split('?')[0].replace(/\/$/, "").toLowerCase(),
                timestamp: Date.now(),
                dateStr: new Date().toLocaleDateString()
            }
            this.followedUsers = [entry, ...this.followedUsers].slice(0, 5000)
            await storage.set("followedUsers", this.followedUsers)
            this.addLog(`Capturing Audience: @${username}`, "info")
            await this.addToHistory(url)
            this.currentSessionActions++
        } catch (e) { }
    }

    // Check if we are on the login page
    private async checkSession(): Promise<boolean> {
        const url = window.location.href.toLowerCase()
        // If we are explicitly on /accounts/login/
        if (url.includes("/accounts/login")) return false

        // Check for common login elements regardless of URL
        const passwordInput = document.querySelector('input[name="password"]')
        const loginButton = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent?.toLowerCase().includes("log in") ||
            b.textContent?.toLowerCase().includes("iniciar sesión")
        )
        const usernameInput = document.querySelector('input[name="username"]')

        // If we see a login form, we are likely logged out
        if (passwordInput && usernameInput) return false

        return true
    }

    async addLog(msg: string, type: LogEntry["type"] = "info") {
        try {
            const newLog: LogEntry = {
                time: new Date().toLocaleTimeString(),
                msg,
                type
            }
            this.logs = [newLog, ...this.logs].slice(0, 50)
            await storage.set("logs", this.logs)
            console.log(`[GrowthBot] ${msg}`)
        } catch (e) { }
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private async randomSleep(type: 'nav' | 'view' | 'action' | 'grid' | 'unfollow') {
        const min = (this.delayConfig[`${type}Min`] || 5) * 1000
        const max = (this.delayConfig[`${type}Max`] || 15) * 1000
        const ms = Math.floor(Math.random() * (max - min + 1) + min)
        this.addLog(`Cooldown: ${Math.round(ms / 1000)}s`, "wait")
        return this.sleep(ms)
    }

    private _loopRunning = false

    async runLoop() {
        if (this._loopRunning) return
        this._loopRunning = true

        while (this.active) {
            try {
                const limit = this.delayConfig.batchLimit || 15
                if (this.currentSessionActions >= limit) {
                    const restTime = this.delayConfig.batchPause || 3600
                    this.addLog(`SECURITY PROTECTION: limit reached (${limit}). Resting ${restTime}s...`, "warning")
                    await this.sleep(restTime * 1000)
                    this.currentSessionActions = 0
                    continue
                }

                const url = window.location.href.toLowerCase()


                // --- CRITICAL SESSION CHECK ---
                const isSessionValid = await this.checkSession()
                if (!isSessionValid) {
                    this.addLog("CRITICAL: Instagram session lost. Bot stopped.", "warning")
                    this.active = false
                    await storage.set("isRunning", false)
                    await storage.remove("botStartTime")
                    this._loopRunning = false
                    return
                }

                const path = window.location.pathname.toLowerCase()

                if (!url.includes("instagram.com")) {
                    await this.sleep(5000)
                    continue
                }

                const dialog = document.querySelector('div[role="dialog"]')
                const modalHeader = (dialog?.querySelector('h1, h2, div') as HTMLElement)?.textContent || ""

                // --- CHAOTIC BEHAVIOR CHECK ---
                if (this.config.chaosEnabled) {
                    let lastChaos = await storage.get<number>("lastChaosTime") || 0

                    // If never run before, OR if we just started the script and a session is overdue (to prevent immediate run on startup)
                    // We check if script uptime is < 10 seconds (fresh start) and chaos is due.
                    const isOverdue = (Date.now() - lastChaos) > ((this.delayConfig.chaosFreq || 30) * 60 * 1000)
                    const isFreshStart = (Date.now() - this.sessionStart) < 10000

                    if (lastChaos === 0 || (isFreshStart && isOverdue)) {
                        this.addLog("⏳ Chaos timer reset to wait full cycle.", "wait")
                        lastChaos = Date.now()
                        await storage.set("lastChaosTime", lastChaos)
                    }

                    const freqMs = (this.delayConfig.chaosFreq || 30) * 60 * 1000

                    if (Date.now() - lastChaos > freqMs) {
                        // Mark as executed IMMEDIATELY to prevent loops if script reloads/crashes
                        await storage.set("lastChaosTime", Date.now())

                        await this.executeChaosRoutine()

                        // After chaos (or if stopped during chaos), we check active state
                        const stillRunning = await storage.get<boolean>("isRunning")
                        if (!stillRunning || !this.active) return

                        continue
                    }
                }

                if (dialog) {
                    if (modalHeader.includes("Followers") || modalHeader.includes("Seguidores")) {
                        await this.handleFollowersModal(dialog as HTMLElement)
                        continue // Skip grid sleep to speed up
                    } else if (path.includes("/p/") || path.includes("/reels/") || dialog.querySelector('article')) {
                        // It is a Post Modal (or post page with dialog wrapper)
                        await this.handlePostInteraction()
                        continue // Interaction handles its own sleep
                    }
                }
                else if (path.includes("/p/") || path.includes("/reels/")) {
                    await this.handlePostInteraction()
                    continue
                }
                else if (path.includes("/explore/tags/") || path.includes("/explore/search/")) {
                    await this.handleHashtagPage()
                }
                else if (path.split('/').filter(Boolean).length === 1 && !path.includes("explore")) {
                    // Try to scrape analytics if it's our profile
                    await this.analyzeOwnProfile()

                    const profileEngaged = await this.handleProfilePage()
                    // If an action was performed, we bypass the grid sleep and navigation delay once
                    if (profileEngaged === "DONE") {
                        this.addLog("Chain-Mission triggered: Moving to next immediately.", "success")
                        await storage.set("lastNavTime", 0)
                        await this.navigateToNextTarget()
                        // The page will reload, so this script cycle ends here
                        break
                    }
                }
                else {
                    const lastNav = await storage.get<number>("lastNavTime") || 0
                    const waitTime = (this.delayConfig.navMin || 90) * 1000
                    if (Date.now() - lastNav > waitTime) {
                        await this.navigateToNextTarget()
                    } else {
                        await this.sleep(3000)
                    }
                }

                if (this.active) await this.randomSleep('grid')
            } catch (err) {
                this.addLog(`Engine hiccup: ${err.message}`, "warning")
                await this.sleep(8000)
            }
        }
        this._loopRunning = false
    }

    async navigateToNextTarget() {
        const sources = []
        if (this.config.sourceHashtags) sources.push('hashtag')
        if (this.config.sourceCompetitors) sources.push('competitor')
        if (this.config.unfollowEnabled) sources.push('unfollow')

        if (sources.length === 0) {
            this.addLog("No active sources selected in Strategy. Waiting...", "warning")
            await this.sleep(10000)
            return
        }

        // Strategy: Iterate over sources until navigation is possible
        const shuffled = sources.sort(() => Math.random() - 0.5)
        const langParam = "hl=en"

        for (const choice of shuffled) {
            if (choice === 'hashtag') {
                const tags = await storage.get<string[]>("targetHashtags") || []
                if (tags.length === 0) {
                    this.addLog("Source 'Hashtags' enabled but list is empty.", "warning")
                    continue
                }
                const tag = tags[Math.floor(Math.random() * tags.length)].replace("#", "").trim()
                if (tag) {
                    this.addLog(`>>> Mission: Hashtag #${tag}`, "success")
                    await storage.set("lastNavTime", Date.now())
                    window.location.href = `https://www.instagram.com/explore/tags/${tag}/?${langParam}`
                    return
                }
            } else if (choice === 'competitor') {
                const comps = await storage.get<string[]>("targetCompetitors") || []
                if (comps.length === 0) {
                    this.addLog("Source 'Competitors' enabled but list is empty.", "warning")
                    continue
                }
                const comp = comps[Math.floor(Math.random() * comps.length)].replace("@", "").trim()
                if (comp) {
                    this.addLog(`>>> Mission: Competitor @${comp}`, "success")
                    await storage.set("lastNavTime", Date.now())
                    window.location.href = `https://www.instagram.com/${comp}/?${langParam}`
                    return
                }
            } else if (choice === 'unfollow') {
                const now = Date.now()
                const threshold = (this.delayConfig.unfollowDays || 3) * 86400 * 1000
                const candidates = [...this.followedUsers].reverse().filter(u => !u.protected && (now - u.timestamp) > threshold)

                if (candidates.length > 0) {
                    const target = candidates[0]
                    if (target && target.username) {
                        this.addLog(`>>> Mission: Unfollow @${target.username}`, "warning")
                        await storage.set("lastNavTime", Date.now())
                        window.location.href = `https://www.instagram.com/${target.username}/?${langParam}`
                        return
                    }
                } else {
                    this.addLog("No Unfollow targets ready (waiting for maturity days).", "info")
                }
            }
        }

        // If nothing was chosen, mission is complete. Check for continuous session mode
        if (this.config.continuousSession) {
            this.addLog("🔄 Sesión Continua activada. Reiniciando ciclo...", "success")
            
            // Show summary before continuing
            const summary = `✅ Ciclo completado:\n🔥 Likes: ${this.stats.likes}\n👥 Follows: ${this.stats.follows}\n👋 Unfollows: ${this.stats.unfollows}\n💬 DMs: ${this.stats.dms}\n\n🔄 Reiniciando sesión automáticamente...`
            this.addLog(summary.replace(/\n/g, " | "), "success")
            
            // Reset session counters for the new cycle
            this.currentSessionActions = 0
            this.sessionLikes = 0
            this.sessionFollows = 0
            this.sessionEngagedProfiles.clear()
            this.sessionStart = Date.now()
            
            // Save reset stats to storage
            await storage.set("botStartTime", Date.now())
            
            // Wait a moment before continuing
            await this.sleep(5000)
            
            // Navigate to start a new cycle
            await this.navigateToNextTarget()
            return
        }

        // If nothing was chosen and continuous mode is off, Auto-Stop.
        this.addLog("🛑 All tasks complete or lists empty. Engine stopping.", "warning")
        
        // Show summary before stopping
        const summary = `✅ Resumen del ciclo:\n🔥 Likes: ${this.stats.likes}\n👥 Follows: ${this.stats.follows}\n👋 Unfollows: ${this.stats.unfollows}\n💬 DMs: ${this.stats.dms}`
        alert(summary)
        
        await storage.set("isRunning", false)
        this.active = false

        window.location.href = `https://www.instagram.com/?${langParam}`
    }

    async handleProfilePage(): Promise<string | void> {
        // Wait for hydration/rendering to avoid "infinite reload" panic
        await this.sleep(3500)

        const user = window.location.pathname.replace(/\//g, "").toLowerCase()
        const isFollowedTarget = this.followedUsers.some(u => u.username.toLowerCase() === user && !u.protected)

        if (this.config.unfollowEnabled && isFollowedTarget) {
            this.addLog(`Processing Unfollow: @${user}...`, "info")

            // Improved 'Following' button detection logic
            const allButtons = Array.from(document.querySelectorAll('header button, main header button, div[role="button"]'))

            const interactionBtn = allButtons.find(b => {
                const text = (b as HTMLElement).innerText?.toLowerCase() || ""
                const label = b.getAttribute('aria-label')?.toLowerCase() || ""
                const svgTitle = b.querySelector('title')?.textContent?.toLowerCase() || ""

                // Keywords that indicate we are following this user
                const followingKeywords = ['following', 'siguiendo', 'requested', 'pendiente']
                const isMessage = text.includes('message') || text.includes('mensaje') || text.includes('contact')

                // Match by Text or Aria Label (using includes for safety against whitespace/icons)
                const matchesText = followingKeywords.some(k => text.includes(k) || label.includes(k))

                // Match by specific SVG icon (User with checkmark or arrow) usually present in "Following" button
                // This is a robust fallback if text is hidden or changes
                const hasFollowIcon = !!b.querySelector('svg[aria-label="Following"]') ||
                    !!b.querySelector('svg[aria-label="Siguiendo"]') ||
                    // Specific paths often used for "Following" icon (User w/ chevrons)
                    Array.from(b.querySelectorAll('path')).some(p => p.getAttribute('d')?.includes('M12.003 20.003'))

                return !isMessage && (matchesText || hasFollowIcon) && (b as HTMLElement).offsetHeight > 0
            }) as HTMLElement

            if (interactionBtn) {
                interactionBtn.scrollIntoView({ block: 'center' })
                await this.sleep(1500)
                await this.nativeClick(interactionBtn)

                let confirmed = false
                // Wait for dialog
                await this.sleep(1500)

                // Logic to find the "Confirm Unfollow" button (usually red or distinct)
                for (let i = 0; i < 5; i++) { // Increased retries
                    const dialog = document.querySelector('div[role="dialog"]')
                    if (dialog) {
                        // Search for BUTTONS, DIVS or SPANS acting as buttons
                        const candidates = Array.from(dialog.querySelectorAll('button, div[role="button"], span[role="button"], span'))

                        const confirmBtn = candidates.find(el => {
                            // Check for exact text match first
                            const t = el.textContent?.toLowerCase().trim() || ""
                            return t === 'unfollow' || t === 'dejar de seguir'
                        })

                        if (confirmBtn) {
                            await this.nativeClick(confirmBtn as HTMLElement)
                            confirmed = true
                            break
                        }
                    }
                    await this.sleep(800)
                }

                await this.sleep(3000)

                // VERIFICATION: Check if button changed to "Follow"
                const checkBtn = Array.from(document.querySelectorAll('header button, main header button')).find(b => {
                    const t = b.textContent?.toLowerCase() || ""
                    return (t === 'follow' || t === 'seguir') && (b as HTMLElement).offsetHeight > 0
                })

                if (checkBtn) {
                    this.stats.unfollows++
                    await storage.set("stats", this.stats)
                    this.followedUsers = this.followedUsers.filter(u => u.username.toLowerCase() !== user)
                    await storage.set("followedUsers", this.followedUsers)
                    this.addLog(`>>> SUCCESS: @${user} unfollowed.`, "success")
                    await this.randomSleep('unfollow')
                    return "DONE"
                } else {
                    this.addLog(`Failed to verify unfollow for @${user}. Retrying next time.`, "warning")
                    // If failed, we don't remove from list yet, so it tries again later
                    return "DONE"
                }
            } else {
                // If we can't find the 'Following' button, maybe we are not following them?
                const isFollowBtn = document.querySelector('button')?.textContent?.toLowerCase() === 'follow'
                if (isFollowBtn) {
                    // Already unfollowed
                    this.followedUsers = this.followedUsers.filter(u => u.username.toLowerCase() !== user)
                    await storage.set("followedUsers", this.followedUsers)
                    return "DONE"
                }
                this.addLog(`Could not find Unfollow button for @${user}`, "warning")
                return "DONE"
            }
        }

        // Prospecting logic
        const comps = await storage.get<string[]>("targetCompetitors") || []
        const isCompetitor = comps.some(c => c.replace("@", "").toLowerCase() === user)

        if (isCompetitor) {
            this.addLog(`At Competitor Profile: @${user}`, "info")
            const flwLink = Array.from(document.querySelectorAll('a')).find(a => a.href.includes('/followers/'))
            if (flwLink) { flwLink.click(); await this.sleep(5000) }
            return
        } else {
            const cleanUrl = window.location.href.split('?')[0].replace(/\/$/, "").toLowerCase()
            const inHistory = this.processedHistory.includes(cleanUrl)
            const sessionDone = this.sessionEngagedProfiles.has(cleanUrl)

            if (sessionDone) {
                window.history.back(); await this.sleep(4000)
            } else if (inHistory) {
                const post = document.querySelector('article a[href*="/p/"], main a[href*="/p/"]')
                if (post) { (post as HTMLElement).click(); await this.sleep(4000) }
                else {
                    if (this.config.followEnabled) {
                        const btn = Array.from(document.querySelectorAll('header button, main header button')).find(b => {
                            const t = b.textContent?.toLowerCase() || ""
                            return t === 'follow' || t === 'seguir'
                        })
                        if (btn) {
                            (btn as HTMLElement).click()
                            this.stats.follows++
                            await storage.set("stats", this.stats)
                            await this.saveFollowedTarget(user, cleanUrl)
                        }
                    }
                    this.sessionEngagedProfiles.add(cleanUrl)
                    window.history.back(); await this.sleep(4000)
                }
            }
        }
    }

    async handleHashtagPage() {
        const posts = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reels/"]')) as HTMLAnchorElement[]
        const fresh = posts.filter(p => !p.getAttribute('href')?.startsWith("/explore/") && !this.processedHistory.includes(p.href.split('?')[0].replace(/\/$/, "").toLowerCase()))

        if (fresh.length > 0) {
            const target = fresh[0]
            await this.addToHistory(target.href)
            target.click(); await this.sleep(4000)
        } else {
            window.scrollBy({ top: 1000, behavior: 'smooth' }); await this.sleep(3000)
        }
    }

    async handleFollowersModal(modal: HTMLElement) {
        const userLinks = Array.from(modal.querySelectorAll('a[role="link"]')) as HTMLAnchorElement[]
        const fresh = userLinks.filter(l => l.href.includes("instagram.com/") && !this.processedHistory.includes(l.href.split('?')[0].replace(/\/$/, "").toLowerCase()) && l.textContent?.trim())

        if (fresh.length > 0) {
            const v = fresh[0]
            await this.addToHistory(v.href)
            v.click(); await this.sleep(5000)
        } else {
            const scroller = modal.querySelector('div[style*="overflow-y: auto"], ._aano')
            if (scroller) scroller.scrollBy(0, 600)
            else {
                const items = modal.querySelectorAll('li')
                if (items.length > 0) items[items.length - 1].scrollIntoView()
            }
            await this.sleep(4000)
        }
    }

    async handlePostInteraction() {
        let interacted = false

        // 1. Identify context (Modal vs Page)
        const dialog = document.querySelector('div[role="dialog"]')
        const container = dialog || document.querySelector('article') || document

        // 2. Find Profile Info
        // Prefer anchors in header that actually have text (Username), ignoring empty avatars
        const allLinks = Array.from(container.querySelectorAll('header a')) as HTMLAnchorElement[]
        const profileLink = allLinks.find(a => a.innerText?.trim().length > 1)
            || container.querySelector('div > a[href*="/"]') as HTMLAnchorElement

        const profileName = profileLink?.textContent?.trim() || ""
        const profileUrl = profileLink?.href?.split('?')[0].replace(/\/$/, "").toLowerCase() || ""

        if (this.config.likeEnabled) {
            // Check Session Limits
            if (this.sessionLikes >= (this.delayConfig.sessionLikeLimit || 100)) {
                this.addLog("Daily Like Limit reached! Skipping like.", "warning")
            } else {
                // Updated Like Selector
                const heart = Array.from(container.querySelectorAll('svg')).find(s => {
                    const h = s.innerHTML || ""
                    const p = s.querySelector('path')?.getAttribute('d') || ""
                    const label = (s.getAttribute('aria-label') || "").toLowerCase()

                    return h.includes('M16.792') || h.includes('M34.6') || h.includes('M47.5') ||
                        p.includes('M47.5') || p.includes('M16.792') ||
                        label === 'like' || label === 'me gusta'
                })

                if (heart) {
                    const btn = heart.closest('button') || heart.parentElement as HTMLElement
                    const isLiked = btn.querySelector('svg[fill="#ed4956"]') ||
                        btn.querySelector('svg[color="#ed4956"]') ||
                        (btn.querySelector('svg[aria-label]')?.getAttribute('aria-label') === 'Unlike') ||
                        (btn.querySelector('svg[aria-label]')?.getAttribute('aria-label') === 'Ya no me gusta')

                    if (!isLiked) {
                        btn.click()
                        this.stats.likes++
                        this.sessionLikes++
                        await storage.set("stats", this.stats)
                        interacted = true
                    }
                }
            }
        }

        if (this.config.followEnabled) {
            if (this.sessionFollows >= (this.delayConfig.sessionFollowLimit || 100)) {
                this.addLog("Daily Follow Limit reached! Skipping follow.", "warning")
            } else {
                const btns = Array.from(container.querySelectorAll('button'))
                const btn = btns.find(b => {
                    const t = (b.textContent?.toLowerCase() || "").trim()
                    const label = (b.getAttribute('aria-label')?.toLowerCase() || "")
                    return (t === 'follow' || t === 'seguir') || (label === 'follow' || label === 'seguir')
                })

                if (btn) {
                    (btn as HTMLElement).click()
                    this.stats.follows++
                    this.sessionFollows++
                    await storage.set("stats", this.stats)
                    if (profileName && profileUrl) await this.saveFollowedTarget(profileName, profileUrl)
                    interacted = true
                }
            }
        }

        if (interacted) {
            this.currentSessionActions++
            if (profileUrl) this.sessionEngagedProfiles.add(profileUrl)
            await this.randomSleep('action')
        } else {
            // Fast skip if already engaged to avoid "Cooldown Loop"
            this.addLog("Already interacted. Skipping...", "info")
            await this.sleep(2000)
        }

        // Robust Closing Logic
        const closeSelectors = [
            'svg[aria-label="Close"]', 'svg[aria-label="Cerrar"]',
            'svg[aria-label="Back"]', 'svg[aria-label="Volver"]',
            'div[role="dialog"] ._abl-'
        ]

        let closeBtn = null
        for (const s of closeSelectors) {
            const el = document.querySelector(s)
            if (el) {
                closeBtn = el.closest('button') || el.closest('div[role="button"]')
                if (closeBtn) break
            }
        }

        if (closeBtn) {
            (closeBtn as HTMLElement).click();
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
        }

        await this.sleep(1500)

        // Safety fallback: Force Exit if stuck
        if (window.location.pathname.includes('/p/') || window.location.pathname.includes('/reels/')) {
            this.addLog("Post didn't close normally. Retrying exit...", "warning")
            window.history.back()
            await this.sleep(2500)

            // Double check - if STILL stuck, force home to break the loop
            if (window.location.pathname.includes('/p/') || window.location.pathname.includes('/reels/')) {
                this.addLog("Critical: Stuck in post loop. Forcing Home refresh.", "warning")
                window.location.href = "https://www.instagram.com/?variant=force_home"
            }
        }
    }

    private async nativeClick(el: HTMLElement) {
        if (!el) return
        const opts = { bubbles: true, cancelable: true, view: window }
        el.dispatchEvent(new MouseEvent('mousedown', opts))
        await this.sleep(100)
        el.dispatchEvent(new MouseEvent('mouseup', opts))
        el.dispatchEvent(new MouseEvent('click', opts))
    }

    async executeChaosRoutine() {
        this.addLog("⚡ ENTERING HUMANIZATION MODE: Chaotic Behavior Active", "warning")

        // 1. Ensure we are on Feed
        if (!window.location.pathname.match(/^\/$/)) {
            window.location.href = "https://www.instagram.com/"
            return // Will reload and restart script, effectively starting chaos on next run check relative to time
        }

        const durationMs = (this.delayConfig.chaosDur || 5) * 60 * 1000
        const endTime = Date.now() + durationMs
        let nextScroll = Date.now()

        while (Date.now() < endTime && this.active) {
            // Check if user stopped the bot from UI
            const isRun = await storage.get<boolean>("isRunning")
            if (!isRun) {
                this.active = false
                this.addLog("🛑 Bot stopped manually during Chaos Mode.", "warning")
                return // Exit immediately, DO NOT reload
            }

            // Random Scroll Behavior
            if (Date.now() > nextScroll) {
                const scrollAmount = Math.floor(Math.random() * 800) + 200
                const direction = Math.random() > 0.8 ? -1 : 1 // Mostly down, sometimes up

                window.scrollBy({ top: scrollAmount * direction, behavior: 'smooth' })

                nextScroll = Date.now() + (Math.random() * 5000 + 2000) // Wait 2-7s between scrolls
            }

            // Random tiny pauses
            await this.sleep(1000)
        }

        // Only reload if we finished naturally (time expired) and weren't stopped
        if (this.active) {
            this.addLog("⚡ HUMANIZATION COMPLETE: Resuming operations.", "success")
            window.location.reload()
        }
    }

    // --- NUEVO SISTEMA DE AUDITORÍA PROFESIONAL ---
    private async analyzeOwnProfile() {
        try {
            const params = new URLSearchParams(window.location.search)
            const mode = params.get('mode') || 'deep'
            const isCompetitor = params.get('target') === 'competitor'

            // Only require edit button for personal account deep audits
            const editBtn = Array.from(document.querySelectorAll('a, button')).find(el =>
                el.textContent?.toLowerCase().includes("edit profile") ||
                el.textContent?.toLowerCase().includes("editar perfil")
            )
            if (!editBtn && !isCompetitor && mode === 'deep') return

            this.addLog(`🔍 Audit Mode (${mode.toUpperCase()}): Intercepting Metadata...`, "info")

            // RESET: Limpiamos los datos capturados anteriormente para que solo cuenten los de esta auditoría
            this.capturedGraphQLData = []

            // 1. Trigger Network requests (Skip scroll if QUICK)
            if (mode === 'deep') {
                this.addLog("Scrolling to trigger post load (DEEP AUDIT)...", "info")
                window.focus()
                window.scrollTo({ top: 800, behavior: 'smooth' })
                await this.sleep(3000)
                window.scrollTo({ top: 1600, behavior: 'smooth' })
                await this.sleep(3000)
                window.scrollTo({ top: 0, behavior: 'smooth' })
                await this.sleep(2000)
            } else {
                this.addLog("Performing Quick Header Scan...", "info")
                await this.sleep(2500) // Minimal wait for initial packets and header
            }

            let latestPosts = []
            let totalInteractions = 0

            // 2. Procesamos todos los datos capturados durante el scroll (o carga inicial)
            this.addLog(`Captured ${this.capturedGraphQLData.length} network packets. Analyzing...`, "info")
            if (this.capturedGraphQLData.length === 0 && mode === 'quick') {
                this.addLog("No networking data yet, attempting last-second header wait...", "info")
                await this.sleep(1500)
            }

            // El interceptor ahora guarda los posts procesados en cada mensaje, 
            // recolectamos los únicos de todas las capturas
            const uniquePosts = new Map()
            let interceptedUser = null

            for (const bundle of this.capturedGraphQLData) {
                // New structure: { posts: [], user: {} }
                const postsArr = bundle?.posts || []
                if (bundle?.user && !interceptedUser) interceptedUser = bundle.user

                postsArr.forEach(p => {
                    if (p.id) uniquePosts.set(p.id, p)
                })
            }

            let capturedPosts = Array.from(uniquePosts.values())

            // Sort by newest and limit to 12 (as requested: "cuente hasta 12 posts")
            capturedPosts.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
            latestPosts = capturedPosts.slice(0, 12)

            for (const p of latestPosts) {
                totalInteractions += (p.likes + p.comments)
            }

            // Fallback: If network capture failed, use the Lite Embed method as backup
            if (latestPosts.length === 0) {
                this.addLog("Network capture empty, falling back to Lite Scraper...", "warning")
                const postElements = Array.from(document.querySelectorAll('article a[href*="/p/"], article a[href*="/reels/"]')).slice(0, 12)
                const shortcodes = postElements.map(el => el.getAttribute('href')?.split('/p/')[1]?.replace(/\//g, '')).filter(Boolean)

                for (let i = 0; i < shortcodes.length; i++) {
                    try {
                        const res = await fetch(`https://www.instagram.com/p/${shortcodes[i]}/embed/captioned/`)
                        const html = await res.text()
                        const likesMatch = html.match(/([\d.,KMB]+)\s+(likes|me gusta)/i)
                        const commentsMatch = html.match(/([\d.,KMB]+)\s+(comments|comentarios)/i)
                        const l = this.parseAbbreviatedNumber(likesMatch ? likesMatch[1] : "0")
                        const c = this.parseAbbreviatedNumber(commentsMatch ? commentsMatch[1] : "0")
                        if (latestPosts.length < 12) { // Ensure we don't exceed 12 in fallback either
                            latestPosts.push({ id: shortcodes[i], likes: l, comments: c })
                            totalInteractions += (l + c)
                        }
                    } catch (e) { }
                }
            }

            // 3. Final Metadata Scavenging (LATE GATHERING)
            // We do this AFTER the post analysis to ensure the page is fully loaded and intercepted
            this.addLog("Finalizing profile metadata and latest stats...", "info")
            let header = document.querySelector('header')
            let scrapeRetries = 0
            while (!header && scrapeRetries < 5) {
                this.addLog("Waiting for profile header to render...", "info")
                await this.sleep(1500)
                header = document.querySelector('header')
                scrapeRetries++
            }

            const username = header?.querySelector('h2, h1')?.textContent?.trim() ||
                window.location.pathname.replace(/\//g, '') || "unknown"

            let baseStats = {}
            if (isCompetitor) {
                const currentCompsData = await storage.get<any[]>("competitorsData") || []
                baseStats = currentCompsData.find(c => c.username === username) || {}
            } else {
                baseStats = await storage.get<any>("currentUserStats") || {}
            }
            const existingStats: any = baseStats
            const avatarUrl = header?.querySelector('img')?.src || ""

            const parseStatText = (item: Element) => {
                const span = item.querySelector('span, a span, div span') || item;
                const title = span?.getAttribute('title');
                if (title) return title.replace(/[,.]/g, '');

                // Extraer el texto crudo y limpiar cualquier cosa que no sea número o abreviatura
                const rawText = span?.textContent?.trim() || item.textContent?.trim() || "0";

                // Si el texto es puramente un número (ej: "1234"), devolverlo
                if (/^\d+$/.test(rawText.replace(/[,.]/g, ''))) return rawText.replace(/[,.]/g, '');

                // Busca números seguidos opcionalmente de K o M (ej: 1,234, 1.5M, 500K)
                const match = rawText.match(/[\d,.]+[KkMm]?/);
                return match ? match[0] : "0";
            }

            // Scraping more robustly from DOM
            const domFullName = header?.querySelector('section h1, section h2, section > div:first-child')?.textContent?.trim() ||
                header?.querySelector('span.x1lliihq')?.textContent?.trim() || ""

            // Bio is usually a div/span below the stats and name
            const domBio = header?.querySelector('section > div:last-child h1')?.parentElement?.nextElementSibling?.textContent?.trim() ||
                header?.querySelector('section > div:nth-child(3) span')?.textContent?.trim() ||
                header?.querySelector('h1')?.parentElement?.parentElement?.nextElementSibling?.querySelector('span')?.textContent?.trim() || ""

            // Use intercepted user data if available, otherwise fallback to DOM
            // If in DEEP mode, we PRESERVE existing metadata as per requirement
            const finalFullName = (mode === 'deep' && existingStats.fullName) ? existingStats.fullName : (interceptedUser?.full_name || interceptedUser?.fullName || domFullName || existingStats.fullName || username)
            const finalAvatarUrl = (mode === 'deep' && existingStats.avatarUrl) ? existingStats.avatarUrl : (interceptedUser?.profile_pic_url || interceptedUser?.profilePicUrl || avatarUrl || existingStats.avatarUrl)
            const finalBio = (mode === 'deep' && existingStats.bio) ? existingStats.bio : (interceptedUser?.biography || interceptedUser?.bio || domBio || existingStats.bio || "")
            const finalIsVerified = (mode === 'deep' && existingStats.isVerified !== undefined) ? existingStats.isVerified : (interceptedUser?.is_verified ?? (header?.querySelector('svg[aria-label="Verified"]') ? true : (existingStats.isVerified ?? false)))

            // 3.1. Extract Stats (GraphQL Prioritized)
            const interceptedFollowers = interceptedUser?.edge_followed_by?.count || interceptedUser?.follower_count || interceptedUser?.followers_count || 0
            const interceptedFollowing = interceptedUser?.edge_follow?.count || interceptedUser?.following_count || 0
            const interceptedPosts = interceptedUser?.edge_owner_to_timeline_media?.count || interceptedUser?.media_count || 0

            // Scraping current totals from header for fallbacks and trust calculation
            let statsItems = Array.from(header?.querySelectorAll('ul li, header section ul li') || [])
            if (statsItems.length === 0) {
                // Fallback: a veces son spans con texto "Followers" cerca
                statsItems = Array.from(header?.querySelectorAll('section div div span, section ul li') || [])
            }

            // Map stats by keywords to avoid order issues
            let scavengedPosts = "0", scavengedFollowers = "0", scavengedFollowing = "0"
            statsItems.forEach(item => {
                const text = item.textContent?.toLowerCase() || ""
                if (text.includes("post")) scavengedPosts = parseStatText(item)
                else if (text.includes("follower")) scavengedFollowers = parseStatText(item)
                else if (text.includes("following")) scavengedFollowing = parseStatText(item)
            })

            const totalPostsCurrent = interceptedPosts ? interceptedPosts.toString() : (scavengedPosts !== "0" ? scavengedPosts : (statsItems[0] ? parseStatText(statsItems[0]) : "0"))
            const followersCurrent = interceptedFollowers ? interceptedFollowers.toString() : (scavengedFollowers !== "0" ? scavengedFollowers : (statsItems[1] ? parseStatText(statsItems[1]) : "0"))
            const followingCurrent = interceptedFollowing ? interceptedFollowing.toString() : (scavengedFollowing !== "0" ? scavengedFollowing : (statsItems[2] ? parseStatText(statsItems[2]) : "0"))

            this.addLog(`📊 Data Results: Posts=${totalPostsCurrent}, Followers=${followersCurrent}`, "success")

            const profileData = {
                ...existingStats,
                username,
                fullName: finalFullName,
                avatarUrl: finalAvatarUrl,
                bio: finalBio,
                isVerified: finalIsVerified,
                stats: {
                    ...existingStats.stats,
                    // Conservative update: Preserve only if new is "0" and old is valid.
                    // Also respect the "mode === deep" requirement to not update stats unless they are currently missing.
                    posts: (mode === 'deep' && existingStats.stats?.posts && existingStats.stats?.posts !== "0")
                        ? existingStats.stats.posts
                        : (totalPostsCurrent !== "0" ? this.parseAbbreviatedNumber(totalPostsCurrent).toString() : (existingStats.stats?.posts || "0")),

                    followers: (mode === 'deep' && existingStats.stats?.followers && existingStats.stats?.followers !== "0")
                        ? existingStats.stats.followers
                        : (followersCurrent !== "0" ? this.parseAbbreviatedNumber(followersCurrent).toString() : (existingStats.stats?.followers || "0")),

                    following: (mode === 'deep' && existingStats.stats?.following && existingStats.stats?.following !== "0")
                        ? existingStats.stats.following
                        : (followingCurrent !== "0" ? this.parseAbbreviatedNumber(followingCurrent).toString() : (existingStats.stats?.following || "0"))
                },
                timestamp: Date.now(),
                latestPosts: latestPosts // Sample of up to 12 for performance analysis
            }

            // 4. Calculate Engagement
            let engagementRate = 0
            if (latestPosts.length > 0) {
                const flwrsStr = followersCurrent !== "0" ? followersCurrent : (existingStats.stats?.followers || "0")
                const flwrs = this.parseAbbreviatedNumber(flwrsStr)
                engagementRate = ((totalInteractions / latestPosts.length) / (flwrs || 1)) * 100
            }

            // 4.5. Calculate Account Trust Score
            const followers = this.parseAbbreviatedNumber(followersCurrent !== "0" ? followersCurrent : (existingStats.stats?.followers || "0"))
            const following = this.parseAbbreviatedNumber(followingCurrent !== "0" ? followingCurrent : (existingStats.stats?.following || "0"))
            // Use the actual total posts for the trust score factor, not the capped 12
            const posts = this.parseAbbreviatedNumber(totalPostsCurrent !== "0" ? totalPostsCurrent : (existingStats.stats?.posts || "0"))

            let trustScore = 50 // Base score

            // Factor 1: Engagement (Max +25)
            if (engagementRate > 5) trustScore += 25
            else if (engagementRate > 3) trustScore += 15
            else if (engagementRate > 1) trustScore += 5

            // Factor 2: Ratio (Max +15)
            const ratio = following > 0 ? followers / following : 0
            if (ratio > 2) trustScore += 15
            else if (ratio > 1) trustScore += 10
            else if (ratio > 0.5) trustScore += 5
            else trustScore -= 10 // Malus for poor ratio

            // Factor 3: Activity (Max +10)
            if (posts > 100) trustScore += 10
            else if (posts > 50) trustScore += 5

            trustScore = Math.min(100, Math.max(0, trustScore))

            // 5. Save and Close
            // No need to redeclare isCompetitor here

            if (isCompetitor) {
                const currentCompsData = await storage.get<any[]>("competitorsData") || []
                const compIndex = currentCompsData.findIndex(c => c.username === username)

                const newData = {
                    ...profileData,
                    engagementRate: Number(engagementRate.toFixed(2)),
                    trustScore: trustScore,
                    totalLikesCaptured: totalInteractions,
                    analyzedPostsCount: latestPosts.length
                }

                if (compIndex > -1) {
                    currentCompsData[compIndex] = newData
                } else {
                    currentCompsData.push(newData)
                }
                await storage.set("competitorsData", currentCompsData)
            } else {
                await storage.set("currentUserStats", {
                    ...profileData,
                    engagementRate: Number(engagementRate.toFixed(2)),
                    trustScore: trustScore,
                    totalLikesCaptured: totalInteractions, // Store for the modal
                    analyzedPostsCount: latestPosts.length
                })
            }

            this.addLog(`✅ Audit Complete: ${latestPosts.length} posts. ER: ${engagementRate.toFixed(2)}%`, "success")

            if (new URLSearchParams(window.location.search).get('audit') === 'true') {
                await this.sleep(2000)
                window.close()
            }

            this.sessionEngagedProfiles.add("MY_PROFILE_STATS")
        } catch (e) {
            if (e.message?.includes("Extension context invalidated")) {
                this.active = false
                return
            }
            this.addLog("Analytics Error: " + e.message, "warning")
        }
    }

    private parseAbbreviatedNumber(str: any): number {
        if (str === null || str === undefined) return 0

        // Convert to string in case it's already a number
        const stringVal = String(str).toUpperCase().replace(/[,]/g, '').trim()

        if (!stringVal) return 0

        let num = parseFloat(stringVal)
        if (stringVal.includes('K')) num *= 1000
        if (stringVal.includes('M')) num *= 1000000
        return Math.floor(num) || 0
    }
}

new InstagramBot()
