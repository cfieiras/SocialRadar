import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["https://www.instagram.com/*"],
    world: "MAIN",
    run_at: "document_start"
}

// Global buffer as requested
window["__IG_POSTS__"] = [];

// --- 1. INTERCEPT XHR (Your Code) ---
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method: string, url: string) {
    this._url = url;
    return originalOpen.apply(this, arguments as any);
};

XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
        if (!this._url) return;
        if (this._url.includes("/graphql/query") || this._url.includes("/web_profile_info/")) {
            try {
                const data = JSON.parse(this.responseText);
                processGraphQL(data);
            } catch (e) { }
        }
    });
    return originalSend.apply(this, arguments as any);
};

// --- 2. INTERCEPT FETCH ---
const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof URL ? args[0].href : (args[0] as Request).url);

    if (url && (url.includes("/graphql/query") || url.includes("/web_profile_info/"))) {
        const clone = response.clone();
        clone.json().then(data => processGraphQL(data)).catch(() => { });
    }
    return response;
};

// --- 3. COMMON PROCESSOR ---
function processGraphQL(json: any) {
    const connection = json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection ||
        json?.data?.user?.edge_owner_to_timeline_media ||
        json?.data?.xdt_api__v1__feed__user_timeline;

    const edges = connection?.edges || connection?.items || [];

    // --- USER PROFILE DETECTION (NEW METHOD) ---
    const capturedUser = json?.data?.user ||
        json?.data?.xdt_api__v1__users__web_profile_info?.user ||
        connection?.user || null;

    if (capturedUser) {
        const profilePic = capturedUser.profile_pic_url_hd || capturedUser.profile_pic_url || capturedUser.profilePicUrl;
        console.log("🧑 FOTO DE PERFIL ENCONTRADA", {
            username: capturedUser.username,
            profilePic
        });

        // Notify session with user data even if no posts in this specific packet
        window.postMessage({
            type: "SOCIAL_RADAR_GRAPHQL_DATA",
            payload: {
                posts: window["__IG_POSTS__"],
                user: capturedUser
            }
        }, "*");
    }

    if (edges.length > 0) {
        edges.forEach((item: any) => {
            const node = item.node || item;

            // Improved image extraction
            let imageUrl = node.display_url || node.thumbnail_src || "";

            if (node.image_versions2?.candidates?.length) {
                imageUrl = node.image_versions2.candidates[0].url;
            } else if (node.carousel_media?.[0]?.image_versions2?.candidates?.length) {
                imageUrl = node.carousel_media[0].image_versions2.candidates[0].url;
            }

            const post = {
                id: node.id,
                shortcode: node.code || node.shortcode,
                likes: node.like_count ?? node.edge_media_preview_like?.count ?? node.edge_liked_by?.count ?? 0,
                comments: node.comment_count ?? node.edge_media_to_comment?.count ?? 0,
                timestamp: node.taken_at ?? node.taken_at_timestamp,
                url: imageUrl
            };

            // Push to buffer if not exists
            if (!window["__IG_POSTS__"].find(p => p.id === post.id)) {
                window["__IG_POSTS__"].push(post);
                console.log("📸 POST DETECTADO", {
                    id: post.id,
                    shortcode: post.shortcode,
                    likes: post.likes,
                    comments: post.comments,
                    url: post.url
                });
            }
        });

        console.log(`[SocialRadar] Captured +${edges.length} posts | Total Buffer: ${window["__IG_POSTS__"].length}`);

        // Notify again with updated posts buffer
        window.postMessage({
            type: "SOCIAL_RADAR_GRAPHQL_DATA",
            payload: {
                posts: window["__IG_POSTS__"],
                user: capturedUser
            }
        }, "*");
    }
}
