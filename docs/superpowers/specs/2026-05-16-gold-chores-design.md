# Gold Chores — Design Spec

**Date:** 2026-05-16  
**Project:** Family Chore Chart App  
**Status:** Approved

---

## Overview

Gold Chores are special one-off tasks worth more points than regular chores. They appear in the main chore grid for all family members to see and are awarded to a specific child by a parent entering a 4-digit PIN on screen. Once awarded, the chore disappears — it is never recurring.

---

## Data Model

### New table: `gold_chores`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Primary key |
| `name` | text | e.g. "Clean the garage" |
| `description` | text | Optional detail shown in the PIN overlay |
| `points` | integer | Set by parent — no default |
| `image_path` | text | `/api/gold-chore-image/[filename]`, null until ready |
| `image_status` | text | `pending` \| `ready` \| `failed` |
| `status` | text | `available` \| `awarded` |
| `awarded_to_member_id` | integer | FK → members.id, null until awarded |
| `awarded_at` | datetime | null until awarded |
| `created_at` | datetime | Set on insert |

### Settings table addition

One new key added to the existing `settings` table:

| Key | Value |
|---|---|
| `admin_pin` | 4-digit string, null until set |

---

## AI Image Generation

Each gold chore gets a single AI-generated image when created — one image per chore, not per member.

**Prompt rules:**
- Follows the same BASE_PROMPT framework used for regular chores (white background, single scene, no panels, no collage)
- Explicitly excludes people: *"No people, no characters, objects and environment only."*
- Uses the chore name as the subject

**Image serving:** A new dynamic API route `/api/gold-chore-image/[filename]` serves images from disk, bypassing Next.js static file cache — same pattern as the existing `/api/chore-image/[filename]` route.

**Generation trigger:** Fires automatically when a gold chore is saved in the admin panel.

**Retry:** A ↻ button is always visible on the admin card. Grey when image is ready (regenerate any time), yellow when failed (retry prompt).

---

## Main App — Chore Grid

Gold chores appear as the **last card(s)** in the regular chore grid, using the full gold visual treatment:

- Gold border (`#f59e0b`)
- Warm gradient background (`linear-gradient(160deg, rgba(245,158,11,0.15), rgba(0,0,0,0.3))`)
- Amber label bar showing `⭐ [name] · [N]pt`
- AI-generated image fills the card top (same layout as regular chores)

Gold chores are shown to **all family members** regardless of who is the active member — they are not filtered per member.

**Tapping a gold chore:**

1. A PIN overlay slides up immediately over the card.
2. The overlay shows *"Awarding to [Active Member Name]"* with a member-switch control so the parent can correct who receives the award before confirming.
3. Parent enters the 4-digit admin PIN on the overlay.
4. **Correct PIN →** chore is awarded to the selected member. Points are added, confetti fires, card disappears from the grid.
5. **Wrong PIN →** PIN pad shakes and resets. Chore remains in the grid.
6. **No PIN set yet →** overlay shows: *"Ask a parent to set up a PIN in Settings first."*

The PIN overlay does not require switching to the admin panel. The parent approves while physically present with the child.

**Grid filtering:** Only gold chores with `status = 'available'` are shown in the main grid. Awarded chores are excluded from the query.

---

## Admin Panel — Gold Tab

A new **"Gold"** tab is added to the admin panel alongside the existing Members, Chores, and Settings tabs.

### Create form (top of tab)

- **Chore name** — text input
- **Points** — number input
- **Save** button — triggers image generation immediately on save

No emoji picker. The AI-generated image is the only visual.

### Active gold chores list

Each available gold chore is shown as a card with:
- Generated image (or spinner/failed state)
- Chore name and points value
- ↻ regenerate button (always visible — grey when ready, yellow when failed)
- Delete button — removes the chore entirely

### Awarded history

A collapsed section below active chores showing completed gold chores:
- Chore name, who earned it, when, and how many points
- Read-only, for reference only

---

## Admin Panel — Settings Tab

The existing Settings tab gets a new **"Admin PIN"** field:

- **No PIN set:** Shows a *Set PIN* button → tapping opens a 4-digit entry → confirm entry → saved to `settings` table
- **PIN already set:** Shows `••••` with a *Change PIN* button → same entry/confirm flow

The admin PIN gates gold chore approval on the main screen. It does **not** gate access to the `/admin` route itself — that remains open as today.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/gold-chores` | List all gold chores (admin) |
| POST | `/api/gold-chores` | Create a gold chore, trigger image generation |
| DELETE | `/api/gold-chores/[id]` | Delete a gold chore |
| POST | `/api/gold-chores/[id]/award` | Verify PIN and award to active member |
| POST | `/api/gold-chores/[id]/regenerate` | Re-trigger image generation |
| GET | `/api/gold-chore-image/[filename]` | Serve generated image from disk |

---

## Affected Existing Files

| File | Change |
|---|---|
| `src/lib/db.ts` | Add `gold_chores` table schema, add `admin_pin` settings seed |
| `src/app/page.tsx` | Fetch and render gold chores after regular chores in grid |
| `src/components/ChoreGrid.tsx` | Accept and render gold chore cards at end of grid |
| `src/components/ChoreCard.tsx` | Gold variant: full gold theme, PIN overlay on tap |
| `src/app/admin/page.tsx` | Add Gold tab |
| `src/app/admin/SettingsTab.tsx` | Add Admin PIN field |
| `src/hooks/useChores.ts` | Optionally: separate hook `useGoldChores` |

---

## Out of Scope

- Push notifications to parent when a child requests approval (could be a future feature)
- Expiry dates on gold chores
- Multiple winners (first-come-first-served is not supported — parent manually awards)
- Gold chore images personalised per member
