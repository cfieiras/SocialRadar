import type { PlasmoCSConfig } from "plasmo"
import { Storage } from "@plasmohq/storage"
import { detectActiveUsername, extractBestAvatarUrl, fetchAudienceDatabaseFromSupabase, storeCurrentUserProfile, syncAudienceDatabaseToSupabase, fetchInteractionHistoryFromSupabase, syncInteractionHistoryToSupabase, fetchAccountSettingsFromSupabase, syncAccountSettingsToSupabase } from "../lib/instagramApi"

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

export interface LastSessionReport {
    startTime: number
    endTime: number
    durationStr: string
    actions: {
        follows: number
        likes: number
        dms: number
        unfollows: number
    }
    stopReason: string
}

export interface InteractionRecord {
    id: string
    username: string
    action: "follow" | "unfollow" | "like" | "comment"
    timestamp: number
    dateStr: string
    timeStr: string
    url?: string
    details?: string
}

interface FollowedUser {
    username: string
    url: string
    timestamp: number
    dateStr: string
    protected?: boolean
    unfollowFailed?: boolean // Tracks if we couldn't unfollow (e.g. button hidden/error)
}

interface HealthMetrics {
    lastHeartbeat: number
    lastAction: string
    lastActionAt: number
    errorCount: number
    lastError: string
    lastErrorAt: number
}

class InstagramBot {
    private active: boolean = false
    private sessionStart = Date.now()
    private stats: BotStats = { follows: 0, likes: 0, dms: 0, unfollows: 0 }
    private logs: LogEntry[] = []
    private followedUsers: FollowedUser[] = []
    private interactionHistory: InteractionRecord[] = []
    private processedHistory: string[] = []

    private postInteractions: any = { likers: true, commenters: false }
    private postTargetQueue: string[] = []
    private expectingLikersModal: boolean = false
    private nextAccountToRotate: string = ""
    private isSwitchingAccount: boolean = false

    private activeUsername: string = "global"

    private pKey(key: string): string {
        // Only prefix account-specific data
        const accountSpecific = [
            "botConfig", "delays", "stats", "logs", "followedUsers", "interactionHistory",
            "targetHashtags", "targetCompetitors", "competitorsData",
            "lastSessionReport", "followerHistory", "sessionLikes",
            "sessionFollows", "sessionUnfollows", "processedHistory",
            "targetPostUrls", "commentTemplates", "healthMetrics", "sessionComments",
            "sessionDayMarker", "postInteractions", "postTargetQueue"
        ]
        if (accountSpecific.includes(key)) {
            return `${this.activeUsername}_${key}`
        }
        return key
    }

    private escapeHtml(value: unknown): string {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
    }

    private sanitizeImageUrl(url: unknown): string {
        if (!url) return ""
        return String(url)
            .replace(/\\u0026/g, "&")
            .replace(/\\/g, "")
            .trim()
    }

    private extractHeaderAvatarUrl(header: Element | null): string {
        const selectors = [
            'header img[alt*="profile" i]',
            'header canvas + img',
            'header img[crossorigin="anonymous"]',
            'header img'
        ]

        for (const selector of selectors) {
            const src = (header?.querySelector(selector) as HTMLImageElement | null)?.src
            const sanitized = this.sanitizeImageUrl(src || "")
            if (sanitized) return sanitized
        }

        return ""
    }

    private async syncActiveUsername() {
        const stats = await storage.get<any>("currentUserStats")
        const storedUsername = stats?.username || await storage.get<string>("lastKnownUsername") || this.activeUsername || "global"
        let detectedUsername: string | null = null

        try {
            detectedUsername = await detectActiveUsername()
        } catch (error) {
            console.warn("SocialRadar: active username detection failed", error)
        }

        const newUsername = (detectedUsername || storedUsername || "global").toLowerCase()

        if (newUsername !== this.activeUsername) {
            console.log(`SocialRadar: Context Change -> ${this.activeUsername} to ${newUsername}`)
            this.activeUsername = newUsername
            return true
        }
        return false
    }

    private sessionEngagedProfiles: Set<string> = new Set()
    private currentMission: string = "Pending..."
    private currentSessionActions: number = 0
    private sessionLikes: number = 0
    private sessionFollows: number = 0
    private sessionUnfollows: number = 0
    private sessionComments: number = 0
    private capturedGraphQLData: any[] = []
    private runLoopAccountUsername: string = "global"
    private sessionDayMarker: string = ""

    private config: any = {
        likeEnabled: true,
        followEnabled: false,
        dmEnabled: false,
        unfollowEnabled: false,
        sourceHashtags: true,
        sourceCompetitors: false,
        sourcePosts: false,
        chaosEnabled: false,
        continuousSession: false,
        overlayEnabled: true,
        sleepEnabled: false,
        sleepStart: "23:00",
        sleepDuration: 8,
        onlyDeadAccountUnfollow: false
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
        sessionLikeLimit: 100, sessionFollowLimit: 100, sessionCommentLimit: 25,
        deadAccountDays: 45
    }

    constructor() {
        this.init()
    }

    private isInternalStop = false

    private resetTransientSessionState() {
        this.currentMission = "Pending..."
        this.currentSessionActions = 0
        this.sessionLikes = 0
        this.sessionFollows = 0
        this.sessionUnfollows = 0
        this.sessionComments = 0
        this.sessionEngagedProfiles.clear()
        this.capturedGraphQLData = []
    }

    private getSessionDayMarker() {
        return new Date().toDateString()
    }

    private async resetDailySessionCounters(reason: string) {
        const now = Date.now()
        this.sessionStart = now
        this.sessionDayMarker = this.getSessionDayMarker()
        this.resetTransientSessionState()

        await storage.set("botStartTime", now)
        await storage.set(this.pKey("sessionLikes"), 0)
        await storage.set(this.pKey("sessionFollows"), 0)
        await storage.set(this.pKey("sessionUnfollows"), 0)
        await storage.set(this.pKey("sessionComments"), 0)
        await storage.set(this.pKey("sessionDayMarker"), this.sessionDayMarker)
        await storage.remove(this.pKey("lastSessionReport"))

        this.addLog(reason, "info")
        this.updateStatusUI()
    }

    private async ensureDailySessionBoundary() {
        const today = this.getSessionDayMarker()
        if (!this.sessionDayMarker) {
            this.sessionDayMarker = (await storage.get<string>(this.pKey("sessionDayMarker"))) || today
        }
        if (this.sessionDayMarker !== today) {
            await this.resetDailySessionCounters("New day detected. Daily limits and session report reset.")
        }
    }

    private async handleAccountSwitch(newUsername: string, reason = "Instagram account changed during session") {
        const previousUsername = this.activeUsername
        if (this.active && this.runLoopAccountUsername && previousUsername !== newUsername) {
            await this.stopBot(reason)
        }
        this.activeUsername = newUsername
        this.runLoopAccountUsername = newUsername
        await this.syncDataForAccount()
    }

    private async verifyRunContext(): Promise<boolean> {
        const contextChanged = await this.syncActiveUsername()
        if (contextChanged && this.active && this.runLoopAccountUsername && this.activeUsername !== this.runLoopAccountUsername) {
            await this.stopBot(`Instagram account changed: @${this.runLoopAccountUsername} -> @${this.activeUsername}`)
            return false
        }
        return true
    }

    private async stopBot(reason: string) {
        this.isInternalStop = true
        await this.generateReport(reason)

        const multiAccountEnabled = await storage.get<boolean>("multiAccountEnabled")
        const isManualStop = reason.toLowerCase().includes("manual") || reason.toLowerCase().includes("logout") || reason.toLowerCase().includes("session lost")
        if (multiAccountEnabled && !isManualStop) {
            const multiAccounts = await storage.get<{username: string, password: string}[]>("multiAccounts") || []
            if (multiAccounts.length > 0) {
                const currentIndex = multiAccounts.findIndex(a => a.username.toLowerCase() === this.activeUsername.toLowerCase())
                let nextAccount = ""
                if (currentIndex !== -1 && currentIndex < multiAccounts.length - 1) {
                    nextAccount = multiAccounts[currentIndex + 1].username
                } else if (multiAccounts.length > 0 && multiAccounts[0].username.toLowerCase() !== this.activeUsername.toLowerCase()) {
                    nextAccount = multiAccounts[0].username
                }

                if (nextAccount && nextAccount.toLowerCase() !== this.activeUsername.toLowerCase()) {
                    this.addLog(`🔄 Multi-Account Rotation: Session ended (@${this.activeUsername}). Rotating to @${nextAccount}...`, "warning")
                    this.isSwitchingAccount = true
                    this.active = false
                    this._loopRunning = false

                    // Ensure isRunning stays true so the bot auto-starts on the next account!
                    await storage.set("isRunning", true)
                    await this.sleep(2000)
                    await this.executeAccountSwitch(nextAccount)
                    return
                }
            }
        }

        await storage.set("isRunning", false)
        this.active = false
        this._loopRunning = false
    }

