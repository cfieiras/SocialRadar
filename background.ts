import { Storage } from "@plasmohq/storage"

const storage = new Storage()

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
    const isRunning = await storage.get("isRunning")
    if (isRunning === undefined) {
        await storage.set("isRunning", false)
    }

    const stats = await storage.get("stats")
    if (!stats) {
        await storage.set("stats", { follows: 0, likes: 0, dms: 0 })
    }

    const hashtags = await storage.get("targetHashtags")
    if (!hashtags) {
        await storage.set("targetHashtags", ["#digitalmarketing", "#entrepreneur"])
    }

    const competitors = await storage.get("targetCompetitors")
    if (!competitors) {
        await storage.set("targetCompetitors", [])
    }

    const logs = await storage.get("logs")
    if (!logs) {
        await storage.set("logs", [{ time: new Date().toLocaleTimeString(), msg: "System initialized", type: "info" }])
    }

    console.log("GrowthBot: Background service worker initialized")
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
