import { Storage } from "@plasmohq/storage"
import { supabase } from "./supabaseClient"

const storage = new Storage({
    area: "local"
})

export interface InstagramProfile {
    username: string
    fullName: string
    avatarUrl: string
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

/**
 * Fetches the current logged-in user's profile information from Instagram.
 */
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

            try {
                const res = await fetch("https://www.instagram.com/", {
                    headers: { 'User-Agent': navigator.userAgent }
                })
                const html = await res.text()
                const match = html.match(/"username":"([^"]+)"/) ||
                    html.match(/\\u0022username\\u0022:\\u0022([^\\u0022]+)\\u0022/)

                if (match && match[1]) {
                    const detected = match[1].replace(/\\/g, '')
                    username = detected
                    await storage.set("lastKnownUsername", username)
                }
            } catch (e) {
                console.warn("IG API: Username detection fetch failed", e)
            }
        }

        if (!username) return null

        // 2. Fetch full profile
        const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`
        const response = await fetch(apiUrl, {
            headers: {
                'x-ig-app-id': '936619743392459',
                'x-requested-with': 'XMLHttpRequest',
                'x-csrftoken': csrfToken
            },
            credentials: 'include'
        })

        if (!response.ok) return null
        const resData = await response.json() // Renamed to avoid conflict with 'data' inside profile construction
        const user = resData.data?.user
        if (!user) {
            console.error("IG API: No user found in response", resData)
            return null
        }

        console.log("IG API: Fetched user data for", user.username)

        let avatarUrl = user.profile_pic_url_hd || user.profile_pic_url
        if (avatarUrl) {
            avatarUrl = avatarUrl.replace(/\\u0026/g, '&').replace(/\\/g, '')
        }

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
                                display_url: m[2].replace(/\\u0026/g, '&'),
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
                                    display_url: url.replace(/\\/g, '').replace(/\\u0026/g, '&'),
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
                url: node.display_url || node.image_versions2?.candidates?.[0]?.url || node.thumbnail_src,
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
        const ratio = user.edge_follow?.count ? (user.edge_followed_by?.count / user.edge_follow?.count) : 0

        // Weights: Engagement (40), Ratio (30), Consistency (30)
        const engWeight = Math.min((engagementRate / 5) * 40, 40) // 5% ER is top tier
        const ratioWeight = Math.min((ratio / 2) * 30, 30) // 2.0 Ratio is top tier
        const postFreq = latestPosts.length >= 3 ? 30 : (latestPosts.length / 3) * 30

        trustScore = Math.round(engWeight + ratioWeight + postFreq)

        // Calculate Velocity (based on last 2 history points)
        const history = await storage.get<any[]>("followerHistory") || []
        let growthVelocity = 0
        if (history.length >= 2) {
            const currentGrowth = history[0].followers - history[1].followers
            if (history.length >= 3) {
                const prevGrowth = history[1].followers - history[2].followers
                growthVelocity = prevGrowth !== 0 ? Math.round(((currentGrowth - prevGrowth) / Math.abs(prevGrowth)) * 100) : 0
            }
        }

        const profileData: InstagramProfile = {
            username: user.username,
            fullName: user.full_name,
            avatarUrl: avatarUrl,
            bio: user.biography,
            stats: {
                posts: user.edge_owner_to_timeline_media?.count || 0,
                followers: user.edge_followed_by?.count || 0,
                following: user.edge_follow?.count || 0
            },
            isVerified: user.is_verified || false,
            timestamp: Date.now(),
            id: user.id,
            latestPosts: latestPosts,
            engagementRate: Number(engagementRate.toFixed(2)),
            trustScore: trustScore,
            growthVelocity: growthVelocity
        }

        // 3. Update Storage & History (ONLY if it's the main user)
        if (!targetUsername) {
            await storage.set("currentUserStats", profileData)
            await updateLocalHistory(profileData)
            await syncStatsToSupabase(profileData)
        }

        return profileData
    } catch (error) {
        console.error("IG API: Error", error)
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
    const history = await storage.get<any[]>("followerHistory") || []
    const today = new Date().toISOString().split('T')[0]

    // Check if we already have an entry for today
    const exists = history.findIndex(h => h.date === today)
    const newEntry = { date: today, followers: profile.stats.followers, following: profile.stats.following }

    if (exists !== -1) {
        history[exists] = newEntry
    } else {
        history.unshift(newEntry)
    }

    // Keep last 30 days
    await storage.set("followerHistory", history.slice(0, 30))
}

async function syncStatsToSupabase(profile: InstagramProfile) {
    try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            console.warn("IG API: No Supabase session found. Sync skipped.")
            return
        }

        const today = new Date().toISOString().split('T')[0]
        const lastSync = await storage.get<string>("lastSupabaseSync")

        if (lastSync === today) {
            console.log("IG API: Already synced today. Skipping...")
            return
        }

        const { error } = await supabase
            .from('follower_history')
            .insert({
                user_id: session.user.id,
                instagram_username: profile.username,
                follower_count: profile.stats.followers,
                following_count: profile.stats.following,
                posts_count: profile.stats.posts
            })

        if (!error) {
            await storage.set("lastSupabaseSync", today)
            console.log("IG API: Synced to Supabase ✅")
        } else {
            console.error("IG API: Supabase sync error:", error.message || JSON.stringify(error))
        }
    } catch (err) {
        console.error("IG API: Sync failed", err)
    }
}

export async function getGrowthStat() {
    const history = await storage.get<any[]>("followerHistory") || []
    if (history.length < 2) return 0
    return history[0].followers - history[1].followers
}

/**
 * DEEP SCAN: Fetch ALL followers from Instagram API (Paginated)
 */
export async function runDeepScan(onProgress?: (count: number) => void) {
    try {
        console.log("IG API: Starting Deep Scan process...")
        const stats = await storage.get<InstagramProfile>("currentUserStats")
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
        throw err
    }
}