    private simulateClick(el: HTMLElement) {
        try {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
            el.click()
        } catch (e) {
            el.click()
        }
    }

    private async executeAccountSwitch(nextUsername: string) {
        const cleanTarget = nextUsername.replace("@", "").trim().toLowerCase()
        this.addLog(`Starting UI account switch to @${cleanTarget}...`, "info")

        if (window.location.pathname !== '/') {
            window.location.href = `/?switch_account=${cleanTarget}`
            return
        }

        await this.sleep(2000)

        // Step 1: Find "Más" / "Configuración" menu button
        const findMoreMenuBtn = (): HTMLElement | null => {
            const svgs = Array.from(document.querySelectorAll('svg'))
            for (const svg of svgs) {
                const label = (svg.getAttribute('aria-label') || '').toLowerCase()
                const title = (svg.querySelector('title')?.textContent || '').toLowerCase()
                if (label.includes('configuraci') || label.includes('más') || label.includes('more') || label.includes('settings') || label.includes('menú') ||
                    title.includes('configuraci') || title.includes('más') || title.includes('more') || title.includes('settings') || title.includes('menú')) {
                    return (svg.closest('a, [role="button"], div[tabindex="0"], button') || svg.parentElement) as HTMLElement
                }
                const lines = svg.querySelectorAll('line')
                if (lines.length >= 3) {
                    return (svg.closest('a, [role="button"], div[tabindex="0"], button') || svg.parentElement) as HTMLElement
                }
            }
            const textEls = Array.from(document.querySelectorAll('span, a, div')).filter(el => {
                const txt = el.textContent?.trim().toLowerCase() || ""
                return txt === 'más' || txt === 'more' || txt === 'configuración' || txt === 'settings'
            })
            if (textEls.length > 0) {
                const best = textEls[textEls.length - 1]
                return (best.closest('a, [role="button"], div[tabindex="0"], button') || best) as HTMLElement
            }
            return null
        }

        // Step 2: Find strictly "Cambiar de cuenta" option (NOT "Cerrar sesión")
        const findSwitchOption = (): HTMLElement | null => {
            const elements = Array.from(document.querySelectorAll('span, div, a, button'))
            for (const el of elements) {
                const txt = el.textContent?.trim().toLowerCase() || ""
                if (txt === "cambiar de cuenta" || txt === "cambiar cuenta" || txt === "switch account" || txt === "switch accounts") {
                    if (!txt.includes("cerrar") && !txt.includes("logout") && !txt.includes("log out") && !txt.includes("salir")) {
                        return (el.closest('a, [role="button"], div[tabindex="0"], div.html-div, button') || el) as HTMLElement
                    }
                }
            }
            return null
        }

        let switchOption = findSwitchOption()

        if (!switchOption) {
            const moreBtn = findMoreMenuBtn()
            if (moreBtn) {
                this.addLog("Clicking 'Más' / 'Configuración' menu...", "info")
                this.simulateClick(moreBtn)
                await this.sleep(1500)
                switchOption = findSwitchOption()
            }
        }

        if (!switchOption) {
            this.addLog("Failed to find 'Cambiar de cuenta' option in Instagram menu.", "error")
            await storage.set("isRunning", false)
            this.active = false
            this._loopRunning = false
            this.isSwitchingAccount = false
            return
        }

        this.addLog("Clicking 'Cambiar de cuenta' option...", "info")
        this.simulateClick(switchOption)
        await this.sleep(2000)

        // Step 3: Find target account in the modal
        let targetBtn: HTMLElement | null = null
        let modalTextDump: string[] = []

        for (let i = 0; i < 15; i++) {
            await this.sleep(500)
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
            const searchRoot = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document
            const allElements = Array.from(searchRoot.querySelectorAll('span, div, button, a, img'))
            modalTextDump = []

            for (const el of allElements) {
                const rawTxt = el.textContent?.trim() || ""
                if (rawTxt && rawTxt.length < 40 && !modalTextDump.includes(rawTxt)) {
                    modalTextDump.push(rawTxt)
                }

                const txt = rawTxt.toLowerCase()
                if (txt === cleanTarget || txt === `@${cleanTarget}`) {
                    targetBtn = (el.closest('button, [role="button"], div[tabindex="0"], div.html-div, a') || el) as HTMLElement
                    break
                }

                if (el.tagName === 'IMG') {
                    const alt = (el.getAttribute('alt') || '').toLowerCase()
                    if (alt.includes(cleanTarget)) {
                        targetBtn = (el.closest('button, [role="button"], div[tabindex="0"], div.html-div, a') || el) as HTMLElement
                        break
                    }
                }
            }
            if (targetBtn) break
        }

        if (!targetBtn) {
            const visibleText = modalTextDump.slice(0, 10).join(" | ")
            this.addLog(`Account @${cleanTarget} not found in Switcher list. Visible items: [${visibleText}]`, "error")
            await storage.set("isRunning", false)
            this.active = false
            this._loopRunning = false
            this.isSwitchingAccount = false
            return
        }

        this.addLog(`Clicking @${cleanTarget} in the account switcher modal...`, "success")
        this.simulateClick(targetBtn)

        // Verification Loop: Check if active Instagram session username changes to cleanTarget
        let switchVerified = false
        for (let attempt = 1; attempt <= 8; attempt++) {
            await this.sleep(800)
            const activeNow = await detectActiveUsername()
            if (activeNow && activeNow.toLowerCase() === cleanTarget) {
                switchVerified = true
                this.addLog(`✅ Verification Passed: Active session detected as @${cleanTarget}!`, "success")
                break
            }
        }

        if (!switchVerified) {
            this.addLog(`⚠️ Session cookie transition pending. Reloading Home page for @${cleanTarget}...`, "warning")
        }

        this.isSwitchingAccount = false
        window.location.href = `https://www.instagram.com/?rotated=${cleanTarget}_${Date.now()}`
    }

    private async generateReport(reason: string) {
        const end = Date.now()
        const durationMs = end - this.sessionStart
        const h = Math.floor(durationMs / 3600000).toString().padStart(2, '0')
        const m = Math.floor((durationMs % 3600000) / 60000).toString().padStart(2, '0')
        const s = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0')

        const report = {
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            startTime: this.sessionStart,
            endTime: end,
            durationStr: `${h}:${m}:${s}`,
            actions: {
                likes: this.sessionLikes,
                follows: this.sessionFollows,
                unfollows: this.sessionUnfollows,
                dms: this.sessionComments
            },
            stopReason: reason
        }

        await storage.set(this.pKey("lastSessionReport"), report)
        this.showTerminationOverlay(report)
    }

    private showTerminationOverlay(report: any) {
        let overlay = document.getElementById('sr-status-overlay')
        if (!overlay) {
            this.createStatusOverlay()
            overlay = document.getElementById('sr-status-overlay')
        }
        if (!overlay) return

        overlay.innerHTML = `
            <div style="width: 100%; max-width: 500px; padding: 32px; background: rgba(15, 23, 42, 0.95); border-radius: 24px; border: 1px solid rgba(148, 163, 184, 0.2); text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                <div style="width: 48px; height: 48px; background: rgba(244, 63, 94, 0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                </div>
                <h2 style="font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 4px; letter-spacing: -0.02em;">SESSION ENDED</h2>
                <p style="font-size: 14px; font-weight: 500; color: #94a3b8; margin-bottom: 24px;">${this.escapeHtml(report.stopReason)}</p>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px;">
                    <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 12px;">
                        <div style="font-size: 18px; font-weight: 800; color: #f43f5e;">${report.actions.likes}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Likes</div>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 12px;">
                        <div style="font-size: 18px; font-weight: 800; color: #3b82f6;">${report.actions.follows}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Follows</div>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 12px;">
                        <div style="font-size: 18px; font-weight: 800; color: #fbbf24;">${report.actions.unfollows}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Unfollows</div>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 12px;">
                        <div style="font-size: 18px; font-weight: 800; color: #e2e8f0;">${report.durationStr}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Duration</div>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                     <button id="sr-close-overlay" style="background: #fff; color: #0f172a; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform 0.1s;">Close Report</button>
                </div>
            </div>
        `

        if (this.uiInterval) clearInterval(this.uiInterval)

        document.getElementById('sr-close-overlay')?.addEventListener('click', () => {
            this.removeStatusOverlay()
        })
    }

