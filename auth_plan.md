# Roadmap to Monetizable SaaS for IG Growth Auto Bot

## 1. Architecture Shift: Client-Side -> SaaS
Currently, your bot is a "Standalone Extension". To monetize it (subscriptions, licenses), you need to control who uses it.
The "Next Step" is implementing **Authentication & Backend Verification**.

### The Plan
1. **Frontend (Extension)**: Add a Login/Register screen.
2. **Backend (Server)**: Verify credentials and check if the user has an active subscription.
3. **Database**: Store Users, Licenses, and optionally Analytics.
4. **Payment**: Stripe integration for subscriptions.

## 2. Technology Stack Recommendation
Since you are using **Plasmo (React/TS)** for the frontend, we recommend this stack for the backend to keep it simple and scalable:
- **Backend/DB**: **Supabase** (Postgres + Auth + Edge Functions). It handles user management and database without you writing a full server from scratch.
- **Payment**: **Stripe**.
- **Hosting**: Vercel (for the Landing Page/Dashboard if separate from extension).

## 3. Implementation Steps

### Step A: Infrastructure Setup
1. Create a Supabase project.
2. Create `profiles` table to store `is_premium` status and `stripe_customer_id`.

### Step B: Extension Update (Authentication)
1. Add a **Login Screen** in `popup.tsx`.
2. On interaction, the extension sends a request to Supabase Auth.
3. If login succeeds, store the `access_token` in `chrome.storage.local`.

### Step C: Gatekeeping
1. Wrap the "Start Automation" button logic.
2. **Before starting**, the background script checks:
   - Is `access_token` valid?
   - Does `profiles.is_premium` == `true`?
3. If not, stop and show "Please Upgrade".

## 4. Security Note
- **Obfuscation**: JavaScript extensions can be cracked. Move critical logic (like the list of targets to follow) to the server if possible (Cloud-controlled bot) so the extension *needs* the server to function.
