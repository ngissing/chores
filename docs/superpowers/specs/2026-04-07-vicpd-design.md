# VicPD — Design Spec
*Professional Learning Finder for Victorian Teachers*

**Date:** 2026-04-07
**Status:** Approved

---

## Overview

VicPD is a public web app that automatically discovers, collates, and surfaces professional learning (PD) opportunities for Victorian teachers. It scrapes known Victorian education sources on a daily schedule and supplements results with on-demand web search. Teachers can browse, filter, search, and save opportunities anonymously; optional account creation enables Claude-powered personalised recommendations.

**Target users:** Individual Victorian teachers (self-directed learners), all sectors (government, Catholic, independent).
**Scale:** Public, potentially thousands of concurrent users.
**Primary goal:** A teacher opens VicPD, sees opportunities relevant to them immediately, with minimal friction.

---

## Tech Stack

| Layer | Tool | Reason |
|---|---|---|
| Frontend + API routes | Next.js (App Router) on Vercel | Managed hosting, generous free tier, cron support |
| Database + Auth | Supabase (Postgres) | Managed, free tier, built-in auth for optional accounts |
| Scraping | Firecrawl | Reliable JS-rendered scraping, simple API |
| Web search | Brave Search API | Low cost, no usage tracking, good results |
| AI | Claude API (claude-sonnet-4-6) | Extraction, search ranking, recommendations |
| Scheduling | Vercel Cron | Triggers daily scrape job, no extra infrastructure |

---

## Architecture

```
Victorian Sources (DET, VIT, AEU, VCAA, unis, independent providers)
        ↓ daily scrape (Firecrawl) + on-demand web search (Brave)
        ↓ Claude API extracts + structures PD records
    Supabase (Postgres)
        ↕ queries + writes
    Next.js API Routes (Vercel)
        search · recommendations · filters · profile · scrape trigger
        ↕
    Next.js Frontend (Vercel)
        Browse · Filter · Search · Saved · Profile · Recommendations
```

All components are stateless and hosted on managed platforms. No self-managed servers.

---

## Data Model

### `opportunities`
The core table. One row per PD listing.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text | |
| description | text | Max ~150 words, Claude-summarised |
| provider | text | e.g. "VIT", "DET", "AEU Victoria" |
| url | text | Link to register or learn more |
| source_url | text | Page we scraped — used for deduplication |
| type | enum | conference · workshop · online · accredited_course · resource |
| cost | text | "Free", "$95", "Varies" |
| date_start | date | Null for self-paced/ongoing |
| date_end | date | Null if single day or ongoing |
| location | text | "Online", "Melbourne CBD", "Regional Vic" |
| teaching_areas | text[] | e.g. ["Maths", "Science"] |
| year_levels | text[] | e.g. ["7–10", "VCE"] |
| tags | text[] | e.g. ["wellbeing", "literacy", "leadership"] |
| is_accredited | boolean | VIT-accredited PD |
| expires_at | date | Auto-hide after this date (= date_end or ~30 days post-event) |
| is_active | boolean | Set false by nightly cron when expires_at < NOW() |
| created_at | timestamp | |
| updated_at | timestamp | |

### `sources`
Known Victorian sites to scrape.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "VIT Professional Learning" |
| url | text | Entry point for scrape |
| scrape_frequency | enum | daily · weekly |
| last_scraped_at | timestamp | |
| is_active | boolean | Toggle without deleting |

Initial sources: VIT, DET PD catalogue, VCAA, AEU Victoria, Bastow Institute, University of Melbourne Education, Monash Education, Deakin Education, Catholic Education Melbourne, Independent Schools Victoria.

### `user_profiles`
Optional. Created on first sign-up or when anonymous user sets preferences.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| anon_id | uuid | From browser localStorage — bridges anonymous → signed-in |
| email | text | Null if anonymous |
| teaching_areas | text[] | |
| year_levels | text[] | |
| interests | text[] | Free-form tags e.g. "restorative practices", "data literacy" |
| school_type | enum | government · catholic · independent |
| created_at | timestamp | |

### `user_interactions`
Behaviour log — powers recommendations.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| anon_id | uuid | |
| opportunity_id | uuid FK → opportunities | |
| action | enum | view · save · click_through · dismiss |
| timestamp | timestamp | |

### `saved_opportunities`
Teacher's personal bookmark list.

| Column | Type | Notes |
|---|---|---|
| anon_id | uuid | |
| opportunity_id | uuid FK → opportunities | |
| saved_at | timestamp | |
| notes | text | Optional personal note |

### `recommendation_cache`
Caches Claude's ranked picks per user to avoid re-calling the API on every page load.

| Column | Type | Notes |
|---|---|---|
| anon_id | uuid PK | |
| opportunity_ids | uuid[] | Ranked list of IDs |
| reasons | text[] | One-sentence reason per pick |
| generated_at | timestamp | Expire after 1 hour |

---

**Deduplication:** Before inserting a scraped opportunity, the pipeline checks for an existing row with a matching `source_url` or a (title + provider + date_start) tuple. Duplicates are updated in place rather than inserted.

---