    async init() {
        try {
            console.log("SocialRadar: Engine Started")

            // Listener para los datos interceptados por interceptor.ts
            window.addEventListener("message", (event) => {
                if (event.source !== window || event.origin !== window.location.origin) return
                if (event.data?.type === "SOCIAL_RADAR_GRAPHQL_DATA" && event.data?.payload && typeof event.data.payload === "object") {
                    this.capturedGraphQLData.push(event.data.payload)
                }
            })

            await this.syncActiveUsername()

            const [savedConfig, savedDelays, savedStats, savedLogs, savedFollows, savedInteractions, savedHistory, savedHashtags, savedCompetitors, savedPostUrls, savedCommentTemplates, savedStartTime, sLikes, sFollows, sUnfollows, sComments, savedSessionDayMarker, savedPostInteractions, savedPostTargetQueue] = await Promise.all([
                storage.get(this.pKey("botConfig")),
                storage.get(this.pKey("delays")),
                storage.get<BotStats>(this.pKey("stats")),
                storage.get<LogEntry[]>(this.pKey("logs")),
                storage.get<FollowedUser[]>(this.pKey("followedUsers")),
                storage.get<InteractionRecord[]>(this.pKey("interactionHistory")),
                storage.get<string[]>(this.pKey("processedHistory")),
                storage.get<string[]>(this.pKey("targetHashtags")),
                storage.get<string[]>(this.pKey("targetCompetitors")),
                storage.get<string[]>(this.pKey("targetPostUrls")),
                storage.get<string[]>(this.pKey("commentTemplates")),
                storage.get<number>("botStartTime"),
                storage.get<number>(this.pKey("sessionLikes")),
                storage.get<number>(this.pKey("sessionFollows")),
                storage.get<number>(this.pKey("sessionUnfollows")),
                storage.get<number>(this.pKey("sessionComments")),
                storage.get<string>(this.pKey("sessionDayMarker")),
                storage.get<any>(this.pKey("postInteractions")),
                storage.get<string[]>(this.pKey("postTargetQueue"))
            ])

            if (savedConfig) this.config = savedConfig
            if (savedDelays) this.delayConfig = savedDelays
            if (savedStats) this.stats = { ...this.stats, ...savedStats }
            if (savedLogs) this.logs = savedLogs
            if (savedFollows) this.followedUsers = savedFollows
            this.interactionHistory = savedInteractions || []
            if (savedPostInteractions) this.postInteractions = savedPostInteractions
            if (savedPostTargetQueue) this.postTargetQueue = savedPostTargetQueue
            const remoteAudience = await fetchAudienceDatabaseFromSupabase(this.activeUsername)
            if (remoteAudience.length > 0) {
                this.followedUsers = remoteAudience
                await storage.set(this.pKey("followedUsers"), remoteAudience)
            }
            if (savedHistory) this.processedHistory = (savedHistory || []).map(h => h.toLowerCase())
            if (typeof savedStartTime === "number") this.sessionStart = savedStartTime // Synced start time
            if (typeof sLikes === "number") this.sessionLikes = sLikes
            if (typeof sFollows === "number") this.sessionFollows = sFollows
            if (typeof sUnfollows === "number") this.sessionUnfollows = sUnfollows
            if (typeof sComments === "number") this.sessionComments = sComments
            this.sessionDayMarker = savedSessionDayMarker || this.getSessionDayMarker()

            // Initialize defaults if missing
            if (!savedHashtags) await storage.set(this.pKey("targetHashtags"), ["#digitalart"])
            if (!savedCompetitors) await storage.set(this.pKey("targetCompetitors"), ["@leomessi"])
            if (!savedPostUrls) await storage.set(this.pKey("targetPostUrls"), [])
            if (!savedCommentTemplates) await storage.set(this.pKey("commentTemplates"), this.getCommentTemplates())
            await this.ensureDailySessionBoundary()

            this.listenToToggles()

            // --- FORCED AUDIT CHECK ---
            // If the URL has ?audit=true or ?start_audit=true, run the analysis even if the bot is not "Running"
            const params = new URLSearchParams(window.location.search)
            const switchTarget = params.get('switch_account')
            if (switchTarget) {
                this.isSwitchingAccount = true
                this.addLog(`🔄 Multi-Account Switch requested via URL: Target @${switchTarget}`, "info")
                setTimeout(() => this.executeAccountSwitch(switchTarget), 1500)
            }

            const rotatedTarget = params.get('rotated')
            if (rotatedTarget) {
                const targetUser = rotatedTarget.split('_')[0].toLowerCase()
                setTimeout(async () => {
                    const currentActive = await detectActiveUsername()
                    if (currentActive && currentActive.toLowerCase() === targetUser) {
                        this.addLog(`✅ Multi-Account Switch VERIFIED: Successfully running on @${currentActive}!`, "success")
                        await storage.set("lastNavTime", 0)
                        if (this.active) {
                            await this.navigateToNextTarget()
                        }
                    } else {
                        this.addLog(`❌ Multi-Account Switch FAILED: Expected active session @${targetUser}, but Instagram active account is @${currentActive || 'unknown'}. Please make sure @${targetUser} is logged into Instagram Web.`, "error")
                        await storage.set("isRunning", false)
                        this.active = false
                    }
                }, 2000)
            }

            const isAudit = params.get('audit') === 'true' || params.get('start_audit') === 'true'
            if (isAudit) {
                this.showAuditOverlay()
                this.addLog("⚡ Manual Audit Triggered. Intercepting Network...", "info")
                setTimeout(() => this.analyzeOwnProfile(), 2000)
            }
        } catch (e) { }
    }

    private async logActiveConfiguration() {
        try {
            const actions: string[] = []
            if (this.config.likeEnabled) actions.push(`Like (Limit: ${this.delayConfig.sessionLikeLimit || 100})`)
            if (this.config.followEnabled) actions.push(`Follow (Limit: ${this.delayConfig.sessionFollowLimit || 100})`)
            if (this.config.unfollowEnabled) actions.push('Unfollow')
            if (this.config.dmEnabled) actions.push(`Comment (Limit: ${this.delayConfig.sessionCommentLimit || 25})`)

            const sources: string[] = []
            if (this.config.sourceHashtags) sources.push('Hashtags')
            if (this.config.sourceCompetitors) sources.push('Competitors')
            if (this.config.sourcePosts) sources.push('Specific Posts')

            const multiAccountEnabled = await storage.get<boolean>("multiAccountEnabled")

            const actionsStr = actions.length > 0 ? actions.join(', ') : 'None'
            const sourcesStr = sources.length > 0 ? sources.join(', ') : 'None'
            const rotationStr = multiAccountEnabled ? 'ENABLED 🔄' : 'DISABLED'

            this.addLog(`📋 Active Config: Actions [${actionsStr}] | Sources [${sourcesStr}] | Multi-Account Rotation: ${rotationStr}`, "info")
        } catch (e) {}
    }

    async listenToToggles() {
        const params = new URLSearchParams(window.location.search)
        const isSwitchingAccount = params.has('switch_account') || this.isSwitchingAccount

        const isRunning = await storage.get<boolean>("isRunning")
        this.active = !!isRunning
        if (this.active) {
            if (isSwitchingAccount) {
                this.addLog("🔄 Multi-Account Rotation in progress: Pausing mission until account switch completes...", "info")
                return
            }
            this.addLog("Bot initialized and running", "success")
            await this.logActiveConfiguration()
            this.createStatusOverlay()
            this.runLoop()
        }

        try {
            // Use chrome.storage.onChanged for robust catch-all watching of prefixed keys
            chrome.storage.onChanged.addListener(async (changes, areaName) => {
                if (areaName !== 'local') return

                // 1. Handle Account Switch
                if (changes["currentUserStats"]) {
                    const stats = changes["currentUserStats"].newValue
                    if (stats?.username && stats.username !== this.activeUsername) {
                        console.log(`SocialRadar: Account switch detected -> ${stats.username}`)
                        await this.handleAccountSwitch(stats.username)
                    }
                }

                // 2. Handle System Run/Stop
                if (changes["isRunning"]) {
                    const isNowRunning = !!changes["isRunning"].newValue
                    if (isNowRunning && !this.active) {
                        await this.startBotSequence()
                    } else if (!isNowRunning && this.active) {
                        await this.stopBotSequence()
                    }
                }

                // 3. Handle Account-Specific Config/Delays
                const configKey = this.pKey("botConfig")
                const delaysKey = this.pKey("delays")

                if (changes[configKey]) {
                    const newVal = changes[configKey].newValue
                    if (newVal) {
                        const oldOverlay = this.config?.overlayEnabled !== false
                        this.config = newVal
                        const newOverlay = this.config?.overlayEnabled !== false
                        if (this.active) {
                            if (newOverlay && !oldOverlay) this.createStatusOverlay()
                            if (!newOverlay && oldOverlay) this.removeStatusOverlay()
                        }
                    }
                }

                if (changes[delaysKey]) {
                    if (changes[delaysKey].newValue) {
                        this.delayConfig = changes[delaysKey].newValue
                    }
                }
            })
        } catch (e) {
            console.warn("SocialRadar: Listener error", e)
        }
    }

