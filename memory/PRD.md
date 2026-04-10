# PunchListJobs — PRD

## Original Problem Statement
Import code from GitHub (https://github.com/buildbypurpose/PunchListJobsRemixV9.git) and make production-ready. Fix runtime errors including PostHog + reCAPTCHA conflict on Android devices.

## User Personas
- **Crew Members**: Blue-collar workers looking for job opportunities
- **Contractors**: Businesses that post jobs and hire crew
- **Admin / SuperAdmin**: Platform managers

## Core Requirements (Static)
- Full-stack React + FastAPI + MongoDB
- Role-based access: crew, contractor, subadmin, admin, superadmin
- Job marketplace with real-time WebSocket notifications
- Subscription-based access model (daily/weekly/monthly/annual)
- Admin platform management dashboard

---

## Architecture
```
/app/
├── backend/
│   ├── routes/ (admin_routes.py, job_routes.py, coupon_routes.py, trade_routes.py, user_routes.py, ws_routes.py, address_routes.py, payment_routes.py, cms_routes.py, boost_routes.py, activity_routes.py, auth_routes.py)
│   ├── utils/ (email_utils.py, subscription.py, geocoding.py, matching.py, notify.py, activity_log.py, analytics_service.py, ai_utils.py, address_service.py, rbac.py)
│   ├── models.py, auth.py, database.py
│   ├── server.py
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/ (JobMap.jsx, JobCard.jsx, Navbar.jsx, TradeSelect.jsx, WysiwygEditor.jsx, OnboardingModal.jsx)
│   │   ├── contexts/ (AuthContext.jsx, ThemeContext.jsx)
│   │   ├── pages/ (AdminDashboard.jsx, CrewDashboard.jsx, ContractorDashboard.jsx, AuthPage.jsx, ProfilePage.jsx, LandingPage.jsx, SubscriptionPage.jsx, CmsPage.jsx, ArchivePage.jsx, AppSettingsPage.jsx)
│   │   └── App.js
│   └── .env
```

---

## What's Been Implemented

### Session 1 (Initial Import) — April 2026
- Cloned GitHub repo (PunchListJobsRemixV9) and migrated to /app structure
- Installed all dependencies (backend Python packages + frontend npm packages)
- Backend seeded with demo accounts (superadmin, admin, 5 crew, 3 contractors)
- All services running via supervisor

### Bug Fix: PostHog + reCAPTCHA Conflict (Android)
- **Root Cause**: PostHog session recording had `recordCrossOriginIframes: true` which caused it to monitor reCAPTCHA iframes. When reCAPTCHA resets after form submit, PostHog's `removeNodeFromMap` tries to access `childNodes` on a null iframe reference
- **Fix 1**: Set `recordCrossOriginIframes: false` in PostHog config (index.html)
- **Fix 2**: Added `blockSelector` for reCAPTCHA iframes in PostHog config
- **Fix 3**: Added global error handler to suppress residual PostHog childNodes errors
- **Fix 4**: Wrapped `captchaRef.current?.reset()` in try-catch with 100ms setTimeout defer (AuthPage.jsx)

### Previous Sessions (from GitHub history)
- Session 2: Admin dashboard improvements (Jobs tab, Edit User, Create User)
- Session 3: Profile + Signup address cleanup
- Session 4: Free tier restrictions (phone/email masking, crew request blocking)
- Session 5: Profile completion popup, Admin export CSV/JSON
- Session 6: Square payments, CashApp, gamification, Resend email, trades pagination, subscription page
- Sprint 6: Global dark theme + CMS colors, ThemeProvider
- Sprint 7: Normalized trades/skills system (10 categories, 52 trades)

---

## Mocked Integrations
- Square payments — configured (needs production keys)
- CashApp — MOCKED (pending admin verification flow)
- Resend email — configured (needs API key)

---

## Key API Endpoints
- `POST /api/auth/login` -> `{access_token, token_type, user}`
- `POST /api/auth/register`
- `GET /api/admin/analytics`
- `GET /api/admin/users?page=&search=`
- `PUT /api/admin/users/{id}`
- `POST /api/admin/users`
- `DELETE /api/admin/users/{id}`
- `GET /api/admin/jobs?status=&limit=`
- `DELETE /api/admin/jobs/{id}`
- `POST /api/jobs/{id}/suspend|reactivate|cancel`
- `GET /api/admin/payments/by-user`
- `GET /api/admin/top-performers`
- `GET /api/coupons`
- `POST /api/coupons`
- `PATCH /api/coupons/{id}`
- `POST /api/payments/square/pay`
- `POST /api/payments/cashapp/pay`
- `POST /api/payments/points/redeem`
- `GET /api/payments/plans`
- `GET /api/admin/users/export`
- `GET /api/admin/users/export-json`
- `GET /api/users/crew` (masks phone/email for free tier)
- `GET /api/users/public/{user_id}`
- `GET /api/trades`
- `GET /api/settings/public`

## Test Credentials
See /app/memory/test_credentials.md

---

## P0/P1/P2 Backlog

### P0 — Completed
- [x] Full codebase migration from GitHub
- [x] All backend services running
- [x] Demo data seeded
- [x] PostHog + reCAPTCHA Android runtime error fixed
- [x] Admin dashboard improvements
- [x] Free tier restrictions
- [x] Profile completion popup
- [x] Square + CashApp payment flows
- [x] Trades/skills normalized system
- [x] Dark theme + CMS colors
- [x] Subscription page

### P2 — Future
- [ ] Mobile-responsive improvements
- [ ] Admin advanced analytics (revenue charts)
- [ ] Bulk admin operations
- [ ] Split AdminDashboard.jsx (1700+ lines) into smaller components
- [ ] Configure real Square production keys
- [ ] Configure real Resend API key
- [ ] Configure reCAPTCHA keys (site key + secret key)
