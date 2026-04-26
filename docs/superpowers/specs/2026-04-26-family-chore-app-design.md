# Family Chore App — Design Spec
**Date:** 2026-04-26  
**Stack:** Next.js + SQLite · Raspberry Pi · Chromium kiosk  

---

## 1. Overview

A family chore tracker running full-screen on a landscape kitchen touchscreen (Raspberry Pi, Chromium kiosk mode). Three children (ages 5, 10, 12) use it daily to track morning and afternoon chores. Chores are represented by AI-generated images for pre-readers. Completing chores earns points worth real dollar amounts. Kids manually allocate earnings across three Barefoot Investor buckets (Spend / Save / Give). An admin section (PIN-protected) handles all configuration.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | Single codebase, API routes, SSR, excellent React ecosystem |
| Database | SQLite via `better-sqlite3` | Local, zero-config, survives reboots, no network dependency |
| Image generation | OpenAI DALL-E 3 | High quality, ~$0.04/image, generated once and cached |
| Fonts | Fredoka One (headings) + Nunito (body) | Rounded, child-friendly, highly legible |
| Styling | Tailwind CSS + CSS variables | Rapid iteration, per-member colour theming via CSS vars |
| Runtime | Node.js on Raspberry Pi 4 | `npm run build && npm start`, auto-launch via systemd |

---

## 3. Architecture

```
/app
  /api
    /members          GET, POST, PUT, DELETE
    /chores           GET, POST, PUT, DELETE
    /completions      GET, POST, DELETE (daily reset)
    /points           GET, POST (allocate), POST (admin add)
    /settings         GET, PUT (schedule, PIN, rates)
    /generate-image   POST (calls DALL-E 3, saves to /public/chore-images)
  /(main)
    page.tsx          Main chore screen
  /cashin/[memberId]
    page.tsx          Kid cash-in allocation screen
  /admin
    page.tsx          Admin panel (PIN gated)

/lib
  db.ts               SQLite connection + schema init
  auth.ts             PIN hashing (bcrypt)
  scheduler.ts        Daily reset cron + routine auto-switch

/public/chore-images  AI-generated images stored here permanently
```

**Startup:** `npm start` serves the Next.js app on port 3000. A systemd service auto-launches Chromium in kiosk mode pointing to `http://localhost:3000` on boot.

---

## 4. Data Model

### `members`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| age | INTEGER | |
| colour | TEXT | Hex, e.g. `#f97316` — drives page tint |
| photo_path | TEXT NULLABLE | Path under `/public/member-photos/` |
| point_value_cents | INTEGER | e.g. `10` = 10 cents per point ($0.10/pt) |
| created_at | DATETIME | |

### `chores`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| image_path | TEXT NULLABLE | Populated after DALL-E generation |
| image_status | TEXT | `pending` / `ready` / `failed` |
| points | INTEGER | Points awarded on completion |
| routine | TEXT | `morning` / `afternoon` / `both` |
| created_at | DATETIME | |

### `chore_assignments`
| Column | Type | Notes |
|---|---|---|
| chore_id | INTEGER FK | |
| member_id | INTEGER FK | Which members have this chore |

### `completions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| chore_id | INTEGER FK | |
| member_id | INTEGER FK | |
| completed_at | DATETIME | |
| date | TEXT | `YYYY-MM-DD` — used for daily reset logic |

### `point_balances`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| member_id | INTEGER FK | |
| bucket | TEXT | `unallocated` / `spend` / `save` / `give` |
| balance_cents | INTEGER | Stored as cents to avoid float errors |
| updated_at | DATETIME | |

Each member has four rows (one per bucket). Chore completions credit `unallocated`. Cash-in moves cents from `unallocated` into `spend`/`save`/`give`.

### `point_transactions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| member_id | INTEGER FK | |
| bucket | TEXT | `spend` / `save` / `give` / `unallocated` |
| amount_cents | INTEGER | Positive = credit, negative = debit |
| reason | TEXT | `chore_complete` / `allocation` / `admin_add` / `payout` |
| created_at | DATETIME | |

### `settings`
| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | |
| value | TEXT | |

Key settings: `morning_start_time`, `afternoon_start_time`, `daily_reset_time`, `admin_pin_hash`.

---

## 5. Main Screen

### Layout (landscape, full-screen)
```
┌─────────────────────────────────────────────────────┐
│ ⭐ ChoreChart        ☀️ MORNING        Sat 26 Apr   │  ← top bar
├─────────────────────────────────────────────────────┤
│  [ Mia · 5 · 8pts ]  [ Jack · 10 · 61pts ]  [ ... ] │  ← member selector
├─────────────────────────────────────────────────────┤
│                                                     │
│   [img]  [img]  [img]  [img]  [img]                 │
│   Make   Brush  Get   Clear  Pack                   │  ← chore grid
│   Bed    Teeth  Dressed Plate Bag                   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  61 pts             🛍️ $3.05  🏦 $2.03  🤝 $1.02  ⚙ │  ← bottom bar
└─────────────────────────────────────────────────────┘
```

