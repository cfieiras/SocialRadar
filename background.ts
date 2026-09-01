import { Storage } from "@plasmohq/storage"
import { refreshUserProfile, reportCriticalError, syncStatsToSupabase, storeCurrentUserProfile, type InstagramProfile } from "./lib/instagramApi"

const storage = new Storage()

function getMsUntilMidnight(): number {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0)
    return Math.max(1000, midnight.getTime() - now.getTime())
}

async function ensureBackgroundState() {
    const isRunning = await storage.get("isRunning")
    if (isRunning === undefined) await storage.set("isRunning", false)

    const stats = await storage.get("stats")
    if (!stats) await storage.set("stats", { follows: 0, likes: 0, dms: 0, unfollows: 0 })

    // Set up refresh alarm (every 12 hours)
    chrome.alarms.create("REFRESH_STATS", { periodInMinutes: 720 })

    // Set up daily reset alarm targeting local midnight
    chrome.alarms.create("DAILY_RESET", {
        when: Date.now() + getMsUntilMidnight(),
        periodInMinutes: 1440
    })
}

async function safeRefreshProfile() {
    try {
        const currentHealth = (await storage.get("systemHealth")) as Record<string, any> || {}
        await storage.set("systemHealth", {
            ...currentHealth,
            lastBackgroundRefreshAt: Date.now(),
            lastBackgroundRefreshStatus: "running"
        })
        await refreshUserProfile()
        const updatedHealth = (await storage.get("systemHealth")) as Record<string, any> || {}
        await storage.set("systemHealth", {
            ...updatedHealth,
            lastBackgroundRefreshAt: Date.now(),
            lastBackgroundRefreshStatus: "ok"
        })
    } catch (error) {
        console.error("SocialRadar: Failed to refresh profile in background", error)
        const errHealth = (await storage.get("systemHealth")) as Record<string, any> || {}
        await storage.set("systemHealth", {
            ...errHealth,
            lastBackgroundRefreshAt: Date.now(),
            lastBackgroundRefreshStatus: "error",
            lastBackgroundError: error instanceof Error ? error.message : String(error)
        })
        await reportCriticalError({
            area: "background_refresh_profile",
            error,
            appSurface: "background_worker"
        })
    }
}

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
    await ensureBackgroundState()
    await safeRefreshProfile()
    console.log("SocialRadar: Background service worker initialized with continuous session support")
})

chrome.runtime.onStartup.addListener(async () => {
    await ensureBackgroundState()
})

// Listen for alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "REFRESH_STATS") {
        console.log("SocialRadar: Alarm triggered - Refreshing stats...")
        await safeRefreshProfile()
    }
    
    if (alarm.name === "DAILY_RESET") {
        console.log("SocialRadar: Daily reset alarm - Preparing for new session day...")
        await storage.set("lastNavTime", 0)
        await storage.set("dailyResetTimestamp", Date.now())

        const keys = await storage.getAll()
        const today = new Date().toDateString()
        for (const key of Object.keys(keys)) {
            if (key.endsWith("_sessionLikes") || key.endsWith("_sessionFollows") || key.endsWith("_sessionUnfollows") || key.endsWith("_sessionComments")) {
                await storage.set(key, 0)
            }
            if (key.endsWith("_sessionDayMarker")) {
                await storage.set(key, today)
            }
        }

        const dailyResetHealth = (await storage.get("systemHealth")) as Record<string, any> || {}
        await storage.set("systemHealth", {
            ...dailyResetHealth,
            lastDailyResetAt: Date.now()
        })
    }
})

// Listen for messages if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_TABS") {
        chrome.tabs.query({ url: "*://*.instagram.com/*" }, (tabs) => {
            sendResponse({ tabs })
        })
        return true
    }

    if (request.action === "SYNC_STATS") {
        const payload = request.payload as InstagramProfile | undefined

        if (!payload?.username) {
            sendResponse({ ok: false, error: "Missing profile payload" })
            return false
        }

        (async () => {
            try {
                await storeCurrentUserProfile(payload)
                await syncStatsToSupabase(payload)
                sendResponse({ ok: true })
            } catch (error) {
                console.error("SocialRadar: SYNC_STATS failed", error)
                void reportCriticalError({
                    area: "background_sync_stats_message",
                    error,
                    appSurface: "background_worker",
                    instagramUsername: payload.username
                })
                sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown sync error" })
            }
        })()

        return true
    }
})

export { }
