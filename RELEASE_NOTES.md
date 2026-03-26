# SocialRadar - Version 1.2.2 (Closed Beta Stability Patch)
Date: 2026-03-26

## Milestone Summary
This patch release focuses on closed beta readiness by improving automation stability, fixing competitor targeting behavior, and preparing shared audience data sync across devices.

## Key Features

### 1. Automation Reliability
- **Unfollow Hardening**: Improved detection of profile action buttons, confirmation dialogs, and final state verification during unfollow runs.
- **Real Account Context Detection**: The engine now distinguishes the logged-in Instagram account from visited target profiles, preventing false account-switch stops.
- **Run-Loop Stability**: Reduced interruptions while browsing competitor profiles and follower lists during normal automation.

### 2. Target Competitors Fix
- **Account-Scoped Competitor Resolution**: Competitor targeting now consistently reads the active account's configured competitor list when the bot reaches a competitor profile.
- **Follower Entry Flow Recovery**: The engine correctly continues from competitor profile into the followers list instead of treating the profile like a normal target.

### 3. Closed Beta Product Updates
- **Closed Beta Access Flow**: Registration remains locked to invited users and login messaging now routes beta access requests to the configured contact email.
- **Beta Labelling**: Beta and Private Beta indicators were added across selected dashboard and popup surfaces to set expectations for in-progress features.

### 4. Data Sync Foundations
- **Audience Database Sync Prep**: Added the new shared `audience_database_entries` schema and extension-side sync hooks so Audience Database entries can be shared between devices.
- **Historical Metrics Stability**: The extension now supports the stable daily snapshots model already deployed in Supabase.

---

# SocialRadar - Version 1.2.1 (Refresh Flow & Automation Expansion)
Date: 2026-03-19

## Milestone Summary
This patch release improves account refresh reliability, expands automation capabilities, and hardens long-running bot behavior for day-to-day operations.

## Key Features

### 1. Refresh Account Workflow
- **Refresh Control Update**: Dashboard top action is now `Refresh` with clearer intent.
- **Active Account Detection**: Refresh now validates the currently logged-in Instagram account before loading data.
- **Context Auto-Switch**: If the active Instagram account differs from dashboard context, SocialRadar switches and reloads the panel data automatically.
- **First-Time Bootstrap**: On first load of an account, the flow now performs initial profile refresh, stats sync, and deep scan bootstrap.

### 2. Bot Engine Expansion
- **Comments Automation**: Added comment posting flow with configurable session comment limit and templates.
- **Direct Post Source Mode**: Bot can now navigate and operate from explicit target post URLs.
- **Dead Account Unfollow Mode**: Optional guard to only unfollow accounts considered inactive based on configured inactivity days.
- **Continuous Session Stability**: Loop control and runtime state handling were hardened to reduce freeze/stall scenarios.

### 3. Data & UI Hardening
- **Avatar/Image Sanitization**: Improved URL sanitization and fallbacks for profile/media images.
- **Engagement Metric Protection**: Avoids replacing valid engagement/trust values with blocked/empty snapshots.
- **Dashboard Cleanup**: Removed temporary operational diagnostics panel from the main view.

### 4. Documentation Improvements
- **Professional README Rewrite**: Replaced default template content with product-focused architecture, setup, release flow, and operational notes.

---

# SocialRadar - Version 1.2.0 (Hardening & State Consistency)
Date: 2026-03-18

## Milestone Summary
This release focuses on hardening the extension internals so multi-account usage, sync flows, and overlay rendering behave more predictably in production.

## Key Features

### 1. Multi-Account State Consistency
- **Popup Stats Fix**: The popup now reads account-scoped stats instead of a stale global `stats` key.
- **History Isolation**: `followerHistory` and stored current profile snapshots are now persisted per Instagram username.
- **Competitor Storage Fix**: Dashboard competitor data writes now stay inside the active account namespace.

### 2. Background Sync Reliability
- **SYNC_STATS Handler**: Background service worker now handles audit sync requests sent by the bot engine.
- **Safer Startup**: Background boot now recreates alarms on startup and wraps profile refresh with error handling.

### 3. Overlay & Messaging Hardening
- **Safer Overlay Rendering**: Dynamic overlay text is sanitized before being injected into the HUD/log containers.
- **Message Validation**: Bot message listener now validates `source`, `origin`, and payload shape before accepting intercepted data.
- **Narrower postMessage Target**: Interceptor now posts to the current page origin instead of `*`.

### 4. UI & Developer Quality
- **Deep Scan Refresh Fix**: Dashboard now refreshes unfollowers with the active username after a deep scan.
- **React Hook Fix**: Login remembered-email hydration now uses `useEffect` instead of a render-time `useState` side effect.
- **Typecheck Script**: Added `npm run typecheck` for faster regression checks during development.

---

# SocialRadar - Version 1.1.9 (Multi-Account & Stabilization)
Date: 2026-02-16

## Milestone Summary
This major update introduces full multi-account support, allowing the bot to operate independently across different Instagram profiles with complete data isolation and dynamic context switching.

## Key Features

