# SocialRadar

SocialRadar is a Chrome Extension (Manifest V3) for Instagram growth operations with account-aware automation, analytics, and operator tooling.

Built with Plasmo + React + TypeScript, it combines:
- A dashboard for strategy setup and performance tracking
- A popup for quick controls
- A content-side bot engine that executes actions with configurable pacing
- Background jobs for periodic profile refresh and state sync

## Core Capabilities

- Multi-account state isolation (per-username storage keys)
- Configurable action modules: likes, follows, comments, unfollow
- Source strategies: hashtags, competitors, direct post URLs
- Session controls and limits for safer execution windows
- Competitor monitoring and comparative metrics
- Deep Scan workflow for follower/unfollower analysis
- Live mission overlay on Instagram pages

## Tech Stack

- Framework: Plasmo (`0.90.x`)
- UI: React 18, TailwindCSS, Lucide icons, Recharts
- Data: `@plasmohq/storage`, Supabase (`@supabase/supabase-js`)
- Language: TypeScript

## Project Structure

- `tabs/dashboard.tsx`: Main control panel and analytics UI
- `popup.tsx`: Compact extension popup
- `contents/botWork.ts`: Core automation engine executed in Instagram pages
- `background.ts`: Service worker alarms and background refresh tasks
- `lib/instagramApi.ts`: Instagram profile fetch/scraping + sync utilities
- `components/`: Auth and shared UI blocks

## Requirements

- Node.js 18+ (Node 20 LTS recommended)
- npm 9+
- Chrome/Chromium (MV3 extension loading enabled)
- Active Instagram session in browser
- Optional: Supabase project credentials for sync features

## Local Development

Install dependencies:

```bash
npm install
```

Run dev mode:

```bash
npm run dev
```

Load the extension from:

```text
build/chrome-mv3-dev
```

Notes for Windows/OneDrive users:
- File locking can break `plasmo dev` with `UNKNOWN read` / access errors.
- If that happens, run the project from a non-OneDrive path (for example `C:\dev\...`) and mirror `build/chrome-mv3-dev` back if needed.

## Production Build

```bash
npm run build
```

Configured output directory:

```text
../extension-build
```

Package build:

```bash
npm run package
```

## Quality Checks

Type check:

```bash
npm run typecheck
```

## Permissions (Manifest)

SocialRadar requests:
- `storage`, `scripting`, `unlimitedStorage`, `cookies`, `tabs`, `alarms`
- Host permissions for Instagram and required assets endpoints

Review `package.json` manifest section before release.

## Release Workflow

1. Update version in `package.json`
2. Build and validate extension manually in Chrome
3. Update `RELEASE_NOTES.md`
4. Commit and tag release
5. Publish artifacts (zip/package) and update distribution references if required

## Security and Operational Notes

- Avoid hardcoding secrets in source files.
- Keep Supabase keys and deployment credentials in secure channels.
- Instagram endpoints and HTML structures change frequently; scraper fallbacks should be regression-tested before each release.

## Legal and Platform Compliance

This project automates interactions on third-party platforms. You are responsible for:
- Complying with Instagram Terms of Use and local regulations
- Defining safe rate limits and operator controls
- Using the software ethically and within your risk tolerance

## Repository

- GitHub: [cfieiras/SocialRadar](https://github.com/cfieiras/SocialRadar)
