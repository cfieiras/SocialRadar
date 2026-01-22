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

## How to Restore
To return to this state, checkout the git tag:
```bash
git checkout v1.0.0
```
