# SocialRadar v1.2.1

Patch release focused on account refresh reliability, automation expansion, and operational stability.

## Highlights

### Refresh Workflow (Dashboard)
- Renamed top action to **Refresh** for clearer intent.
- Refresh now detects the **currently active Instagram account** before loading data.
- If the active account differs from dashboard context, SocialRadar automatically switches context and reloads panel data.
- Added first-time account bootstrap flow: initial profile refresh + baseline sync + deep scan bootstrap.

### Bot Automation Expansion
- Added **comments automation** with configurable templates and session limit.
- Added **direct post URL source mode** so missions can target explicit posts.
- Added **dead-account-only unfollow mode** with inactivity-day threshold.
- Improved loop/runtime handling to reduce freeze/stall scenarios in long sessions.

### Data & UI Hardening
- Improved avatar/media URL sanitization and rendering fallbacks.
- Protected engagement/trust metrics from being overwritten by blocked/empty snapshots.
- Removed temporary operational diagnostics panel from the dashboard main view.

### Documentation
- Rewrote README with production-ready documentation (architecture, setup, release flow, and operational notes).

## Versioning
- Updated project version to `1.2.1` in package/versioning files.
- Updated extension update manifest (`updates.xml`) to `1.2.1`.

## Full Changelog
- Compare changes: https://github.com/cfieiras/SocialRadar/compare/v1.1.9...v1.2.1