### Member selector
- Three large touch-friendly buttons, one per member
- Each shows name, age, and current point total
- Active member: border highlight + background tinted to their colour
- Inactive members: dimmed (opacity 0.5)
- Switching members is instant — no confirmation required

### Page colour theming
- Background colour shifts to a dark tint of the active member's colour
- Radial gradient glow from the top in their accent colour
- Active member button, points display, and routine badge all use their accent colour
- Admin can change each member's colour via a colour picker in Settings

### Chore grid
- Displays chores assigned to the active member for the current routine (morning or afternoon)
- Grid layout: computed at runtime to fill available height without scrolling
  - Formula: choose columns/rows so all cards are visible above the fold
  - Max 5 columns, max 3 rows (up to 15 chores)
  - Cards grow to fill available space — no fixed height
- Each card:
  - AI-generated image fills the card face (object-fit: cover)
  - Chore name overlaid as a slim label at the bottom
  - `contain: strict` prevents overflow
- Completed state: green tick overlay covers the image, card dims to 65% opacity
- Tap a card to toggle complete/incomplete (no confirmation for young children)
- Points for each chore are awarded immediately on completion

### Bottom bar
- **Unallocated points** for active member (points earned but not yet split into buckets) — shown in their accent colour; tapping navigates to the Cash-In screen
- Barefoot bucket balances: Spend / Save / Give in dollar amounts (from `point_balances`)
- Cash-In screen is only accessible when unallocated balance > 0
- Settings gear (⚙) — navigates to admin PIN screen

### Morning / afternoon auto-switch
- Routine switches automatically at the configured time (default 12:00pm)
- The routine badge in the top bar updates live
- Chore grid re-renders to show the correct routine's chores
- No manual toggle needed — fully automatic

### Daily reset
- At the configured reset time (default midnight), all `completions` for today are cleared
- Points earned are kept — reset only affects chore tick state
- Reset is handled server-side by a `node-cron` job

---

## 6. Chore Images (DALL-E 3)

- When a chore is created in admin, a background API call is made to DALL-E 3
- Prompt template: `"A simple, bright, friendly illustration of a child [chore name], cartoon style, white background, suitable for young children"`
- Image is downloaded and saved to `/public/chore-images/[chore-id].png`
- `image_status` column tracks: `pending` → `ready` (or `failed`)
- While pending, the card shows a pulsing placeholder with the chore name
- Failed images show a retry button in admin
- Images are generated once and reused — no repeated API calls

---

## 7. Cash-In Screen (Kid-Facing)

Accessed by tapping the points total in the bottom bar. Full-screen, uses the active member's colour theme.

### Layout
```
┌─────────────────────────────────────────────────────┐
│ ← Back   Jack's Cash-In              $15.50 to alloc │
├──────────────────┬──────────────────┬────────────────┤
│      🛍️          │       🏦          │      🤝        │
│     Spend        │      Save        │     Give       │
│                  │                  │                │
│     $6.00        │     $8.00        │    $1.50       │
│                  │                  │                │
│   [−]   [+]     │   [−]   [+]     │  [−]   [+]    │
│                  │                  │                │
│  Balance: $18.40 │ Balance: $42.00  │ Balance: $9.20 │
└──────────────────┴──────────────────┴────────────────┘
│ ✓ All $15.50 allocated              [ Confirm → ]   │
└─────────────────────────────────────────────────────┘
```

### Behaviour
- Three equal columns, each filling available screen height
- +/− buttons are large (minimum 44×44px touch target) with colour matching their bucket
- Increment: $0.50 per tap (prevents small-finger overshoot)
- Running total in top-right shows amount still to allocate
- Confirm button is greyed out until all earnings are fully allocated (unallocated = $0)
- On confirm: point transactions are written for each bucket, unallocated balance zeroed
- A celebration animation (confetti) plays on confirm

---

## 8. Admin Panel

### Access
- Settings gear (⚙) on main screen opens a full-screen PIN entry (4-digit numeric keypad)
- Large touch-friendly keypad
- Incorrect PIN: shake animation, counter resets
- After 3 failed attempts: 30-second lockout
- Tapping outside the admin panel (or an inactivity timeout of 2 minutes) locks it

### Navigation
Sidebar with tabs: Members · Chores · Schedule · Points & Pay · Change PIN

