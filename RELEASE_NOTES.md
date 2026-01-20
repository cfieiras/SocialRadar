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
