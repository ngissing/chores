# Shopping List App — Design Spec
_2026-05-23_

## Overview

A standalone Next.js web app for managing a library of regular meals, planning the week's dinners, and generating a consolidated shopping list sorted by supermarket aisle. Optimised for a landscape touchscreen kitchen dashboard, also mobile responsive.

---

## Architecture

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, `better-sqlite3`, SWR, Google Gemini API (`@google/genai`).

**Single process:** Next.js API routes serve as the backend. No separate server needed.

**Three API route groups:**
- `/api/meals` — CRUD for the meals library
- `/api/plan` — read/write the current week's meal assignments
- `/api/shopping` — derive shopping list from the current week's plan (computed on request, not stored)
- `/api/categorise` — internal route called at ingredient-save time to AI-classify an ingredient into an aisle

**Database:** SQLite file at `data/shopping.db`, initialised on first boot via a migration script.

**AI calls:** Gemini is called once per unique ingredient name, at save time. The result (aisle name + sort order) is persisted to the DB. AI is never called on page load.

---

## Data Model

### `meals`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `name` | TEXT NOT NULL | meal display name |
| `notes` | TEXT | optional free-text notes |
| `created_at` | TEXT | ISO timestamp |

### `ingredients`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `meal_id` | INTEGER FK | references `meals.id`, cascade delete |
| `name` | TEXT NOT NULL | ingredient name (parsed) |
| `quantity` | REAL | nullable — some ingredients have no quantity |
| `unit` | TEXT | e.g. `g`, `ml`, `tsp`, `can`, nullable |
| `aisle` | TEXT | AI-assigned label (see aisle list below) |
| `aisle_order` | INTEGER | 1–7, AI-assigned, used for sorting |

### `weekly_plan`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `week_start` | TEXT NOT NULL | ISO date of the Monday of that week |
| `day_of_week` | INTEGER NOT NULL | 0 = Monday … 6 = Sunday |
| `meal_id` | INTEGER FK | nullable — null means no meal assigned |

Unique constraint on `(week_start, day_of_week)`.

**"Current week"** is always defined as the ISO week containing today's date, with `week_start` set to the Monday of that week (derived server-side via `date-fns` or plain JS `Date` arithmetic). The UI always shows and operates on the current week only — there is no week navigation.

### Aisles (fixed set)
| Order | Label |
|---|---|
| 1 | Produce |
| 2 | Meat & Seafood |
| 3 | Dairy |
| 4 | Deli |
| 5 | Bakery |
| 6 | Frozen |
| 7 | Pantry & Dry Goods |

---

## UI & Screens

### Shell Layout
- **Left sidebar:** ~80px wide, contains 3 large icon buttons (Plan, Meals, Shopping). Active section highlighted. Minimum tap target 48px.
- **Content area:** remainder of viewport, scrollable.
- On narrow mobile viewports: sidebar collapses to a bottom tab bar.

### Screen 1 — Weekly Plan (default)
- 7 day columns (Mon–Sun) as large tappable cards filling the content area.
- Each card: day label + assigned meal name, or a large "+" if empty.
- Tapping an empty card → full-screen meal picker (searchable scrollable list of all meals).
- Tapping an assigned card → options overlay: "Change" or "Remove".
- Fixed bottom bar: "Generate Shopping List" button, enabled once ≥1 meal is assigned. Tapping navigates to the Shopping List screen.

### Screen 2 — Meals Library
- Scrollable grid of meal cards (2 columns on mobile, 3–4 on landscape).
- Each card: meal name, ingredient count.
- Large "+" FAB (bottom-right) to add a new meal.
- Tapping a meal card → edit sheet (slide-up on mobile, modal on desktop):
  - Meal name field
  - Free-text ingredient list textarea (one ingredient per line or comma-separated)
  - Save button — triggers parse + AI categorisation
  - Delete button (with confirmation)

### Screen 3 — Shopping List
- Read-only, derived from current week's plan.
- Items grouped under aisle headings, sorted by `aisle_order`.
- Each item: ingredient name + aggregated quantity/unit (quantities of the same ingredient across multiple meals are summed).
- "Clear Week" button resets all day slots for the current week (with confirmation).
- Print-friendly: clean layout that reads well on-screen and when printed.

---

## Ingredient Parser

Runs client-side or server-side (server preferred) on the raw text blob from the edit sheet. Handles:
- `500g chicken breast` → `{quantity: 500, unit: "g", name: "chicken breast"}`
- `2 cans tomatoes` → `{quantity: 2, unit: "can", name: "tomatoes"}`
- `1 tbsp olive oil` → `{quantity: 1, unit: "tbsp", name: "olive oil"}`
- `garlic` (no quantity) → `{quantity: null, unit: null, name: "garlic"}`

Implemented as a regex pipeline. Lines/items that don't match any pattern are stored as raw name with null quantity — they still appear on the shopping list.

---

## AI Categorisation

**Route:** `POST /api/categorise`  
**Called by:** meal save handler, once per ingredient, server-side only.

**Gemini prompt (system):**
> You are a supermarket inventory classifier. Given an ingredient name, respond with JSON only: `{"aisle": "<label>", "aisle_order": <1-7>}`. Use exactly one of these labels: Produce, Meat & Seafood, Dairy, Deli, Bakery, Frozen, Pantry & Dry Goods.

**Fallback:** If the API call fails or the response cannot be parsed, the ingredient is assigned `{aisle: "Pantry & Dry Goods", aisle_order: 7}`. The app never surfaces an error to the user for categorisation failures.

**Model:** `gemini-1.5-flash` (fast, cheap, sufficient for single-label classification).

---

## Shopping List Derivation

On `GET /api/shopping?week=YYYY-MM-DD`:
1. Query `weekly_plan` for the given `week_start` where `meal_id IS NOT NULL`.
2. Join to `ingredients` via `meal_id`.
3. Group by `(name, unit, aisle, aisle_order)` — sum `quantity` within each group.
4. Sort by `aisle_order` ASC, then `name` ASC within each aisle.
5. Return grouped structure: `{ aisle: string, items: { name, quantity, unit }[] }[]`.

---

## Key Constraints

- **Touch-first:** All interactive elements ≥ 48px tap target. No hover-dependent UI.
- **Landscape-optimised:** Primary layout assumes landscape viewport (sidebar left, content right). Degrades gracefully to bottom-tab layout on portrait/mobile.
- **No authentication:** Single-user, no login required.
- **Offline-tolerant:** All data is local SQLite. The only network dependency is Gemini at ingredient-save time — failures are silently handled.
- **No stored shopping list:** Always derived fresh from the current week's plan. No stale data issues.
