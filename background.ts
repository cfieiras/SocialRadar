import { Storage } from "@plasmohq/storage"
import { refreshUserProfile, syncStatsToSupabase, type InstagramProfile } from "./lib/instagramApi"

const storage = new Storage()

async function ensureBackgroundState() {
    const isRunning = await storage.get("isRunning")
    if (isRunning === undefined) await storage.set("isRunning", false)

    const stats = await storage.get("stats")
    if (!stats) await storage.set("stats", { follows: 0, likes: 0, dms: 0, unfollows: 0 })

    // Set up refresh alarm (every 12 hours)
    chrome.alarms.create("REFRESH_STATS", { periodInMinutes: 720 })

    // Set up daily reset alarm for continuous sessions (every 24 hours at midnight)
    chrome.alarms.create("DAILY_RESET", { periodInMinutes: 1440 })
}

async function safeRefreshProfile() {
    try {
        await storage.set("systemHealth", {
            ...(await storage.get("systemHealth") || {}),
            lastBackgroundRefreshAt: Date.now(),
            lastBackgroundRefreshStatus: "running"
        })
        await refreshUserProfile()
        await storage.set("systemHealth", {
            ...(await storage.get("systemHealth") || {}),
            lastBackgroundRefreshAt: Date.now(),
            lastBackgroundRefreshStatus: "ok"
        })
    } catch (error) {
        console.error("GrowthBot: Failed to refresh profile in background", error)
        await storage.set("systemHealth", {
            ...(await storage.get("systemHealth") || {}),
            lastBackgroundRefreshAt: Date.now(),
            lastBackgroundRefreshStatus: "error",
            lastBackgroundError: error instanceof Error ? error.message : String(error)
        })
    }
}

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
    await ensureBackgroundState()
    await safeRefreshProfile()
    console.log("GrowthBot: Background service worker initialized with continuous session support")
})

chrome.runtime.onStartup.addListener(async () => {
    await ensureBackgroundState()
})

// Listen for alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "REFRESH_STATS") {
        console.log("GrowthBot: Alarm triggered - Refreshing stats...")
        await safeRefreshProfile()
    }
    
    if (alarm.name === "DAILY_RESET") {
        console.log("GrowthBot: Daily reset alarm - Preparing for new session day...")
        // Reset daily counters for continuous sessions
        await storage.set("lastNavTime", 0)
        await storage.set("dailyResetTimestamp", Date.now())
        await storage.set("systemHealth", {
            ...(await storage.get("systemHealth") || {}),
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

        void syncStatsToSupabase(payload)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => {
                console.error("GrowthBot: SYNC_STATS failed", error)
                sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown sync error" })
            })

        return true
    }
})

export { }
