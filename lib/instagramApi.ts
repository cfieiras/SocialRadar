import { Storage } from "@plasmohq/storage"
import { supabase } from "./supabaseClient"

const storage = new Storage({
    area: "local"
})

const accountKey = (username: string, key: string) => `${username}_${key}`
const STABLE_HISTORY_TABLE = "account_daily_snapshots"
const LEGACY_HISTORY_TABLE = "follower_history"
const AUDIENCE_DATABASE_TABLE = "audience_database_entries"
const INTERACTION_HISTORY_TABLE = "bot_interaction_history"
const ACCOUNT_SETTINGS_TABLE = "bot_account_settings"

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

type DailySnapshotRow = {
    snapshot_date?: string
    captured_at?: string
    created_at?: string
    followers?: number
    following?: number
    posts?: number
    trust_score?: number | null
    engagement_rate?: number | null
    follower_count?: number
    following_count?: number
    posts_count?: number
    account_trust_score?: number | null
}

export function sanitizeImageUrl(url?: string | null): string {
    if (!url) return ""
    return String(url).replace(/\\u0026/g, '&').replace(/\\/g, '').trim()
}

export function extractBestAvatarUrl(user?: Record<string, any> | null, fallbackUrl?: string | null): string {
    const candidate = user?.profile_pic_url_hd ||
        user?.profile_pic_url ||
        user?.profilePicUrl ||
        user?.hd_profile_pic_url_info?.url ||
        user?.profile_pic_url_info?.url ||
        fallbackUrl ||
        ""

    return sanitizeImageUrl(candidate)
}

export function resolveStoredAvatarUrl(profile?: Pick<InstagramProfile, "avatarDisplayUrl" | "avatarUrl"> | null): string {
    return sanitizeImageUrl(profile?.avatarDisplayUrl || profile?.avatarUrl || "")
}

export interface InstagramProfile {
    username: string
    fullName: string
    avatarUrl: string
    avatarDisplayUrl?: string
    bio: string
    stats: {
        posts: number
        followers: number
        following: number
    }
    isVerified: boolean
    timestamp: number
    id: string
    latestPosts: {
        id: string
        url: string
        likes: number
        comments: number
        timestamp: number
        shortcode: string
    }[]
    engagementRate: number
    trustScore: number
    growthVelocity: number
}

export interface Unfollower {
    username: string
    full_name: string
    avatar_url: string
    detected_at: string
}

export interface AudienceDatabaseEntry {
    username: string
    url: string
    timestamp: number
    dateStr: string
    protected?: boolean
    unfollowFailed?: boolean
}

interface CriticalErrorPayload {
    area: string
    error: unknown
    appSurface?: string
    instagramUsername?: string | null
    context?: Record<string, unknown>
}

export async function getStoredCurrentUserProfile(username?: string): Promise<InstagramProfile | null> {
    if (username) {
        return await storage.get<InstagramProfile>(accountKey(username, "currentUserStats")) || null
    }

    return await storage.get<InstagramProfile>("currentUserStats") || null
}

export async function reportCriticalError(payload: CriticalErrorPayload) {
    try {
        const currentProfile = await getStoredCurrentUserProfile(payload.instagramUsername || undefined)
        const { data: { session } } = await supabase.auth.getSession()
        const runtimeVersion = typeof chrome !== "undefined" && chrome.runtime?.getManifest
            ? chrome.runtime.getManifest().version
            : null

        const error = payload.error instanceof Error ? payload.error : new Error(String(payload.error ?? "Unknown error"))

        const { error: insertError } = await supabase
            .from("critical_error_logs")
            .insert({
                user_id: session?.user?.id || null,
                instagram_username: payload.instagramUsername || currentProfile?.username || null,
                area: payload.area,
                message: error.message,
                stack_trace: error.stack || null,
                app_surface: payload.appSurface || "extension",
                severity: "critical",
                extension_version: runtimeVersion,
                context: payload.context || {}
            })

        if (insertError) {
            console.warn("Telemetry: failed to persist critical error", insertError.message || insertError)
        }
    } catch (telemetryError) {
        console.warn("Telemetry: reporting pipeline failed", telemetryError)
    }
}