## AI & Data Collection Pipelines

### Pipeline 1 — Scheduled Scraping
Trigger: Vercel Cron, daily at 2am AEST.

1. Fetch all active rows from `sources`.
2. For each source, call Firecrawl to crawl the URL and return markdown.
3. Send markdown to Claude API with prompt:
   > *"You are extracting professional learning opportunities from this Victorian education website. Return a JSON array. For each opportunity include: title, provider, type (conference|workshop|online|accredited_course|resource), cost, date_start (YYYY-MM-DD or null), date_end (YYYY-MM-DD or null), location, teaching_areas (array), year_levels (array), tags (array), is_accredited (boolean), url, description (max 100 words). Only include Victorian opportunities. Return [] if none found."*
4. Upsert results into `opportunities`. Skip or update duplicates by `source_url`.
5. Set `expires_at` = `date_end` if present, otherwise `date_start + 30 days`, otherwise `NOW() + 90 days` for resources.

### Pipeline 2 — On-Demand Web Search
Trigger: User submits a search query.

1. Query Supabase full-text search first (fast, free).
2. In parallel, send query to Brave Search API: `"{query} professional learning Victoria teachers site:.vic.gov.au OR site:.edu.au"`.
3. Pass top 5 Brave results to Claude:
   > *"From these web search results, extract any Victorian teacher professional learning opportunities not already in our database. Return structured JSON matching the opportunities schema, or [] if nothing new."*
4. Upsert any new records. Merge with DB results and return combined list.

### Pipeline 3 — Personalised Recommendations
Trigger: Teacher loads the homepage, if no cached result exists for their `anon_id` (cache TTL: 1 hour). Also triggered on profile change.

1. Fetch the teacher's `user_profile` (or anonymous profile from localStorage).
2. Fetch their last 20 `user_interactions`.
3. Fetch upcoming non-expired opportunities (next 90 days + ongoing resources), limit 100.
4. Send to Claude:
   > *"You are recommending professional learning for a Victorian teacher. Profile: {profile}. Recent interactions: {interactions}. Available opportunities (JSON): {opportunities}. Return the IDs of the 8 best matches, ranked, with a one-sentence reason for each. Exclude anything they have dismissed."*
5. Return ranked opportunities with reasons for display in "Picked for you" strip.

---

## Frontend Pages

### 1. Browse (Home) — `/`
- Search bar (full-width, prominent)
- "Picked for you" horizontal strip (visible once profile set, even anonymously)
- Left sidebar filters: Type · Cost · Location · Teaching Area · Year Level · Accredited only
- Results grid (2 columns desktop, 1 mobile): PD cards with type badge, provider, date, location, cost, save button
- Sort: Upcoming date · Relevance · Recently added
- Infinite scroll (load 24 per page)

### 2. PD Detail — `/opportunity/[id]`
- Full title, provider, description
- Date, location, cost, accreditation badge
- "Register / Learn more" button (opens source URL)
- Related opportunities (DB query: same teaching_areas or overlapping tags, limit 4 — no Claude call needed)
- Save button + personal note field

### 3. My Saved PD — `/saved`
- List of bookmarked opportunities with personal notes
- Sort by saved date or upcoming date
- Stored in localStorage (anonymous) or Supabase (signed-in)

### 4. My Profile — `/profile`
- Teaching area(s), year level(s), interests (free tags), school type
- Shown as a prompt on first visit: "Tell us about your teaching to get personalised recommendations"
- Stored in localStorage (anonymous) or Supabase (signed-in)
- Optional: sign up with Google to sync across devices

### 5. Admin — `/admin` (password-protected, for you)
- View/edit sources list
- Trigger manual scrape
- View opportunity database, mark inactive, edit fields

---

## Error Handling

- **Scrape failures:** Log error against the source row, continue with other sources. Alert via email if >3 consecutive failures for a source.
- **Claude API errors:** Retry once with exponential backoff. If extraction fails, skip the batch and log. Never block the UI.
- **Search with no results:** Fall back to full DB browse with a "No exact matches — showing all upcoming opportunities" message.
- **Expired opportunities:** Cron job runs nightly to set `is_active = false` on rows where `expires_at < NOW()`. Frontend never queries expired rows.
- **Stale recommendations:** Cache recommendations per `anon_id` in a `recommendation_cache` Supabase table (TTL 1 hour). Regenerate on profile change or expiry. Anonymous users are prompted to sign up if they have 3+ saves, to prevent localStorage loss.

---

## Testing Approach

- **Unit tests:** Claude extraction prompt tested with fixture HTML from each known source (confirm output schema is valid).
- **Integration tests:** Scrape pipeline run against a local mock of Firecrawl responses.
- **E2E tests:** Playwright — search, filter, save, and profile flow on staging.
- **Manual QA:** Before each deploy, verify at least one real scrape runs and produces valid results.

---

## Out of Scope (v1)

- Email digest / notifications
- School admin dashboard
- Mobile app (responsive web only)
- International or interstate PD
- Integration with DET HR systems or VIT registration tracking
- User-submitted opportunities

---

## Open Questions

None — all resolved during design session.
