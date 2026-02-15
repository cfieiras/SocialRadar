import { Storage } from "@plasmohq/storage"
import { refreshUserProfile } from "./lib/instagramApi"

const storage = new Storage()

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
    // ... existing init ...
    const isRunning = await storage.get("isRunning")
    if (isRunning === undefined) await storage.set("isRunning", false)

    const stats = await storage.get("stats")
    if (!stats) await storage.set("stats", { follows: 0, likes: 0, dms: 0, unfollows: 0 })

    // Set up refresh alarm (every 12 hours)
    chrome.alarms.create("REFRESH_STATS", { periodInMinutes: 720 })

    // Set up daily reset alarm for continuous sessions (every 24 hours at midnight)
    chrome.alarms.create("DAILY_RESET", { periodInMinutes: 1440 })

    // Initial refresh
    refreshUserProfile()

    console.log("GrowthBot: Background service worker initialized with continuous session support")
})

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "REFRESH_STATS") {
        console.log("GrowthBot: Alarm triggered - Refreshing stats...")
        refreshUserProfile()
    }
    
    if (alarm.name === "DAILY_RESET") {
        console.log("GrowthBot: Daily reset alarm - Preparing for new session day...")
        // Reset daily counters for continuous sessions
        storage.set("lastNavTime", 0)
        storage.set("dailyResetTimestamp", Date.now())
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
})

export { }