function normalizeAudienceDatabaseEntries(entries: AudienceDatabaseEntry[] = []): AudienceDatabaseEntry[] {
    const byUsername = new Map<string, AudienceDatabaseEntry>()

    for (const rawEntry of entries) {
        const username = String(rawEntry?.username || "").trim().replace(/^@/, "")
        if (!username) continue

        const normalizedUsername = username.toLowerCase()
        const timestamp = Number(rawEntry?.timestamp || Date.now())
        const existing = byUsername.get(normalizedUsername)

        if (existing && (existing.timestamp || 0) >= timestamp) continue

        byUsername.set(normalizedUsername, {
            username,
            url: sanitizeImageUrl(String(rawEntry?.url || "").split('?')[0].replace(/\/$/, "").toLowerCase()),
            timestamp,
            dateStr: rawEntry?.dateStr || new Date(timestamp).toLocaleDateString(),
            protected: !!rawEntry?.protected,
            unfollowFailed: !!rawEntry?.unfollowFailed
        })
    }

    return Array.from(byUsername.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

export async function fetchAudienceDatabaseFromSupabase(instagramUsername?: string): Promise<AudienceDatabaseEntry[]> {
    if (!instagramUsername) return []

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return []

        const { data, error } = await supabase
            .from(AUDIENCE_DATABASE_TABLE)
            .select('target_username, target_url, captured_at, captured_date_str, is_protected, unfollow_failed')
            .eq('user_id', session.user.id)
            .eq('instagram_username', instagramUsername)
            .order('captured_at', { ascending: false })

        if (error) {
            console.warn("Audience DB: failed to fetch from Supabase", error.message || error)
            return []
        }

        return normalizeAudienceDatabaseEntries((data || []).map((row: any) => ({
            username: row.target_username,
            url: row.target_url,
            timestamp: row.captured_at ? new Date(row.captured_at).getTime() : Date.now(),
            dateStr: row.captured_date_str || "",
            protected: !!row.is_protected,
            unfollowFailed: !!row.unfollow_failed
        })))
    } catch (error) {
        console.warn("Audience DB: fetch pipeline failed", error)
        return []
    }
}

export async function syncAudienceDatabaseToSupabase(instagramUsername: string, entries: AudienceDatabaseEntry[] = []): Promise<boolean> {
    if (!instagramUsername) return false

    const normalizedEntries = normalizeAudienceDatabaseEntries(entries)
    await storage.set(accountKey(instagramUsername, "followedUsers"), normalizedEntries)

    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return false

        const { error: deleteError } = await supabase
            .from(AUDIENCE_DATABASE_TABLE)
            .delete()
            .eq('user_id', session.user.id)
            .eq('instagram_username', instagramUsername)

        if (deleteError) {
            console.warn("Audience DB: failed to clear previous rows", deleteError.message || deleteError)
            return false
        }

        if (normalizedEntries.length === 0) return true

        const payload = normalizedEntries.map((entry) => ({
            user_id: session.user.id,
            instagram_username: instagramUsername,
            target_username: entry.username.toLowerCase(),
            target_url: entry.url,
            captured_at: new Date(entry.timestamp || Date.now()).toISOString(),
            captured_date_str: entry.dateStr,
            is_protected: !!entry.protected,
            unfollow_failed: !!entry.unfollowFailed
        }))

        const batchSize = 200
        for (let i = 0; i < payload.length; i += batchSize) {
            const chunk = payload.slice(i, i + batchSize)
            const { error: insertError } = await supabase
                .from(AUDIENCE_DATABASE_TABLE)
                .insert(chunk)

            if (insertError) {
                console.warn("Audience DB: failed to insert rows", insertError.message || insertError)
                return false
            }
        }

        return true
    } catch (error) {
        console.warn("Audience DB: sync pipeline failed", error)
        return false
    }
}

export async function syncInteractionHistoryToSupabase(instagramUsername: string, history: InteractionRecord[] = []): Promise<boolean> {
    if (!instagramUsername) return false
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return false

        const cleanUsername = instagramUsername.toLowerCase()
        const payload = history.slice(0, 500).map((record) => ({
            id: record.id || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            user_id: session.user.id,
            instagram_username: cleanUsername,
            target_username: (record.username || "").toLowerCase(),
            action: record.action,
            target_url: record.url || null,
            details: record.details || null,
            date_str: record.dateStr || new Date().toISOString().split('T')[0],
            time_str: record.timeStr || new Date().toLocaleTimeString(),
            created_at: new Date(record.timestamp || Date.now()).toISOString()
        }))

        if (payload.length === 0) return true

        const { error } = await supabase
            .from(INTERACTION_HISTORY_TABLE)
            .upsert(payload, { onConflict: 'id' })

        if (error && !String(error.message || "").toLowerCase().includes("does not exist")) {
            console.warn("Interaction History DB: sync error", error.message || error)
            return false
        }
        return true
    } catch (error) {
        console.warn("Interaction History DB: sync pipeline failed", error)
        return false
    }
}

export async function fetchInteractionHistoryFromSupabase(instagramUsername: string): Promise<InteractionRecord[]> {
    if (!instagramUsername) return []
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return []

        const { data, error } = await supabase
            .from(INTERACTION_HISTORY_TABLE)
            .select('id, target_username, action, created_at, date_str, time_str, target_url, details')
            .eq('user_id', session.user.id)
            .eq('instagram_username', instagramUsername.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1000)

        if (error) {
            console.warn("Interaction History DB: fetch error", error.message || error)
            return []
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            username: row.target_username,
            action: row.action,
            timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            dateStr: row.date_str || "",
            timeStr: row.time_str || "",
            url: row.target_url || undefined,
            details: row.details || undefined
        }))
    } catch (error) {
        console.warn("Interaction History DB: fetch pipeline failed", error)
        return []
    }
}

export async function syncAccountSettingsToSupabase(instagramUsername: string, settings: {
    config?: any
    delays?: any
    targetHashtags?: string[]
    targetCompetitors?: string[]
    targetPostUrls?: string[]
    commentTemplates?: string[]
}): Promise<boolean> {
    if (!instagramUsername) return false
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return false

        const cleanUsername = instagramUsername.toLowerCase()
        const payload = {
            user_id: session.user.id,
            instagram_username: cleanUsername,
            config: settings.config || {},
            delays: settings.delays || {},
            target_hashtags: settings.targetHashtags || [],
            target_competitors: settings.targetCompetitors || [],
            target_post_urls: settings.targetPostUrls || [],
            comment_templates: settings.commentTemplates || [],
            updated_at: new Date().toISOString()
        }

        const { error } = await supabase
            .from(ACCOUNT_SETTINGS_TABLE)
            .upsert(payload, { onConflict: 'user_id,instagram_username' })

        if (error && !String(error.message || "").toLowerCase().includes("does not exist")) {
            console.warn("Account Settings DB: sync error", error.message || error)
            return false
        }
        return true
    } catch (error) {
        console.warn("Account Settings DB: sync pipeline failed", error)
        return false
    }
}