### 1. Robust Multi-Account Support
- **Data Isolation**: All configurations, statistics, logs, and target lists are now stored with an account-prefixed key, preventing data leakage between profiles.
- **Dynamic Switcher**: The bot engine now detects when you change accounts in the Instagram UI and immediately reloads the corresponding settings and HUD.

### 2. Enhanced Mission HUD
- **Active Account Indicator**: The status overlay now displays which @username the bot is currently managing.
- **Current Target Display**: Real-time feedback on the specific hashtag or competitor being processed in the current mission.

### 3. Stability & Engine Polish
- **Storage Watcher Refactor**: Re-engineered the state management listeners to handle dynamic keys reliably.
- **Improved Account Detection**: Hybrid detection (Storage + DOM) ensures the bot always knows who is logged in, even after session timeouts or reloads.

---

# SocialRadar - Version 1.1.8 (Compliance & Polish)
Date: 2026-01-29

## Milestone Summary
This release focuses on user onboarding, legal compliance, and branding. We've introduced a mandatory "Terms of Service" acceptance flow and updated the visual identity of the extension.

## Key Features

### 1. Onboarding & Compliance
- **Mandatory Terms of Service**: New users are now presented with a dedicated onboarding tab upon installation.
- **Scroll-to-Accept**: The "Accept & Install" button remains disabled until the user scrolls to the bottom of the terms, ensuring compliance.
- **Blocker Screen**: The extension popup is gated behind the acceptance of terms.
- **Auto-Redirect**: Users are automatically redirected to the dashboard after accepting terms.

### 2. Visual Identity
- **New Iconography**: Updated the extension icon to the new "SocialRadar" branding.
- **Consistent Branding**: Aligned logos across the dashboard, popup, and onboarding screens.

### 3. Landing Page Integration
- **Dynamic Versioning**: The landing page now automatically fetches the latest version number from our central manifest.
- **Smart Download Links**: The "Download" button automatically generates the correct link to the latest zip file (e.g., `SocialRadar-v1.1.8.zip`), ensuring users always get the newest release.

### 4. Live Status Overlay (HUD) - *Previously in Beta*
- **Real-time Feedback**: A dashboard overlay now appears on the Instagram tab when the bot is running.
- **Visual Logs**: A scrolling terminal on the overlay shows exactly what the bot is doing in real-time.

---

# SocialRadar - Version 1.1.7
Date: 2026-01-22

## Milestone Summary
Release 1.1.7 introduces professional competitor analysis tools, enabling users to fetch profile data automatically and perform deep audits on engagement metrics.

## Key Features

### 1. Competitor Watchlist Enhancements
- **Automatic Data Fetch**: When adding a competitor, the system now automatically retrieves their Full Name, Bio, Follower Count, and Post Count using the Instagram API.
- **Visual Feedback**: Transition animations and loading states when fetching profile data.
- **Profile Links**: Direct access to competitor profiles via clickable @usernames in the dashboard.

### 2. Deep Audit Capabilities
- **Engagement Analysis**: New "Deep Audit" mode that scans the last 12 posts of any profile (own or competitor).
- **Network Interception**: Leverages GraphQL interception to gather precise interaction data (likes/comments) to calculate accurate Engagement Rates and Trust Scores.

### 3. Stability Improvements
- **Session Validation**: Improved detection of Instagram login status to prevent bot errors when logged out.
- **Data Fallbacks**: Enhanced profile scraping logic to handle various Instagram UI layouts.

---

# SocialRadar - Version 1.0.0 (Official Release)
Date: 2026-01-12

## Milestone Summary
This is the first stable release of the SocialRadar "Pro Edition". 
It includes a complete Dashboard UI, robust automation logic, and advanced humanization features.

## Key Features

### 1. Dashboard & UI
- **Modern Dark UI**: Glassmorphism design with TailwindCSS.
- **Tabbed Navigation**: 
  - **Overview**: Real-time stats and execution logs.
  - **Strategy & Source**: Toggle modules (Likes, Follows, DMs) and manage Hashtags/Competitors.
  - **Settings**: Fine-tune latencies and configure Chaotic Behavior.
  - **Audience Database**: View tracked users, interaction status, and clean up cleaned database.
- **Start/Stop Engine**: Global control to pause/resume automation securely.

### 2. Core Automation Logic
- **Smart Unfollow**: Verifies "Following" status reliably to avoid false positives. Includes 'Protect' feature.
- **Auto-Stop**: Automatically shuts down when no missions (targets) are available.
- **Safety Delays**: Randomized human-like delays (min/max) for all actions.

### 3. Chaotic Behavior (Humanization)
- **Concept**: Simulates a human "browsing" the feed to break bot patterns.
- **Configuration**:
  - **Frequency**: Runs even X minutes.
  - **Duration**: Lasts for Y minutes.
- **Behavior**: Scrolls randomly up and down, pauses, and fully interrupts automation tasks during execution.
- **Safety**: Can be stopped immediately via the Dashboard even while running.

## Technical Notes
- **Engine**: TypeScript + Plasmo Framework (Chrome MV3).
- **State Management**: Persisted via `@plasmohq/storage`.
- **Git Tag**: `v1.0.0`
