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

# IG Growth Auto Bot - Version 1.0.0 (Official Release)
Date: 2026-01-12

## Milestone Summary
This is the first stable release of the IG Growth Auto Bot "Pro Edition". 
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