export async function fetchAccountSettingsFromSupabase(instagramUsername: string): Promise<any | null> {
    if (!instagramUsername) return null
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return null

        const { data, error } = await supabase
            .from(ACCOUNT_SETTINGS_TABLE)
            .select('config, delays, target_hashtags, target_competitors, target_post_urls, comment_templates')
            .eq('user_id', session.user.id)
            .eq('instagram_username', instagramUsername.toLowerCase())
            .single()

        if (error || !data) return null

        return {
            config: data.config,
            delays: data.delays,
            targetHashtags: data.target_hashtags,
            targetCompetitors: data.target_competitors,
            targetPostUrls: data.target_post_urls,
            commentTemplates: data.comment_templates
        }
    } catch (error) {
        console.warn("Account Settings DB: fetch pipeline failed", error)
        return null
    }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "")
        reader.onerror = () => reject(reader.error || new Error("Failed to read avatar blob"))
        reader.readAsDataURL(blob)
    })
}

async function buildAvatarDisplayUrl(url?: string | null): Promise<string> {
    const sanitized = sanitizeImageUrl(url)
    if (!sanitized || sanitized.startsWith("data:")) return sanitized

    try {
        const response = await fetch(sanitized, {
            credentials: "include",
            cache: "no-store"
        })

        if (!response.ok) return sanitized

        const blob = await response.blob()
        if (!blob.size || blob.size > 1024 * 1024) return sanitized

        return await blobToDataUrl(blob)
    } catch {
        return sanitized
    }
}

export async function storeCurrentUserProfile<T extends InstagramProfile>(profile: T) {
    const avatarUrl = extractBestAvatarUrl(profile, profile.avatarUrl)
    const avatarDisplayUrl = await buildAvatarDisplayUrl(profile.avatarDisplayUrl || avatarUrl)
    const enrichedProfile = {
        ...profile,
        avatarUrl,
        avatarDisplayUrl
    }

    await storage.set("currentUserStats", enrichedProfile)
    await storage.set(accountKey(profile.username, "currentUserStats"), enrichedProfile)
}

/**
 * Fetches the current logged-in user's profile information from Instagram.
 */
/**
 * Detects the username currently logged in on Instagram.
 */
export async function detectActiveUsername(): Promise<string | null> {
    try {
        const res = await fetch("https://www.instagram.com/", {
            headers: { 'User-Agent': navigator.userAgent }
        })
        const html = await res.text()
        const match = html.match(/"username":"([^"]+)"/) ||
            html.match(/\\u0022username\\u0022:\\u0022([^\\u0022]+)\\u0022/)

        if (match && match[1]) {
            return match[1].replace(/\\/g, '')
        }
    } catch (e) {
        console.warn("IG API: Username detection fetch failed", e)
    }
}

function parseAbbreviatedCount(str?: string | null): number {
    if (!str) return 0
    const clean = String(str).replace(/,/g, '').trim()
    if (/k$/i.test(clean)) return Math.round(parseFloat(clean) * 1000)
    if (/m$/i.test(clean)) return Math.round(parseFloat(clean) * 1000000)
    if (/b$/i.test(clean)) return Math.round(parseFloat(clean) * 1000000000)
    return parseInt(clean, 10) || 0
}

