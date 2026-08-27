# Reliable Cron Setup for Kynthai Reminders

## The Problem
GitHub Actions `* * * * *` cron is unreliable (23 runs in 2 days).
cron-job.org fires every minute as configured — no skips.

## Setup (2 minutes)

1. Go to https://cron-job.org and sign up with your email
2. Create a new cron job with these settings:
   - **URL**: `https://kynthai.app/api/reminders/send?mode=tick`
   - **Schedule**: `* * * * *` (every minute)
   - **HTTP Method**: `POST`
   - **Headers**: 
     - `Authorization: Bearer <CRON_SECRET>` (the same secret from Vercel)
     - `Content-Type: application/json`
   - **Save and enable**

That's it. The GH Actions cron becomes a backup. cron-job.org is the primary.

## Why this works
- cron-job.org genuinely fires every minute, guaranteed
- The `/api/reminders/send?mode=tick` endpoint checks for due reminders
  and dispatches FCM push to all subscribed devices
- Server-side FCM is already wired (firebase-admin v14, verified auth OK)