### Members tab
- List of all members with avatar (photo or coloured initial), name, age, dollar-per-point rate
- Per member: Photo upload (from USB or file picker) · Colour picker · Edit · Delete
- Add Member button: name, age, colour, dollar rate
- Photo replaces the initial letter avatar throughout the app

### Chores tab
- List of all chores: thumbnail, name, routine, assigned members, points value
- Add Chore: name, routine (morning/afternoon/both), assign members, points value → image generates automatically
- Edit chore: all fields editable; re-generates image if name changes
- Delete chore: removes from all future days (completions history preserved)

### Schedule tab
- Morning start time (default 6:00am)
- Afternoon start time / switch time (default 12:00pm)
- Daily reset time (default midnight)
- Visual timeline showing the three time blocks
- Save button

### Points & Pay tab
- Note: "Kids choose their own Spend / Save / Give split."
- Per member: total unallocated points + dollar value, per-bucket balances
- "Mark paid" button: records a payout transaction and zeroes all bucket balances for that member
- **Manual add**: select member, select bucket (Spend / Save / Give), enter dollar amount → credits that bucket directly (for birthday money, bonuses, corrections)

### Change PIN tab
- 3-step flow: verify current PIN → enter new PIN → confirm new PIN
- Progress indicator showing current step
- On success: PIN hash updated in settings table

---

## 9. Evidence-Based Design Recommendations

The following additions are backed by child development and behavioural research and are recommended to be incorporated into the app or the family's routine around it.

### Visual completion feedback (already designed)
Research on young children consistently shows picture-based task representation improves comprehension and follow-through (Lerner & Ciervo, 2003). The AI-generated chore images directly address this.

### Immediate reinforcement
Skinner's operant conditioning research shows that immediate rewards are significantly more effective for young children than delayed ones. The app awards points the moment a chore card is tapped — no end-of-day tallying. Consider also a brief animation (star burst or sound) on each completion.

### Suggested: completion celebration
When a child completes **all** their chores for a routine, trigger a full-screen celebration animation (confetti, stars, a congratulatory message). This leverages positive reinforcement at the most motivating moment — task completion.

### Suggested: streak counter
Research on habit formation (Lally et al., 2010, *European Journal of Social Psychology*) shows that consistency streaks are powerful motivators. A "🔥 5 day streak!" badge per member reinforces daily engagement far more than points alone. Store a `streak_days` value per member, increment on days where all chores were completed, reset to 0 if a day is missed.

### Age-appropriate task assignment
Developmental research (Brazelton & Sparrow, 2001) recommends:
- **Age 4–5 (Mia):** Make bed, put clothes away, feed pet, set/clear plate, brush teeth
- **Age 9–11 (Jack):** All of above + fold laundry, vacuum, help prepare meals, take out bins
- **Age 11–13 (Sophie):** All of above + do laundry independently, cook simple meals, clean bathroom

The admin chore assignment system already supports per-member chore lists — use this to age-appropriately differentiate chores.

### Suggested: "When-Then" framing
Research by Grolnick & Ryan (1989) shows children are more compliant and intrinsically motivated when they understand the connection between tasks and outcomes rather than receiving commands. The app could display a subtle prompt: *"When you finish your chores, you'll earn X pts!"* on the main screen before any chores are done.

### Autonomy over money allocation (already designed)
Self-determination theory (Deci & Ryan, 1985) demonstrates that autonomy is a core driver of intrinsic motivation. Having kids *choose* their own Spend/Save/Give split — rather than having it set by parents — builds genuine financial decision-making skills and increases engagement with the system.

### Suggested: family leaderboard (optional)
Light social comparison (seeing siblings' progress) can motivate, but research warns it can demotivate lower performers. Recommend making this opt-in per member in Settings: "Show on leaderboard." If enabled, a subtle total-points ranking is visible in the member selector bar.

### Suggested: "Completion ratio" visible to parents
A simple admin view showing each child's completion rate over the past 7/30 days helps parents identify which chores are being skipped consistently — a signal to adjust difficulty or points value.

---

## 10. Key Product Decisions

| Decision | Choice | Rationale |
|---|---|---|
| No user accounts | PIN-only admin gate | Family device — accounts add unnecessary friction |
| Per-member colour theming | Full page tint | Immediate visual identity for pre-readers |
| Kids choose bucket split | Manual allocation | Builds genuine financial autonomy (Barefoot Investor) |
| AI images cached permanently | Generated once | Cost control — DALL-E 3 called once per chore |
| Points in integer, money in cents | No floats | Eliminates rounding bugs |
| Auto routine switch | Time-based | No parent action needed; reliable for kitchen screen |
| Daily reset at midnight | Server-side cron | Chore state resets without any user action |
| SQLite (not Postgres) | Local file DB | Raspberry Pi — no separate DB process, survives power cycles |