async function scrapeProfileFromHtml(username: string): Promise<InstagramProfile | null> {
    try {
        console.log(`IG API: Attempting HTML profile scrape for @${username}...`)
        const res = await fetch(`https://www.instagram.com/${username}/`, { credentials: 'include' })
        if (!res.ok) return null
        const html = await res.text()

        let followers = 0
        let following = 0
        let posts = 0
        let fullName = username
        let bio = ""
        let avatarUrl = `https://ui-avatars.com/api/?name=${username}&background=0f172a&color=fff`

        // 1. Meta Description Regex (Works on ALL Instagram public profiles)
        const metaMatch = html.match(/content=["']([^"']*?Followers[^"']*?)["']/i) ||
            html.match(/content=["']([^"']*?seguidores[^"']*?)["']/i) ||
            html.match(/meta name=["']description["'] content=["']([^"']+)["']/i)

        if (metaMatch) {
            const desc = metaMatch[1]
            const fMatch = desc.match(/([0-9.,KMBkmb]+)\s+(?:Followers|seguidores)/i)
            const fgMatch = desc.match(/([0-9.,KMBkmb]+)\s+(?:Following|seguidos)/i)
            const pMatch = desc.match(/([0-9.,KMBkmb]+)\s+(?:Posts|publicaciones)/i)

            if (fMatch) followers = parseAbbreviatedCount(fMatch[1])
            if (fgMatch) following = parseAbbreviatedCount(fgMatch[1])
            if (pMatch) posts = parseAbbreviatedCount(pMatch[1])
        }

        // 2. Embedded JSON scripts
        const scriptMatches = [...html.matchAll(/<script type="application\/json"[^>]*>(.*?)<\/script>/gs)]
        for (const match of scriptMatches) {
            try {
                const parsed = JSON.parse(match[1])
                const u = parsed?.graphql?.user || parsed?.require?.[0]?.[3]?.[0]?.user || parsed?.user
                if (u) {
                    if (u.full_name) fullName = u.full_name
                    if (u.biography) bio = u.biography
                    if (u.profile_pic_url_hd || u.profile_pic_url) avatarUrl = u.profile_pic_url_hd || u.profile_pic_url
                    if (u.edge_followed_by?.count) followers = u.edge_followed_by.count
                    if (u.edge_follow?.count) following = u.edge_follow.count
                    if (u.edge_owner_to_timeline_media?.count) posts = u.edge_owner_to_timeline_media.count
                }
            } catch (e) { }
        }

        // 3. Extract posts media shortcodes/urls
        const postMatches = [...html.matchAll(/"shortcode":"([^"]+)".*?"display_url":"([^"]+)"/g)]
        const latestPosts = postMatches.slice(0, 12).map((m, i) => ({
            id: m[1] || `scraped_${i}`,
            url: sanitizeImageUrl(m[2]),
            likes: 0,
            comments: 0,
            timestamp: Date.now() / 1000,
            shortcode: m[1]
        }))

        return {
            username,
            fullName,
            avatarUrl: sanitizeImageUrl(avatarUrl),
            bio,
            stats: { followers, posts, following },
            isVerified: false,
            timestamp: Date.now(),
            id: `scraped_${username}`,
            latestPosts,
            engagementRate: 0,
            trustScore: 50,
            growthVelocity: 0
        }
    } catch (e) {
        console.warn(`IG API: Scrape profile fallback failed for @${username}`, e)
        return null
    }
}

export async function refreshUserProfile(targetUsername?: string): Promise<InstagramProfile | null> {
    try {
        console.log(`IG API: Starting profile refresh for ${targetUsername || 'self'}...`)

        // 0. Get CSRF Token from cookies
        const cookies = await chrome.cookies.getAll({ domain: ".instagram.com" })
        const csrfToken = cookies.find(c => c.name === "csrftoken")?.value || ""
        const sessionid = cookies.find(c => c.name === "sessionid")?.value || ""

        console.log(`IG API: Session check -> CSRF: ${!!csrfToken}, Session: ${!!sessionid}`)
        if (!sessionid) console.warn("IG API: No active Instagram session. Media extraction will likely fail.")

        // 1. Get Username (Detect if not provided)
        let username = targetUsername
        if (!username) {
            username = await storage.get<string>("lastKnownUsername")
            const detected = await detectActiveUsername()
            if (detected) {
                username = detected
                await storage.set("lastKnownUsername", username)
            }
        }

        if (!username) return null

        // 2. Fetch full profile
        let user: any = null
        try {
            const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`
            const response = await fetch(apiUrl, {
                headers: {
                    'x-ig-app-id': '936619743392459',
                    'x-requested-with': 'XMLHttpRequest',
                    'x-csrftoken': csrfToken
                },
                credentials: 'include'
            })

            if (response.ok) {
                const resData = await response.json()
                user = resData.data?.user
            }
        } catch (e) {
            console.warn(`IG API: web_profile_info failed for @${username}`, e)
        }

        if (!user) {
            console.log(`IG API: web_profile_info returned no user for @${username}, falling back to HTML profile scraping...`)
            return await scrapeProfileFromHtml(username)
        }

        console.log("IG API: Fetched user data for", user.username)

        let avatarUrl = extractBestAvatarUrl(user)

        // 2. Extract media/posts data
        let mediaEdges = user.edge_owner_to_timeline_media?.edges ||
            user.edge_felix_combined_post_uploads?.edges ||
            user.edge_owner_to_video_posts?.edges || []

        // PLAN B: If no media found in profile, try the Profile Grid API (More reliable)
        if (mediaEdges.length === 0 && user.id) {
            try {
                console.log("IG API: Media edges empty, trying Profile Grid fallback...")
                const gridUrl = `https://www.instagram.com/api/v1/feed/user/${user.id}/profile_grid/`
                const gridRes = await fetch(gridUrl, {
                    headers: {
                        'x-ig-app-id': '936619743392459',
                        'x-requested-with': 'XMLHttpRequest',
                        'x-csrftoken': csrfToken
                    },
                    credentials: 'include'
                })
                if (gridRes.ok) {
                    const gridData = await gridRes.json()
                    console.log("IG API: Profile Grid data received", gridData)
                    const items = gridData.items || []
                    if (items.length > 0) {
                        mediaEdges = items.map((item: any) => ({
                            node: {
                                id: item.id,
                                display_url: item.image_versions2?.candidates?.[0]?.url ||
                                    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
                                    item.video_versions?.[0]?.url,
                                edge_liked_by: { count: item.like_count || item.fb_like_count || 0 },
                                edge_media_to_comment: { count: item.comment_count || 0 },
                                taken_at_timestamp: item.taken_at,
                                shortcode: item.code
                            }
                        }))
                    }
                }

                // PLAN C: GraphQL Query (Ultra Stable)
                if (mediaEdges.length === 0 && user.id) {
                    try {
                        console.log("IG API: Trying GraphQL fallback...")
                        // query_hash for profile timeline media
                        const queryHash = '69cba2a860146039ad775e7a9736f56b'
                        const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(JSON.stringify({ id: user.id, first: 12 }))}`
                        const gqlRes = await fetch(gqlUrl, { credentials: 'include' })
                        if (gqlRes.ok) {
                            const gqlData = await gqlRes.json()
                            mediaEdges = gqlData.data?.user?.edge_owner_to_timeline_media?.edges || []
                            console.log(`IG API: GraphQL found ${mediaEdges.length} items`)
                        }
                    } catch (e) {
                        console.warn("IG API: GraphQL fallback failed", e)
                    }
                }

                // PLAN D: HTML Scraping (The ultimate fallback - Regex Bruteforce)
                if (mediaEdges.length === 0) {
                    console.log("IG API: Still empty, trying HTML Scraping v3...")
                    const profileRes = await fetch(`https://www.instagram.com/${username}/`, { credentials: 'include' })
                    const html = await profileRes.text()

                    // Pattern 1: Look for shortcodes and display_urls together (standard JSON in HTML)
                    const matches = [...html.matchAll(/"shortcode":"([^"]+)".*?"display_url":"([^"]+)"/g)]

                    if (matches.length > 0) {
                        console.log(`IG API: Scraper found ${matches.length} potential posts via JSON pattern`)
                        mediaEdges = matches.slice(0, 12).map(m => ({
                            node: {
                                id: m[1],
                                shortcode: m[1],
                                display_url: sanitizeImageUrl(m[2]),
                                edge_liked_by: { count: 0 },
                                edge_media_to_comment: { count: 0 },
                                taken_at_timestamp: Date.now() / 1000
                            }
                        }))
                    } else {
                        // Pattern 2: Search for any link that looks like a post image (fbcdn.net)
                        const imgMatches = html.match(/https:\/\/scontent[^"]+fbcdn\.net\/v\/[^"]+(_n\.jpg|_n\.webp)/g)
                        if (imgMatches && imgMatches.length > 0) {
                            console.log(`IG API: Scraper found ${imgMatches.length} raw image URLs via fbcdn pattern`)
                            mediaEdges = imgMatches.slice(0, 12).map((url, i) => ({
                                node: {
                                    id: `scraped_${i}`,
                                    shortcode: '',
                                    display_url: sanitizeImageUrl(url),
                                    edge_liked_by: { count: 0 },
                                    edge_media_to_comment: { count: 0 },
                                    taken_at_timestamp: Date.now() / 1000
                                }
                            }))
                        }
                    }
                }
            } catch (e) {
                console.warn("IG API: Fallback chain failed", e)
            }
        }

        console.log(`IG API: Found ${mediaEdges.length} media items`)

        const latestPosts = mediaEdges.map((item: any) => {
            const node = item.node || item
            return {
                id: node.id,
                url: sanitizeImageUrl(node.display_url || node.image_versions2?.candidates?.[0]?.url || node.thumbnail_src),
                likes: node.edge_liked_by?.count || node.like_count || node.edge_media_preview_like?.count || 0,
                comments: node.edge_media_to_comment?.count || node.comment_count || 0,
                timestamp: node.taken_at_timestamp || node.taken_at || node.device_timestamp,
                shortcode: node.shortcode || node.code
            }
        })

        // Calculate engagement rate (based on last 12 posts)
        let engagementRate = 0
        if (latestPosts.length > 0 && user.edge_followed_by?.count > 0) {
            const totalInteractions = latestPosts.reduce((acc: number, post: any) => acc + post.likes + post.comments, 0)
            engagementRate = ((totalInteractions / latestPosts.length) / user.edge_followed_by.count) * 100
        }

        // Calculate Trust Score (0-100)
        let trustScore = 0

        // Only calculate Trust Score if we have valid engagement data. 
        // If ER is 0, it likely means API blocked the likes/comments, so the score would be invalid.
        if (engagementRate > 0) {
            const ratio = user.edge_follow?.count ? (user.edge_followed_by?.count / user.edge_follow?.count) : 0

            // Weights: Engagement (40), Ratio (30), Consistency (30)
            const engWeight = Math.min((engagementRate / 5) * 40, 40) // 5% ER is top tier
            const ratioWeight = Math.min((ratio / 2) * 30, 30) // 2.0 Ratio is top tier
            const postFreq = latestPosts.length >= 3 ? 30 : (latestPosts.length / 3) * 30

            trustScore = Math.round(engWeight + ratioWeight + postFreq)
        }

        // Calculate Velocity (based on last 2 history points)
        const history = await storage.get<any[]>(accountKey(user.username, "followerHistory")) || []
        let growthVelocity = 0
        if (history.length >= 2) {
            const currentGrowth = history[0].followers - history[1].followers
            if (history.length >= 3) {
                const prevGrowth = history[1].followers - history[2].followers
                growthVelocity = prevGrowth !== 0 ? Math.round(((currentGrowth - prevGrowth) / Math.abs(prevGrowth)) * 100) : 0
            }
        }

        const existingProfile = await getStoredCurrentUserProfile(user.username)

        let finalEngagementRate = Number(engagementRate.toFixed(2))
        let finalTrustScore = trustScore
        const hasInteractions = latestPosts.some((p: any) => (p.likes || 0) > 0 || (p.comments || 0) > 0)

        // Avoid overwriting valid metrics with an API snapshot that came back empty/blocked.
        if (!hasInteractions && existingProfile) {
            if (finalEngagementRate === 0 && (existingProfile.engagementRate || 0) > 0) {
                finalEngagementRate = existingProfile.engagementRate
            }
            if (finalTrustScore === 0 && (existingProfile.trustScore || 0) > 0) {
                finalTrustScore = existingProfile.trustScore
            }
        }

        const profileData: InstagramProfile = {
            username: user.username,
            fullName: user.full_name,
            avatarUrl: extractBestAvatarUrl(user, avatarUrl || existingProfile?.avatarUrl || ""),
            bio: user.biography,
            stats: {
                posts: Number(user.edge_owner_to_timeline_media?.count ?? user.edge_felix_combined_post_uploads?.count ?? user.media_count ?? user.posts_count ?? 0),
                followers: Number(user.edge_followed_by?.count ?? user.follower_count ?? user.followers_count ?? 0),
                following: Number(user.edge_follow?.count ?? user.following_count ?? 0)
            },
            isVerified: user.is_verified || false,
            timestamp: Date.now(),
            id: user.id,
            latestPosts: latestPosts,
            engagementRate: finalEngagementRate,
            trustScore: finalTrustScore,
            growthVelocity: growthVelocity
        }

        // 3. Update Storage & History (ONLY if it's the main user)
        if (!targetUsername) {
            await storeCurrentUserProfile(profileData)
            await updateLocalHistory(profileData)
            // await syncStatsToSupabase(profileData) // Disabled auto-sync to prevents zeros. Manual sync only.
        }

        return profileData
    } catch (error) {
        console.error("IG API: Error", error)
        await reportCriticalError({
            area: "refresh_user_profile",
            error,
            appSurface: "extension_api",
            instagramUsername: targetUsername || null,
            context: {
                targetUsername: targetUsername || null
            }
        })
        return null
    }
}

/**
 * Special fetch for competitors that DOES NOT save to currentUserStats
 */
export async function fetchCompetitorProfile(username: string): Promise<InstagramProfile | null> {
    return refreshUserProfile(username)
}

async function updateLocalHistory(profile: InstagramProfile) {
    const historyKey = accountKey(profile.username, "followerHistory")
    const history = await storage.get<any[]>(historyKey) || []
    const today = new Date().toISOString().split('T')[0]

    // Check if we already have an entry for today
    const exists = history.findIndex(h => h.date === today)

    // Prepare new entry
    const newEntry: any = {
        date: today,
        followers: profile.stats.followers,
        following: profile.stats.following,
        engagementRate: profile.engagementRate,
        trustScore: profile.trustScore
    }

    if (exists !== -1) {
        const existing = history[exists]

        // SAFETY CHECK: If this scan failed to get engagement/trust (0), 
        // but we have valid data from earlier today, KEEP the valid data.
        if (newEntry.engagementRate === 0 && existing.engagementRate > 0) {
            newEntry.engagementRate = existing.engagementRate
        }
        if (newEntry.trustScore === 0 && existing.trustScore > 0) {
            newEntry.trustScore = existing.trustScore
        }

        history[exists] = { ...existing, ...newEntry }
    } else {
        history.unshift(newEntry)
    }

    // Keep last 30 days
    await storage.set(historyKey, history.slice(0, 30))
}

export async function syncStatsToSupabase(profile: InstagramProfile) {
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            console.warn("IG API: No Supabase session found. Sync skipped.")
            return
        }

        const today = new Date().toISOString().split('T')[0]
        const stablePayload: any = {
            user_id: session.user.id,
            instagram_username: profile.username,
            snapshot_date: today,
            followers: profile.stats.followers,
            following: profile.stats.following,
            posts: profile.stats.posts,
            captured_at: new Date().toISOString(),
            source: "extension_manual_sync",
            engagement_rate: profile.engagementRate > 0 ? profile.engagementRate : null,
            trust_score: profile.trustScore > 0 ? profile.trustScore : null
        }

        const stableRes = await supabase
            .from(STABLE_HISTORY_TABLE)
            .upsert(stablePayload, {
                onConflict: "user_id,instagram_username,snapshot_date"
            })

        let error = stableRes.error
        let storageMode = "stable"

        if (error && String(error.message || "").toLowerCase().includes(STABLE_HISTORY_TABLE)) {
            console.warn("IG API: Stable history table missing, falling back to follower_history")

            const { data: existingData } = await supabase
                .from(LEGACY_HISTORY_TABLE)
                .select('id')
                .eq('user_id', session.user.id)
                .eq('instagram_username', profile.username)
                .gte('created_at', `${today}T00:00:00`)
                .lt('created_at', `${today}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(1)

            const existing = existingData?.[0]
            const payload: any = {
                user_id: session.user.id,
                instagram_username: profile.username,
                follower_count: profile.stats.followers,
                following_count: profile.stats.following,
                posts_count: profile.stats.posts,
                engagement_rate: profile.engagementRate > 0 ? profile.engagementRate : null,
                account_trust_score: profile.trustScore > 0 ? profile.trustScore : null
            }

            if (existing) {
                const updatePayload: any = {
                    follower_count: profile.stats.followers,
                    following_count: profile.stats.following,
                    posts_count: profile.stats.posts
                }

                if (profile.engagementRate > 0) updatePayload.engagement_rate = profile.engagementRate
                if (profile.trustScore > 0) updatePayload.account_trust_score = profile.trustScore

                const res = await supabase
                    .from(LEGACY_HISTORY_TABLE)
                    .update(updatePayload)
                    .eq('id', existing.id)
                error = res.error
            } else {
                const res = await supabase
                    .from(LEGACY_HISTORY_TABLE)
                    .insert(payload)
                error = res.error
            }

            storageMode = "legacy"
        }

        if (!error) {
            await storage.set("lastSupabaseSync", today)
            console.log(`IG API: Synced daily metrics to Supabase (${storageMode}) âœ…`)
        } else {
            console.error("IG API: Supabase sync error:", error.message || JSON.stringify(error))
            await reportCriticalError({
                area: "sync_stats_to_supabase",
                error,
                appSurface: "extension_api",
                instagramUsername: profile.username,
                context: {
                    storageMode
                }
            })
        }
    } catch (err) {
        console.error("IG API: Sync failed", err)
        await reportCriticalError({
            area: "sync_stats_to_supabase",
            error: err,
            appSurface: "extension_api",
            instagramUsername: profile.username
        })
    }
}

export async function fetchHistoryFromSupabase(username: string) {
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || !username) return []

        const stableRes = await supabase
            .from(STABLE_HISTORY_TABLE)
            .select('*')
            .eq('user_id', session.user.id)
            .eq('instagram_username', username)
            .order('snapshot_date', { ascending: false })
            .limit(30)

        if (!stableRes.error && stableRes.data) {
            return stableRes.data.map((d: DailySnapshotRow) => ({
                date: d.snapshot_date!,
                timestamp: new Date(d.captured_at || d.snapshot_date!).getTime(),
                followers: d.followers ?? 0,
                following: d.following ?? 0,
                engagementRate: d.engagement_rate ?? null,
                trustScore: d.trust_score ?? null
            }))
        }

        if (stableRes.error && !String(stableRes.error.message || "").toLowerCase().includes(STABLE_HISTORY_TABLE)) {
            console.error("IG API: Error fetching stable daily history", stableRes.error)
            return []
        }

        const legacyRes = await supabase
            .from(LEGACY_HISTORY_TABLE)
            .select('*')
            .eq('user_id', session.user.id)
            .eq('instagram_username', username)
            .order('created_at', { ascending: false })
            .limit(30)

        const data = legacyRes.data
        if (!data) return []

        const uniqueData = data.reduce((acc: DailySnapshotRow[], current: DailySnapshotRow) => {
            const date = current.created_at?.split('T')[0]
            if (date && !acc.find(item => item.created_at?.split('T')[0] === date)) {
                acc.push(current)
            }
            return acc
        }, [])

        return uniqueData.map((d: DailySnapshotRow) => ({
            date: d.created_at!.split('T')[0],
            timestamp: new Date(d.created_at!).getTime(),
            followers: d.follower_count ?? 0,
            following: d.following_count ?? 0,
            engagementRate: d.engagement_rate ?? null,
            trustScore: d.account_trust_score ?? null
        }))
    } catch (err) {
        console.error("IG API: Error fetching history", err)
        return []
    }
}

export async function getGrowthStat() {
    const currentProfile = await getStoredCurrentUserProfile()
    if (!currentProfile?.username) return 0

    const history = await storage.get<any[]>(accountKey(currentProfile.username, "followerHistory")) || []
    if (history.length < 2) return 0
    return history[0].followers - history[1].followers
}

/**
 * DEEP SCAN: Fetch ALL followers from Instagram API (Paginated)
 */
export async function runDeepScan(onProgress?: (count: number) => void) {
    try {
        console.log("IG API: Starting Deep Scan process...")
        const stats = await getStoredCurrentUserProfile()
        if (!stats?.id) {
            console.error("IG API: Deep Scan failed - No user ID in storage. stats:", stats)
            throw new Error("No user ID found. Please refresh profile first.")
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            console.error("IG API: Deep Scan failed - No Supabase session")
            throw new Error("No session found.")
        }

        console.log("IG API: Starting Deep Scan for ID", stats.id, "Username", stats.username)
        let followers: any[] = []
        let hasNext = true
        let cursor = ""

        // 1. Fetch current followers from IG
        while (hasNext) {
            const url = `https://www.instagram.com/api/v1/friendships/${stats.id}/followers/?count=50${cursor ? `&max_id=${cursor}` : ''}`
            const res = await fetch(url, {
                headers: {
                    'x-ig-app-id': '936619743392459',
                    'x-requested-with': 'XMLHttpRequest'
                }
            })
            const data = await res.json()

            if (data.users) {
                followers = [...followers, ...data.users]
                if (onProgress) onProgress(followers.length)
            }

            hasNext = data.next_max_id ? true : false
            cursor = data.next_max_id

            // Safety pause to avoid rate limits
            await new Promise(r => setTimeout(r, 1000))
            if (followers.length >= 5000) break // Limit for safety in dev
        }

        // 2. Get old followers from Supabase
        const { data: oldFollowers } = await supabase
            .from('user_followers')
            .select('follower_id, follower_username')
            .eq('user_id', session.user.id)
            .eq('instagram_username', stats.username)

        const currentIds = new Set(followers.map(f => String(f.pk_id || f.id_bolt || f.id || f.pk)))
        const unfollowersList = (oldFollowers || []).filter(old => !currentIds.has(String(old.follower_id)))

        // 3. Record unfollowers
        if (unfollowersList.length > 0) {
            console.log(`IG API: Detected ${unfollowersList.length} unfollowers!`)
            for (const unf of unfollowersList) {
                await supabase.from('unfollowers_detected').insert({
                    user_id: session.user.id,
                    instagram_username: stats.username,
                    username: unf.follower_username
                })
            }
        }

        // 4. Update current list in Supabase (Clean and replace)
        await supabase.from('user_followers').delete().eq('user_id', session.user.id).eq('instagram_username', stats.username)

        // Chunk insert to avoid Supabase limits
        const batchSize = 100
        for (let i = 0; i < followers.length; i += batchSize) {
            const chunk = followers.slice(i, i + batchSize).map(f => ({
                user_id: session.user.id,
                instagram_username: stats.username,
                follower_id: String(f.pk_id || f.id_bolt || f.id || f.pk),
                follower_username: f.username,
                follower_avatar_url: f.profile_pic_url
            }))
            await supabase.from('user_followers').insert(chunk)
        }

        return unfollowersList
    } catch (err) {
        console.error("IG API: Deep Scan failed", err)
        await reportCriticalError({
            area: "run_deep_scan",
            error: err,
            appSurface: "extension_api",
            instagramUsername: stats?.username || null,
            context: {
                followerCountAttempted: followers.length
            }
        })
        throw err
    }
}

export interface ViralPostItem {
    id: string
    url: string
    shortcode: string
    likes: number
    comments: number
    timestamp: number
    username: string
    avatarUrl: string
    format: "reel" | "carousel" | "image"
    viralScore: number
}

export function extractTopViralPosts(competitorDataList: any[] = []): ViralPostItem[] {
    const allPosts: ViralPostItem[] = []

    for (const comp of competitorDataList) {
        if (!comp || !comp.latestPosts || !Array.isArray(comp.latestPosts)) continue

        const posts = comp.latestPosts
        if (posts.length === 0) continue

        const avgLikes = posts.reduce((sum: number, p: any) => sum + (Number(p.likes) || 0), 0) / posts.length || 1
        const avgComments = posts.reduce((sum: number, p: any) => sum + (Number(p.comments) || 0), 0) / posts.length || 1
        const compAvgScore = avgLikes + (avgComments * 2) || 1

        for (const p of posts) {
            const pLikes = Number(p.likes) || 0
            const pComments = Number(p.comments) || 0
            const score = pLikes + (pComments * 2)
            const multiplier = parseFloat((score / compAvgScore).toFixed(1))

            let format: "reel" | "carousel" | "image" = "image"
            const pUrl = (p.url || "").toLowerCase()
            if (pUrl.includes('/reel/') || pUrl.includes('/reels/')) {
                format = "reel"
            } else if (p.isCarousel || pUrl.includes('carousel')) {
                format = "carousel"
            }

            allPosts.push({
                id: p.id || p.shortcode || `${comp.username}_${pLikes}_${pComments}`,
                url: p.url || `https://www.instagram.com/p/${p.shortcode}/`,
                shortcode: p.shortcode || "",
                likes: pLikes,
                comments: pComments,
                timestamp: p.timestamp || Date.now(),
                username: comp.username,
                avatarUrl: comp.avatarUrl || `https://ui-avatars.com/api/?name=${comp.username}&background=0f172a&color=fff`,
                format,
                viralScore: multiplier
            })
        }
    }

    return allPosts.sort((a, b) => b.viralScore - a.viralScore).slice(0, 6)
}

export function calculateCompetitorFormatBreakdown(competitorDataList: any[] = []) {
    let reels = { count: 0, likes: 0, comments: 0 }
    let images = { count: 0, likes: 0, comments: 0 }
    let carousels = { count: 0, likes: 0, comments: 0 }

    for (const comp of competitorDataList) {
        if (!comp?.latestPosts) continue
        for (const p of comp.latestPosts) {
            const likes = Number(p.likes) || 0
            const comments = Number(p.comments) || 0
            const url = (p.url || "").toLowerCase()

            if (url.includes('/reel/') || url.includes('/reels/')) {
                reels.count++
                reels.likes += likes
                reels.comments += comments
            } else if (p.isCarousel) {
                carousels.count++
                carousels.likes += likes
                carousels.comments += comments
            } else {
                images.count++
                images.likes += likes
                images.comments += comments
            }
        }
    }

    return {
        reels: {
            count: reels.count,
            avgLikes: reels.count > 0 ? Math.round(reels.likes / reels.count) : 0,
            avgComments: reels.count > 0 ? Math.round(reels.comments / reels.count) : 0
        },
        images: {
            count: images.count,
            avgLikes: images.count > 0 ? Math.round(images.likes / images.count) : 0,
            avgComments: images.count > 0 ? Math.round(images.comments / images.count) : 0
        },
        carousels: {
            count: carousels.count,
            avgLikes: carousels.count > 0 ? Math.round(carousels.likes / carousels.count) : 0,
            avgComments: carousels.count > 0 ? Math.round(carousels.comments / carousels.count) : 0
        }
    }
}

export function calculateAccountFormatBreakdown(posts: any[] = []) {
    let reels = { count: 0, likes: 0, comments: 0 }
    let images = { count: 0, likes: 0, comments: 0 }
    let carousels = { count: 0, likes: 0, comments: 0 }

    for (const p of posts) {
        if (!p) continue
        const likes = Number(p.likes) || 0
        const comments = Number(p.comments) || 0
        const url = (p.url || "").toLowerCase()

        if (url.includes('/reel/') || url.includes('/reels/')) {
            reels.count++
            reels.likes += likes
            reels.comments += comments
        } else if (p.isCarousel) {
            carousels.count++
            carousels.likes += likes
            carousels.comments += comments
        } else {
            images.count++
            images.likes += likes
            images.comments += comments
        }
    }

    return {
        reels: {
            count: reels.count,
            avgLikes: reels.count > 0 ? Math.round(reels.likes / reels.count) : 0,
            avgComments: reels.count > 0 ? Math.round(reels.comments / reels.count) : 0
        },
        images: {
            count: images.count,
            avgLikes: images.count > 0 ? Math.round(images.likes / images.count) : 0,
            avgComments: images.count > 0 ? Math.round(images.comments / images.count) : 0
        },
        carousels: {
            count: carousels.count,
            avgLikes: carousels.count > 0 ? Math.round(carousels.likes / carousels.count) : 0,
            avgComments: carousels.count > 0 ? Math.round(carousels.comments / carousels.count) : 0
        }
    }
}