    private async syncDataForAccount() {
        const [conf, del, savedStats, savedLogs, savedFollows, savedInteractions, savedPI, savedPQ] = await Promise.all([
            storage.get<any>(this.pKey("botConfig")),
            storage.get<any>(this.pKey("delays")),
            storage.get<BotStats>(this.pKey("stats")),
            storage.get<LogEntry[]>(this.pKey("logs")),
            storage.get<FollowedUser[]>(this.pKey("followedUsers")),
            storage.get<InteractionRecord[]>(this.pKey("interactionHistory")),
            storage.get<any>(this.pKey("postInteractions")),
            storage.get<string[]>(this.pKey("postTargetQueue"))
        ])
        if (conf) this.config = conf
        if (del) this.delayConfig = del
        this.stats = savedStats ? { follows: 0, likes: 0, dms: 0, unfollows: 0, ...savedStats } : { follows: 0, likes: 0, dms: 0, unfollows: 0 }
        this.logs = savedLogs || []
        this.followedUsers = savedFollows || []
        this.interactionHistory = savedInteractions || []
        if (savedPI) this.postInteractions = savedPI
        if (savedPQ) this.postTargetQueue = savedPQ
        const remoteAudience = await fetchAudienceDatabaseFromSupabase(this.activeUsername)
        if (remoteAudience.length > 0) {
            this.followedUsers = remoteAudience
            await storage.set(this.pKey("followedUsers"), remoteAudience)
        }

        const remoteHistory = await fetchInteractionHistoryFromSupabase(this.activeUsername)
        if (remoteHistory.length > 0 && (!this.interactionHistory || this.interactionHistory.length === 0)) {
            this.interactionHistory = remoteHistory
            await storage.set(this.pKey("interactionHistory"), remoteHistory)
        }

        const remoteSettings = await fetchAccountSettingsFromSupabase(this.activeUsername)
        if (remoteSettings) {
            if (remoteSettings.config && Object.keys(remoteSettings.config).length > 0) {
                this.config = { ...this.config, ...remoteSettings.config }
                await storage.set(this.pKey("botConfig"), this.config)
            }
            if (remoteSettings.delays && Object.keys(remoteSettings.delays).length > 0) {
                this.delayConfig = { ...this.delayConfig, ...remoteSettings.delays }
                await storage.set(this.pKey("delays"), this.delayConfig)
            }
            if (remoteSettings.targetHashtags && remoteSettings.targetHashtags.length > 0) {
                await storage.set(this.pKey("targetHashtags"), remoteSettings.targetHashtags)
            }
            if (remoteSettings.targetCompetitors && remoteSettings.targetCompetitors.length > 0) {
                await storage.set(this.pKey("targetCompetitors"), remoteSettings.targetCompetitors)
            }
            if (remoteSettings.targetPostUrls && remoteSettings.targetPostUrls.length > 0) {
                await storage.set(this.pKey("targetPostUrls"), remoteSettings.targetPostUrls)
            }
            if (remoteSettings.commentTemplates && remoteSettings.commentTemplates.length > 0) {
                await storage.set(this.pKey("commentTemplates"), remoteSettings.commentTemplates)
            }
        }

        this.processedHistory = await storage.get<string[]>(this.pKey("processedHistory")) || []
        this.resetTransientSessionState()

        if (this.active) {
            this.removeStatusOverlay()
            if (this.config?.overlayEnabled !== false) {
                this.createStatusOverlay()
            }
        }
    }

    private async recordInteraction(username: string, action: "follow" | "unfollow" | "like" | "comment", url?: string, details?: string) {
        if (!username || username.trim() === "") return
        try {
            const cleanUser = username.trim().replace(/^@/, '')
            const now = new Date()
            const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD for grouping
            const timeStr = now.toLocaleTimeString()

            const record: InteractionRecord = {
                id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                username: cleanUser,
                action,
                timestamp: Date.now(),
                dateStr,
                timeStr,
                url: url ? url.split('?')[0].replace(/\/$/, "").toLowerCase() : undefined,
                details
            }

            this.interactionHistory = [record, ...(this.interactionHistory || [])].slice(0, 10000)
            await storage.set(this.pKey("interactionHistory"), this.interactionHistory)
            void syncInteractionHistoryToSupabase(this.activeUsername, this.interactionHistory)
            this.addLog(`Recorded ${action.toUpperCase()} for @${cleanUser}`, "info")
            if (url) await this.addToHistory(url)
        } catch (e) {
            console.warn("SocialRadar: Error recording interaction", e)
        }
    }

    private async startBotSequence() {
        if (this.active && this._loopRunning) return
        this.active = true
        this.addLog(">>> ENGINE LAUNCHED: Automation Online", "success")
        await this.syncActiveUsername()
        this.runLoopAccountUsername = this.activeUsername

        await storage.remove(this.pKey("lastSessionReport"))
        await this.syncDataForAccount()
        await storage.set("lastNavTime", 0)

        const now = Date.now()
        this.sessionStart = now
        await storage.set("botStartTime", now)

        this.resetTransientSessionState()
        this.sessionDayMarker = this.getSessionDayMarker()

        await storage.set(this.pKey("sessionLikes"), 0)
        await storage.set(this.pKey("sessionFollows"), 0)
        await storage.set(this.pKey("sessionUnfollows"), 0)
        await storage.set(this.pKey("sessionComments"), 0)
        await storage.set(this.pKey("sessionDayMarker"), this.sessionDayMarker)

        this.removeStatusOverlay()
        if (this.config?.overlayEnabled !== false) {
            this.createStatusOverlay()
        }
        this.runLoop()
    }

    private async stopBotSequence() {
        if (!this.active) return
        this.active = false
        this._loopRunning = false
        this.addLog("<<< ENGINE STOPPED: Automation Offline", "warning")
        if (!this.isInternalStop) {
            await this.generateReport("Manual Stop by User")
        }
        this.isInternalStop = false
        this.resetTransientSessionState()
        await storage.remove("botStartTime")
    }

    private async addToHistory(url: string) {
        if (!url) return
        const cleanUrl = url.split('?')[0].replace(/\/$/, "").toLowerCase()
        if (!this.processedHistory.includes(cleanUrl)) {
            this.processedHistory = [cleanUrl, ...this.processedHistory].slice(0, 5000)
            await storage.set(this.pKey("processedHistory"), this.processedHistory)
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
            await storage.set(this.pKey("followedUsers"), this.followedUsers)
            void syncAudienceDatabaseToSupabase(this.activeUsername, this.followedUsers)
            this.addLog(`Capturing Audience: @${username}`, "info")
            await this.recordInteraction(username, "follow", url, "Smart Follow Target")
            this.currentSessionActions++
        } catch (e) { }
    }

    // Check if we are on the login page
    private async checkSession(): Promise<boolean> {
        const url = window.location.href.toLowerCase()
        if (url.includes('/accounts/login') || url.includes('/challenge') || url.includes('/accounts/suspended')) return false

        const passwordInput = document.querySelector('input[name="password"]')
        const loginButton = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent?.toLowerCase().includes('log in') ||
            b.textContent?.toLowerCase().includes('iniciar sesión')
        )
        const usernameInput = document.querySelector('input[name="username"]')
        const loginLink = Array.from(document.querySelectorAll('a')).find(a => {
            const text = a.textContent?.toLowerCase() || ''
            const href = (a as HTMLAnchorElement).href?.toLowerCase() || ''
            return href.includes('/accounts/login') || text.includes('log in') || text.includes('iniciar sesión')
        })
        const challengeHeading = Array.from(document.querySelectorAll('h1, h2')).find(el => {
            const text = el.textContent?.toLowerCase() || ''
            return text.includes('confirm it was you') || text.includes('suspicious login') || text.includes('checkpoint')
        })

        if (passwordInput && usernameInput) return false
        if (loginButton && usernameInput) return false
        if (loginLink && !document.querySelector('nav')) return false
        if (challengeHeading) return false

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
            await storage.set(this.pKey("logs"), this.logs)
            console.log(`[SocialRadar] ${msg}`)
            await this.updateHealth({ lastAction: msg.slice(0, 120), lastActionAt: Date.now() })
            this.updateStatusUI() // Update UI when log adds
        } catch (e) { }
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private async updateHealth(partial: Partial<HealthMetrics>) {
        try {
            const current = await storage.get<HealthMetrics>(this.pKey("healthMetrics")) || {
                lastHeartbeat: 0,
                lastAction: "idle",
                lastActionAt: 0,
                errorCount: 0,
                lastError: "",
                lastErrorAt: 0
            }
            const next = { ...current, ...partial }
            await storage.set(this.pKey("healthMetrics"), next)
        } catch { }
    }

    private async recordError(err: unknown, where: string) {
        const message = err instanceof Error ? err.message : String(err ?? "unknown error")
        const current = await storage.get<HealthMetrics>(this.pKey("healthMetrics"))
        await this.updateHealth({
            errorCount: (current?.errorCount || 0) + 1,
            lastError: `${where}: ${message}`,
            lastErrorAt: Date.now()
        })
    }

    private getCommentTemplates(): string[] {
        return [
            "Great post, thanks for sharing!",
            "Really solid content ðŸ‘",
            "Love this perspective!",
            "Super useful. Keep it up!"
        ]
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
        try {
            while (this.active) {
                try {
                    await this.ensureDailySessionBoundary()
                    await this.updateHealth({ lastHeartbeat: Date.now() })
                    const contextStillValid = await this.verifyRunContext()
                    if (!contextStillValid) return
                    const limit = this.delayConfig.batchLimit || 15
                if (this.currentSessionActions >= limit) {
                    const restTime = this.delayConfig.batchPause || 3600
                    this.addLog(`SECURITY PROTECTION: limit reached (${limit}). Resting ${restTime}s...`, "warning")
                    await this.sleep(restTime * 1000)
                    this.currentSessionActions = 0
                    continue
                }

                const url = window.location.href.toLowerCase()

                // --- SLEEP MODE CHECK ---
                if (this.isSleepTime()) {
                    this.addLog("ðŸ’¤ Modo Dormir ACTIVADO. El bot descansarÃ¡ hasta que termine la ventana de sueÃ±o.", "wait")
                    this.removeStatusOverlay()
                    // Re-check every 15 minutes
                    await this.sleep(15 * 60 * 1000)
                    window.location.reload()
                    return
                } else if (this.config.overlayEnabled) {
                    // Restore overlay if we just woke up or it was removed
                    if (!document.getElementById('sr-status-overlay')) {
                        this.createStatusOverlay()
                    }
                }

                // --- CRITICAL SESSION CHECK ---
                const isSessionValid = await this.checkSession()
                if (!isSessionValid) {
                    await this.stopBot("Session Lost / Logout detected")
                    return
                }

                const path = window.location.pathname.toLowerCase()

                if (!url.includes("instagram.com")) {
                    await this.sleep(5000)
                    continue
                }

                // --- 0. PRIORITY MAINTENANCE CHECK (Once per day) ---
                // We check this BEFORE any modal or other logic to ensure data freshness on startup
                const userStats = await storage.get<any>("currentUserStats")
                const lastAudit = userStats?.timestamp || 0
                const today = new Date().toDateString()
                const lastAuditDate = new Date(lastAudit).toDateString()

                // If never scanned, OR not scanned today
                if (!lastAudit || lastAuditDate !== today) {
                    // Check if we are ALREADY in the deep audit mode url to avoid loop re-triggering
                    const isProcessing = url.includes("mode=deep")

                    if (!isProcessing) {
                        const myUsername = userStats?.username || await storage.get<string>("lastKnownUsername")
                        if (myUsername) {
                            this.addLog("ðŸ›  Priority Maintenance: Daily Deep Audit required...", "wait")
                            await storage.set("lastNavTime", Date.now())
                            window.location.href = `https://www.instagram.com/${myUsername}/?mode=deep`
                            return // Break loop to navigate
                        }
                    }
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
                        this.addLog("â³ Chaos timer reset to wait full cycle.", "wait")
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
                    await this.recordError(err, "runLoop")
                    await this.sleep(8000)
                }
            }
        } finally {
            // Guarantees the engine can be started again even if the loop exits via return.
            this._loopRunning = false
        }
    }

    async navigateToNextTarget() {
        const sources = []
        if (this.config.sourceHashtags) sources.push('hashtag')
        if (this.config.sourceCompetitors) sources.push('competitor')
        if (this.config.sourcePosts) sources.push('post')
        if (this.config.unfollowEnabled) sources.push('unfollow')

        if (sources.length === 0) {
            await this.stopBot("No active strategy selected")
            return
        }

        // Strategy: Iterate over sources until navigation is possible
        const shuffled = sources.sort(() => Math.random() - 0.5)
        const langParam = "hl=en"




        for (const choice of shuffled) {
            if (choice === 'hashtag') {
                const tags = await storage.get<string[]>(this.pKey("targetHashtags")) || []
                if (tags.length === 0) {
                    this.addLog("Source 'Hashtags' enabled but list is empty.", "warning")
                    continue
                }
                const tag = tags[Math.floor(Math.random() * tags.length)].replace("#", "").trim()
                if (tag) {
                    this.currentMission = `#${tag}`
                    this.addLog(`>>> Mission: Hashtag #${tag}`, "success")
                    await storage.set("lastNavTime", Date.now())
                    window.location.href = `https://www.instagram.com/explore/tags/${tag}/?${langParam}`
                    return
                }
            } else if (choice === 'competitor') {
                const comps = await storage.get<string[]>(this.pKey("targetCompetitors")) || []
                if (comps.length === 0) {
                    this.addLog("Source 'Competitors' enabled but list is empty.", "warning")
                    continue
                }
                const comp = comps[Math.floor(Math.random() * comps.length)].replace("@", "").trim()
                if (comp) {
                    this.currentMission = `@${comp}`
                    this.addLog(`>>> Mission: Competitor @${comp}`, "success")
                    await storage.set("lastNavTime", Date.now())
                    window.location.href = `https://www.instagram.com/${comp}/?${langParam}`
                    return
                }
            } else if (choice === 'post') {
                const postUrls = await storage.get<string[]>(this.pKey("targetPostUrls")) || []
                const clean = postUrls.map((u) => (u || "").trim()).filter(Boolean)
                if (clean.length === 0) {
                    this.addLog("Source 'Posts' enabled but list is empty.", "warning")
                    continue
                }
                const picked = clean[Math.floor(Math.random() * clean.length)]
                this.currentMission = `Post Target`
                this.addLog(`>>> Mission: Post URL`, "success")
                await storage.set("lastNavTime", Date.now())
                window.location.href = picked
                return
            } else if (choice === 'unfollow') {
                const now = Date.now()
                const threshold = (this.delayConfig.unfollowDays || 3) * 86400 * 1000
                const candidates = [...this.followedUsers].reverse().filter(u => !u.protected && !u.unfollowFailed && (now - u.timestamp) > threshold)

                if (candidates.length > 0) {
                    const target = candidates[0]
                    if (target && target.username) {
                        this.currentMission = `Unfollow @${target.username}`
                        this.addLog(`>>> Mission: Unfollow @${target.username}`, "warning")
                        await storage.set("lastNavTime", Date.now())
                        window.location.href = `https://www.instagram.com/${target.username}/?${langParam}`
                        return
                    }
                } else {
                    if (sources.length === 1 && sources[0] === 'unfollow') {
                        await this.stopBot("No Unfollow targets ready (Maturity Check)")
                        return
                    }
                    this.addLog("No Unfollow targets ready (waiting for maturity days).", "info")
                }
            }
        }

        // If nothing was chosen, mission is complete. Check for continuous session mode
        if (this.config.continuousSession) {
            this.addLog("ðŸ”„ SesiÃ³n Continua activada. Reiniciando ciclo...", "success")

            // Show summary before continuing
            const summary = `âœ… Ciclo completado:\nðŸ”¥ Likes: ${this.sessionLikes}\nðŸ‘¥ Follows: ${this.sessionFollows}\nðŸ‘‹ Unfollows: ${this.sessionUnfollows}\nðŸ’¬ Comments: ${this.sessionComments}\n\nðŸ”„ Reiniciando sesiÃ³n automÃ¡ticamente...`
            this.addLog(summary.replace(/\n/g, " | "), "success")

            // Reset session counters for the new cycle
            this.currentSessionActions = 0
            this.sessionLikes = 0
            this.sessionFollows = 0
            this.sessionUnfollows = 0
            this.sessionComments = 0
            this.sessionEngagedProfiles.clear()
            this.sessionStart = Date.now()
            this.sessionDayMarker = this.getSessionDayMarker()

            // Save reset stats to storage
            await storage.set("botStartTime", Date.now())
            await storage.set(this.pKey("sessionLikes"), 0)
            await storage.set(this.pKey("sessionFollows"), 0)
            await storage.set(this.pKey("sessionUnfollows"), 0)
            await storage.set(this.pKey("sessionComments"), 0)
            await storage.set(this.pKey("sessionDayMarker"), this.sessionDayMarker)
            await storage.remove(this.pKey("lastSessionReport"))

            // Wait a moment before continuing
            await this.sleep(5000)

            // Navigate to start a new cycle
            await this.navigateToNextTarget()
            return
        }

        // If nothing was chosen and continuous mode is off, Auto-Stop.
        await this.stopBot("No active tasks or lists empty")

        window.location.href = `https://www.instagram.com/?${langParam}`
    }

    async handleProfilePage(): Promise<string | void> {
        // Wait for hydration/rendering to avoid "infinite reload" panic
        await this.sleep(3500)

        const user = window.location.pathname.replace(/\//g, "").toLowerCase()
        const isFollowedTarget = this.followedUsers.some(u => u.username.toLowerCase() === user && !u.protected)

        if (this.config.unfollowEnabled && isFollowedTarget) {
            this.addLog(`Processing Unfollow: @${user}...`, "info")

            const getVisibleProfileActionButtons = () => {
                const selectors = [
                    'header button',
                    'main header button',
                    'header div[role="button"]',
                    'main header div[role="button"]',
                    'section header button',
                    'section header div[role="button"]'
                ]

                return Array.from(document.querySelectorAll(selectors.join(', ')))
                    .filter((el) => (el as HTMLElement).offsetHeight > 0) as HTMLElement[]
            }

            const getButtonSignals = (el: Element) => {
                const node = el as HTMLElement
                const text = node.innerText?.toLowerCase().trim() || ""
                const label = node.getAttribute('aria-label')?.toLowerCase().trim() || ""
                const title = node.querySelector('title')?.textContent?.toLowerCase().trim() || ""
                return { text, label, title }
            }

            const followingKeywords = ['following', 'siguiendo', 'requested', 'pendiente']
            const followKeywords = ['follow', 'seguir', 'follow back', 'seguir también', 'seguir tambien']

            const interactionBtn = getVisibleProfileActionButtons().find((b) => {
                const { text, label, title } = getButtonSignals(b)
                const combined = `${text} ${label} ${title}`
                const isMessage = combined.includes('message') || combined.includes('mensaje') || combined.includes('contact')
                const matchesText = followingKeywords.some(k => combined.includes(k))
                const hasFollowIcon = !!b.querySelector('svg[aria-label="Following"]') ||
                    !!b.querySelector('svg[aria-label="Siguiendo"]') ||
                    Array.from(b.querySelectorAll('path')).some(p => p.getAttribute('d')?.includes('M12.003 20.003'))

                return !isMessage && (matchesText || hasFollowIcon)
            })

            if (interactionBtn) {
                interactionBtn.scrollIntoView({ block: 'center' })
                await this.sleep(1500)
                await this.nativeClick(interactionBtn)

                let confirmed = false
                await this.sleep(1500)

                for (let i = 0; i < 6; i++) {
                    const dialog = document.querySelector('div[role="dialog"]')
                    if (dialog) {
                        const candidates = Array.from(dialog.querySelectorAll('button, div[role="button"], span[role="button"], span'))
                        const confirmBtn = candidates.find(el => {
                            const t = el.textContent?.toLowerCase().trim() || ""
                            const aria = el.getAttribute('aria-label')?.toLowerCase().trim() || ""
                            const combined = `${t} ${aria}`
                            return combined.includes('unfollow') || combined.includes('dejar de seguir')
                        })

                        if (confirmBtn) {
                            await this.nativeClick(confirmBtn as HTMLElement)
                            confirmed = true
                            break
                        }
                    }
                    await this.sleep(800)
                }

                await this.sleep(confirmed ? 3000 : 1800)

                const checkBtn = getVisibleProfileActionButtons().find((b) => {
                    const { text, label, title } = getButtonSignals(b)
                    const combined = `${text} ${label} ${title}`
                    return followKeywords.some(keyword => combined.includes(keyword))
                })

                if (checkBtn) {
                    this.stats.unfollows++
                    this.sessionUnfollows++ // Increment session stats
                    await storage.set(this.pKey("stats"), this.stats)
                    await storage.set(this.pKey("sessionUnfollows"), this.sessionUnfollows)
                    this.followedUsers = this.followedUsers.filter(u => u.username.toLowerCase() !== user)
                    await storage.set(this.pKey("followedUsers"), this.followedUsers)
                    void syncAudienceDatabaseToSupabase(this.activeUsername, this.followedUsers)
                    await this.recordInteraction(user, "unfollow", window.location.href, "Auto-Unfollow Clean")
                    this.addLog(`>>> SUCCESS: @${user} unfollowed.`, "success")
                    await this.randomSleep('unfollow')
                    return "DONE"
                } else {
                    if (!confirmed) {
                        this.addLog(`Unfollow confirmation dialog not detected for @${user}.`, "warning")
                    } else {
                        this.addLog(`Failed to verify unfollow for @${user}. Retrying next time.`, "warning")
                    }
                    return "DONE"
                }
            } else {
                const isFollowBtn = getVisibleProfileActionButtons().some((b) => {
                    const { text, label, title } = getButtonSignals(b)
                    const combined = `${text} ${label} ${title}`
                    return followKeywords.some(keyword => combined.includes(keyword))
                })
                if (isFollowBtn) {
                    this.followedUsers = this.followedUsers.filter(u => u.username.toLowerCase() !== user)
                    await storage.set(this.pKey("followedUsers"), this.followedUsers)
                    void syncAudienceDatabaseToSupabase(this.activeUsername, this.followedUsers)
                    await this.recordInteraction(user, "unfollow", window.location.href, "Already Unfollowed")
                    this.addLog(`Already unfollowed @${user}. Removing from DB.`, "success")
                    return "DONE"
                }

                this.addLog(`Could not find Unfollow button for @${user}. Marking as failed to skip next time.`, "warning")
                this.followedUsers = this.followedUsers.map(u =>
                    u.username.toLowerCase() === user ? { ...u, unfollowFailed: true } : u
                )
                await storage.set(this.pKey("followedUsers"), this.followedUsers)
                void syncAudienceDatabaseToSupabase(this.activeUsername, this.followedUsers)
                return "DONE"
            }
        }

        // Prospecting logic
        const comps = await storage.get<string[]>(this.pKey("targetCompetitors")) || []
        const isCompetitor = comps.some(c => c.replace("@", "").toLowerCase() === user)

        if (isCompetitor) {
            this.addLog(`At Competitor Profile: @${user}`, "info")
            const flwLink = Array.from(document.querySelectorAll('a')).find(a => a.href.includes('/followers/'))
            if (flwLink) { flwLink.click(); await this.sleep(5000) }
            return
        }

        const cleanUrl = window.location.href.split('?')[0].replace(/\/$/, "").toLowerCase()
        const sessionDone = this.sessionEngagedProfiles.has(cleanUrl)

        if (sessionDone) {
            await this.navigateToNextTarget()
            return
        }

        await this.addToHistory(cleanUrl)
        this.sessionEngagedProfiles.add(cleanUrl)

        // 1. Follow action on profile if enabled
        if (this.config.followEnabled) {
            const prevUnfollowed = (this.interactionHistory || []).find(r => r.username.toLowerCase() === user.toLowerCase() && r.action === 'unfollow')
            if (prevUnfollowed) {
                this.addLog(`Anti-Refollow Guard: Skipping @${user} (previously unfollowed on ${prevUnfollowed.dateStr})`, "info")
            } else {
                const followKeywords = ['follow', 'seguir']
                const btn = getVisibleProfileActionButtons().find((b) => {
                    const { text, label, title } = getButtonSignals(b)
                    const combined = `${text} ${label} ${title}`
                    return followKeywords.some(keyword => combined.includes(keyword))
                })
                if (btn) {
                    (btn as HTMLElement).click()
                    this.stats.follows++
                    this.sessionFollows++
                    await storage.set(this.pKey("stats"), this.stats)
                    await storage.set(this.pKey("sessionFollows"), this.sessionFollows)
                    await this.saveFollowedTarget(user, cleanUrl)
                    this.addLog(`>>> SUCCESS: Followed @${user}`, "success")
                }
            }
        }

        // 2. Open post for Like / Comment if enabled
        if (this.config.likeEnabled || this.config.dmEnabled) {
            const post = document.querySelector('article a[href*="/p/"], main a[href*="/p/"]') as HTMLElement
            if (post) {
                this.addLog(`Opening latest post for @${user}...`, "info")
                post.click()
                await this.sleep(4000)
                return
            }
        }

        await this.navigateToNextTarget()
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
                await this.stopBot("Daily Like Limit reached")
                return
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
                        await storage.set(this.pKey("stats"), this.stats)
                        await storage.set(this.pKey("sessionLikes"), this.sessionLikes)
                        if (profileName) await this.recordInteraction(profileName, "like", profileUrl || window.location.href, "Automated Post Like")
                        interacted = true
                    }
                }
            }
        }

        if (this.config.followEnabled) {
            if (this.sessionFollows >= (this.delayConfig.sessionFollowLimit || 100)) {
                await this.stopBot("Daily Follow Limit reached")
                return
            } else {
                const btns = Array.from(container.querySelectorAll('button'))
                const btn = btns.find(b => {
                    const t = (b.textContent?.toLowerCase() || "").trim()
                    const label = (b.getAttribute('aria-label')?.toLowerCase() || "")
                    return (t === 'follow' || t === 'seguir') || (label === 'follow' || label === 'seguir')
                })

                if (btn) {
                    if (profileName) {
                        const prevUnfollowed = this.interactionHistory.find(r => r.username.toLowerCase() === profileName.toLowerCase() && r.action === 'unfollow')
                        if (prevUnfollowed) {
                            this.addLog(`Anti-Refollow Guard: Skipping follow for @${profileName} (unfollowed on ${prevUnfollowed.dateStr})`, "info")
                        } else {
                            (btn as HTMLElement).click()
                            this.stats.follows++
                            this.sessionFollows++
                            await storage.set(this.pKey("stats"), this.stats)
                            await storage.set(this.pKey("sessionFollows"), this.sessionFollows)
                            if (profileName && profileUrl) await this.saveFollowedTarget(profileName, profileUrl)
                            interacted = true
                        }
                    } else {
                        (btn as HTMLElement).click()
                        this.stats.follows++
                        this.sessionFollows++
                        await storage.set(this.pKey("stats"), this.stats)
                        await storage.set(this.pKey("sessionFollows"), this.sessionFollows)
                        interacted = true
                    }
                }
            }
        }

        if (this.config.dmEnabled) {
            if (this.sessionComments >= (this.delayConfig.sessionCommentLimit || 25)) {
                await this.stopBot("Daily Comment Limit reached")
                return
            } else {
                const posted = await this.tryPostComment(container)
                if (posted) {
                    this.stats.dms++
                    this.sessionComments++
                    await storage.set(this.pKey("stats"), this.stats)
                    await storage.set(this.pKey("sessionComments"), this.sessionComments)
                    if (profileName) await this.recordInteraction(profileName, "comment", profileUrl || window.location.href, "Comments Auto-Pilot")
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
        this.addLog("âš¡ ENTERING HUMANIZATION MODE: Chaotic Behavior Active", "warning")

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
                this.addLog("ðŸ›‘ Bot stopped manually during Chaos Mode.", "warning")
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
            this.addLog("âš¡ HUMANIZATION COMPLETE: Resuming operations.", "success")
            window.location.reload()
        }
    }

    // --- NUEVO SISTEMA DE AUDITORÃA PROFESIONAL ---
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

            if (mode === 'deep' && !isCompetitor) {
                this.showAuditOverlay()
            }

            this.addLog(`ðŸ” Audit Mode (${mode.toUpperCase()}): Intercepting Metadata...`, "info")

            // RESET: Limpiamos los datos capturados anteriormente para que solo cuenten los de esta auditorÃ­a
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
            // recolectamos los Ãºnicos de todas las capturas
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
                .map((p: any) => ({ ...p, url: this.sanitizeImageUrl(p?.url) }))

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
                const currentCompsData = await storage.get<any[]>(this.pKey("competitorsData")) || []
                baseStats = currentCompsData.find(c => c.username === username) || {}
            } else {
                baseStats = await storage.get<any>("currentUserStats") || {}
            }
            const existingStats: any = baseStats
            const avatarUrl = this.extractHeaderAvatarUrl(header)

            const parseStatText = (item: Element) => {
                const span = item.querySelector('span, a span, div span') || item;
                const title = span?.getAttribute('title');
                if (title) return title.replace(/[,.]/g, '');

                // Extraer el texto crudo y limpiar cualquier cosa que no sea nÃºmero o abreviatura
                const rawText = span?.textContent?.trim() || item.textContent?.trim() || "0";

                // Si el texto es puramente un nÃºmero (ej: "1234"), devolverlo
                if (/^\d+$/.test(rawText.replace(/[,.]/g, ''))) return rawText.replace(/[,.]/g, '');

                // Busca nÃºmeros seguidos opcionalmente de K o M (ej: 1,234, 1.5M, 500K)
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
            const finalAvatarUrl = (mode === 'deep' && existingStats.avatarUrl)
                ? this.sanitizeImageUrl(existingStats.avatarUrl)
                : extractBestAvatarUrl(interceptedUser, avatarUrl || existingStats.avatarUrl)
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

            this.addLog(`ðŸ“Š Data Results: Posts=${totalPostsCurrent}, Followers=${followersCurrent}`, "success")

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
                const currentCompsData = await storage.get<any[]>(this.pKey("competitorsData")) || []
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
                await storage.set(this.pKey("competitorsData"), currentCompsData)
            } else {
                await storeCurrentUserProfile({
                    ...profileData,
                    engagementRate: Number(engagementRate.toFixed(2)),
                    trustScore: trustScore,
                    totalLikesCaptured: totalInteractions, // Store for the modal
                    analyzedPostsCount: latestPosts.length
                })
            }

            this.addLog(`âœ… Audit Complete: ${latestPosts.length} posts. ER: ${engagementRate.toFixed(2)}%`, "success")

            if (new URLSearchParams(window.location.search).get('audit') === 'true' || new URLSearchParams(window.location.search).get('start_audit') === 'true') {
                // Send to Supabase via Background
                try {
                    const isStartAudit = new URLSearchParams(window.location.search).get('start_audit') === 'true'

                    // Force sync if it was a deep audit
                    if (mode === 'deep' && !isCompetitor) {
                        const finalProfile = await storage.get("currentUserStats")
                        chrome.runtime.sendMessage({ action: "SYNC_STATS", payload: finalProfile })
                    }

                    await this.sleep(2000)

                    if (isStartAudit) {
                        // If this was a start_audit, we now start the bot officially (if enabled)
                        this.addLog("âœ… Routine Audit Complete. Starting sequence...", "success")
                        // Clean URL and go to home to start loop
                        window.location.href = "https://www.instagram.com/?variant=audit_complete"
                    } else {
                        window.close()
                    }
                } catch (e) {
                    console.error("Sync failed", e)
                    window.close()
                }
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

    // --- UI OVERLAYS ---

    private uiInterval: any = null

    private createStatusOverlay() {
        if (this.config.overlayEnabled === false) return
        if (document.getElementById('sr-status-overlay')) return

        const overlay = document.createElement('div')
        overlay.id = 'sr-status-overlay'
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            zIndex: '9999999',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backdropFilter: 'blur(10px)'
        })

        overlay.innerHTML = `
            <div style="width: 100%; max-width: 600px; padding: 24px;">
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 32px; gap: 12px;">
                    <div style="width: 12px; height: 12px; background: #34d399; border-radius: 50%; box-shadow: 0 0 10px #34d399; animation: pulse 2s infinite;"></div>
                    <div style="text-align: left;">
                        <h1 style="font-size: 20px; font-weight: 900; letter-spacing: 0.1em; color: #fff; margin: 0;">SOCIAL RADAR ACTIVE</h1>
                        <p id="sr-active-account" style="font-size: 11px; font-weight: 700; color: #34d399; margin: 2px 0 0 0; text-transform: uppercase;">@${this.escapeHtml(this.activeUsername)}</p>
                    </div>
                </div>

                <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(51, 65, 85, 0.5); padding: 12px 20px; border-radius: 12px; margin-bottom: 24px;">
                    <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">Current Target</p>
                    <p id="sr-mission-text" style="font-size: 16px; font-weight: 800; color: #38bdf8; margin: 0;">${this.escapeHtml(this.currentMission)}</p>
                </div>

                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.6); padding: 12px 16px; border-radius: 12px; margin-bottom: 20px;">
                    <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 8px 0;">Active Config</p>
                    <p id="sr-config-modules" style="font-size: 11px; font-weight: 700; color: #e2e8f0; margin: 0 0 6px 0;">Modules: ${this.escapeHtml(this.getEnabledModulesLabel())}</p>
                    <p id="sr-config-sources" style="font-size: 11px; font-weight: 700; color: #cbd5e1; margin: 0 0 6px 0;">Sources: ${this.escapeHtml(this.getEnabledSourcesLabel())}</p>
                    <p id="sr-config-mode" style="font-size: 11px; font-weight: 700; color: #94a3b8; margin: 0;">Mode: ${this.escapeHtml(this.getModeLabel())}</p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px;">
                    <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(51, 65, 85, 0.5); padding: 16px; border-radius: 16px; text-align: center;">
                        <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">Likes</p>
                        <p id="sr-stat-likes" style="font-size: 24px; font-weight: 900; color: #f43f5e; margin: 0;">0</p>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(51, 65, 85, 0.5); padding: 16px; border-radius: 16px; text-align: center;">
                        <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">Follows</p>
                        <p id="sr-stat-follows" style="font-size: 24px; font-weight: 900; color: #3b82f6; margin: 0;">0</p>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(51, 65, 85, 0.5); padding: 16px; border-radius: 16px; text-align: center;">
                        <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">Unfollows</p>
                        <p id="sr-stat-unfollows" style="font-size: 24px; font-weight: 900; color: #fbbf24; margin: 0;">0</p>
                    </div>
                     <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(51, 65, 85, 0.5); padding: 16px; border-radius: 16px; text-align: center;">
                        <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px 0;">Time</p>
                        <p id="sr-stat-time" style="font-size: 24px; font-weight: 900; color: #e2e8f0; margin: 0;">00:00</p>
                    </div>
                </div>

                <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; font-family: monospace; font-size: 12px; height: 150px; overflow-y: auto; color: #94a3b8;">
                    <div id="sr-logs-container" style="display: flex; flex-direction: column; gap: 6px;"></div>
                </div>
                
                <div style="display: flex; justify-content: center; margin-top: 24px;">
                     <button id="sr-stop-btn-overlay" style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); color: #f43f5e; padding: 10px 24px; border-radius: 99px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; text-transform: uppercase;">
                        Stop Bot
                     </button>
                </div>
                
                <p style="text-align: center; margin-top: 16px; color: #475569; font-size: 12px; font-weight: 600;">DO NOT CLOSE THIS TAB</p>
            </div>
            <style>
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
                #sr-stop-btn-overlay:hover { background: rgba(244, 63, 94, 0.2) !important; transform: scale(1.05); }
            </style>
        `

        document.body.appendChild(overlay)

        // Add Stop Listener
        const stopBtn = document.getElementById('sr-stop-btn-overlay')
        if (stopBtn) {
            stopBtn.addEventListener('click', async () => {
                stopBtn.innerText = "Stopping..."
                await this.stopBot("Manual Stop from Overlay")
            })
        }

        this.updateStatusUI()

        // Start Timer Interval
        if (this.uiInterval) clearInterval(this.uiInterval)
        this.uiInterval = setInterval(() => {
            this.updateTimerUI()
        }, 1000)
    }

    private removeStatusOverlay() {
        const el = document.getElementById('sr-status-overlay')
        if (el) el.remove()
        if (this.uiInterval) clearInterval(this.uiInterval)
    }

    private updateTimerUI() {
        const el = document.getElementById('sr-stat-time')
        if (!el || !this.sessionStart) return

        const diff = Math.floor((Date.now() - this.sessionStart) / 1000)
        const m = Math.floor(diff / 60).toString().padStart(2, '0')
        const s = (diff % 60).toString().padStart(2, '0')
        el.textContent = `${m}:${s}`
    }

    private updateStatusUI() {
        const overlay = document.getElementById('sr-status-overlay')
        if (!overlay) return

        // Update Stats (Use session-specific stats if possible, or global stats diff?) 
        // We have this.sessionLikes and this.sessionFollows populated in runLoop
        const elLikes = document.getElementById('sr-stat-likes')
        const elFollows = document.getElementById('sr-stat-follows')
        const elUnfollows = document.getElementById('sr-stat-unfollows')

        if (elLikes) elLikes.textContent = this.sessionLikes.toString()
        if (elFollows) elFollows.textContent = this.sessionFollows.toString()
        if (elUnfollows) elUnfollows.textContent = this.sessionUnfollows.toString()

        const elMission = document.getElementById('sr-mission-text')
        if (elMission) elMission.textContent = this.currentMission

        const elAccount = document.getElementById('sr-active-account')
        if (elAccount) elAccount.textContent = `@${this.activeUsername}`

        const elModules = document.getElementById('sr-config-modules')
        if (elModules) elModules.textContent = `Modules: ${this.getEnabledModulesLabel()}`

        const elSources = document.getElementById('sr-config-sources')
        if (elSources) elSources.textContent = `Sources: ${this.getEnabledSourcesLabel()}`

        const elMode = document.getElementById('sr-config-mode')
        if (elMode) elMode.textContent = `Mode: ${this.getModeLabel()}`

        // Update Logs
        const logsContainer = document.getElementById('sr-logs-container')
        if (logsContainer) {
            logsContainer.innerHTML = this.logs.slice(0, 8).map(l => {
                const color = l.type === 'success' ? '#34d399' : l.type === 'warning' ? '#fbbf24' : '#94a3b8'
                return `<div style="display:flex; gap: 8px;">
                    <span style="color: #64748b;">${this.escapeHtml(l.time)}</span>
                    <span style="color: ${color};">${this.escapeHtml(l.msg)}</span>
                </div>`
            }).join('')
        }
    }

    private showAuditOverlay() {
        if (document.getElementById('social-radar-overlay')) return

        const overlay = document.createElement('div')
        overlay.id = 'social-radar-overlay'
        overlay.style.position = 'fixed'
        overlay.style.top = '0'
        overlay.style.left = '0'
        overlay.style.width = '100vw'
        overlay.style.height = '100vh'
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.95)'
        overlay.style.zIndex = '999999'
        overlay.style.display = 'flex'
        overlay.style.flexDirection = 'column'
        overlay.style.alignItems = 'center'
        overlay.style.justifyContent = 'center'
        overlay.style.color = '#fff'
        overlay.style.fontFamily = 'system-ui, -apple-system, sans-serif'
        overlay.style.backdropFilter = 'blur(10px)'

        overlay.innerHTML = `
            <div style="text-align: center; animation: pulse 2s infinite;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 24px;">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <h1 style="font-size: 24px; font-weight: 900; letter-spacing: 0.1em; margin-bottom: 16px; color: #38bdf8;">ANÃLISIS EN PROGRESO</h1>
                <p style="font-size: 14px; font-weight: 500; color: #94a3b8; max-width: 400px; line-height: 1.6;">
                    Estamos recopilando mÃ©tricas y analizando tu perfil.
                    <br/>
                    <strong style="color: #f43f5e; display: block; margin-top: 12px;">POR FAVOR NO TOQUES NADA</strong>
                </p>
            </div>
            <style>
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { opacity: 1; }
                }
            </style>
        `

        document.body.appendChild(overlay)
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

    private async isDeadAccountFromDom(deadDays: number): Promise<boolean | null> {
        try {
            const postTime = document.querySelector('article time') as HTMLTimeElement | null
            if (!postTime?.dateTime) {
                // If there are no posts, it is considered inactive for cleanup.
                const hasPosts = !!document.querySelector('article a[href*="/p/"], article a[href*="/reel/"]')
                if (!hasPosts) return true
                return null
            }

            const lastPostMs = new Date(postTime.dateTime).getTime()
            if (!Number.isFinite(lastPostMs)) return null
            const days = (Date.now() - lastPostMs) / 86400000
            return days >= deadDays
        } catch {
            return null
        }
    }

    private async tryPostComment(container: ParentNode): Promise<boolean> {
        try {
            const input = container.querySelector('textarea[aria-label*="comment" i], textarea[placeholder*="comment" i], textarea[aria-label*="coment" i]') as HTMLTextAreaElement | null
            if (!input) return false

            const savedTemplates = await storage.get<string[]>(this.pKey("commentTemplates"))
            const templates = (savedTemplates && savedTemplates.length > 0) ? savedTemplates : this.getCommentTemplates()
            const text = templates[Math.floor(Math.random() * templates.length)]
            if (!text) return false

            input.focus()
            input.value = text
            input.dispatchEvent(new Event("input", { bubbles: true }))
            input.dispatchEvent(new Event("change", { bubbles: true }))
            await this.sleep(500)

            const buttons = Array.from(container.querySelectorAll('button'))
            const postBtn = buttons.find((b) => {
                const t = (b.textContent || "").toLowerCase().trim()
                return t === "post" || t === "publicar"
            })
            if (!postBtn || (postBtn as HTMLButtonElement).disabled) return false

            ;(postBtn as HTMLElement).click()
            await this.sleep(800)
            this.addLog("Comment posted", "success")
            await this.updateHealth({ lastAction: "comment_posted", lastActionAt: Date.now() })
            return true
        } catch (e) {
            await this.recordError(e, "tryPostComment")
            return false
        }
    }

    private getEnabledModulesLabel(): string {
        const modules = [
            this.config.likeEnabled ? "Likes" : "",
            this.config.followEnabled ? "Follows" : "",
            this.config.unfollowEnabled ? "Unfollows" : "",
            this.config.dmEnabled ? "Comments/DM" : ""
        ].filter(Boolean)
        return modules.length > 0 ? modules.join(" | ") : "None"
    }

    private getEnabledSourcesLabel(): string {
        const sources = [
            this.config.sourceHashtags ? "Hashtags" : "",
            this.config.sourceCompetitors ? "Competitors" : "",
            this.config.unfollowEnabled ? "Unfollow Queue" : ""
        ].filter(Boolean)
        return sources.length > 0 ? sources.join(" | ") : "None"
    }

    private getModeLabel(): string {
        const mode = [
            this.config.continuousSession ? "Continuous ON" : "Continuous OFF",
            this.config.sleepEnabled ? `Sleep ${this.config.sleepStart} +${this.config.sleepDuration}h` : "Sleep OFF",
            this.config.chaosEnabled ? "Chaos ON" : "Chaos OFF"
        ]
        return mode.join(" | ")
    }

    private isSleepTime(): boolean {
        if (!this.config.sleepEnabled || !this.config.sleepStart) return false

        const now = new Date()
        const [startH, startM] = this.config.sleepStart.split(':').map(Number)
        const duration = Number(this.config.sleepDuration) || 8

        const startTime = new Date(now)
        startTime.setHours(startH, startM, 0)

        const endTime = new Date(startTime)
        endTime.setHours(startTime.getHours() + duration)

        // Handle overnight sleep (e.g. 23:00 to 07:00)
        if (endTime < startTime) {
            // This case shouldn't happen with setHours adding hours, 
            // but if endTime is on the next day, it works fine.
        }

        const currentTime = now.getTime()
        const startTs = startTime.getTime()
        const endTs = endTime.getTime()

        // If end is tomorrow (e.g. 23:00 + 8h = 07:00 tomorrow)
        if (endTs > startTs) {
            // Standard case: sleep doesn't cross midnight OR we are in the start-to-end window
            if (currentTime >= startTs && currentTime < endTs) return true

            // Handle the case where we are already on the "next day" but still within sleep window
            // (e.g. it's 02:00, sleep started 23:00 yesterday)
            const yesterdayStart = new Date(startTime)
            yesterdayStart.setDate(yesterdayStart.getDate() - 1)
            const yesterdayEnd = new Date(endTime)
            yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)
            if (currentTime >= yesterdayStart.getTime() && currentTime < yesterdayEnd.getTime()) return true
        }

        return false
    }
}

new InstagramBot()


