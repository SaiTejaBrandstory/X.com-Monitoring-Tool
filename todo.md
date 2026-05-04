# PersonaRewire — MVP Development Plan

## Design References
- Inspired by: Linear (clean dashboard), Notion (sidebar nav), Vercel (dark mode elegance)
- **Color Palette**:
  - Primary: Violet `#7C3AED`, Indigo `#4F46E5`
  - Accent: Emerald `#10B981` (success), Amber `#F59E0B` (warning), Rose `#EF4444` (danger)
  - Background: Slate `#0F172A` (dark), `#F8FAFC` (light)
  - Border: `#1E293B` / `#E2E8F0`
- **Typography**: Inter for UI, JetBrains Mono for metrics
- **Key Components**: Glass-morphic cards, subtle gradients on hero, platform badges (Twitter blue / LinkedIn blue), virality arrows (↑ green, → gray, ↓ red)

## Images to Generate
- hero-dashboard-banner.png — sleek abstract data flow visualization with violet/indigo gradient, social feed imagery
- persona-workspace-illustration.png — dual-panel writing concept, minimalist line art
- empty-state-feed.png — friendly illustration for empty feed state
- cost-tracker-icon-set.png — small infographic bundle for budget/cost dashboard

## File Plan (max 8 files)
1. `src/pages/Index.tsx` — Main app shell with sidebar + routing
2. `src/pages/AuthCallback.tsx` — (already provided by template, read-only)
3. `src/pages/AdminConfig.tsx` — Admin config panel `/admin/config`
4. `src/components/LiveFeed.tsx` — Viral feed with filters, sort, engagement cards
5. `src/components/ProfileManager.tsx` — Category + profile CRUD + CSV import
6. `src/components/PersonaManager.tsx` — Persona CRUD
7. `src/components/RewriteWorkspace.tsx` — Side-by-side original/rewritten + constraints
8. `src/components/CostTracker.tsx` — Cost dashboard with alerts + export
9. `src/lib/api.ts` — Shared API helpers (web-sdk wrappers, engagement math)
10. `src/App.tsx` — Routes: /, /admin/config, /auth/callback

Note: Saved Posts library is embedded inside LiveFeed sidebar panel to stay within file cap.

## Development Tasks
- [x] Generate 4 project images
- [x] Update `src/App.tsx` with routes (/, /admin/config, /auth/callback)
- [x] Build `src/lib/personaApi.ts` with entity helpers and engagement math
- [x] Build `src/pages/Index.tsx` shell with sidebar + tab switching (Feed / Profiles / Personas / Costs)
- [x] Build `src/components/LiveFeed.tsx` with filters, sort, save-post action, saved-posts tab
- [x] Build `src/components/ProfileManager.tsx` with category CRUD + profile CRUD
- [x] Build `src/components/PersonaManager.tsx` with persona CRUD and few-shot examples
- [x] Build `src/components/RewriteWorkspace.tsx` (modal) with hook extract + rewrite + constraints panel
- [x] Build `src/components/CostTracker.tsx` with totals, budget alerts, 7-day chart
- [x] Build `src/pages/AdminConfig.tsx` with config_keys editor
- [x] Compliance UI: compliance notice on rewrite, provenance metadata, adaptation framing
- [x] Run pnpm install + lint + build; all passed
- [x] CheckUI final render validation
- [x] Fix category handling bug: Categories is shared data (no user_id column); removed user_id filters from CategoriesService so create/list/update/delete work correctly
- [x] Fix monitored_profiles bug: same shared-table pattern — removed user_id filters from Monitored_profilesService
- [x] Create `api_spaces` backend table (label, provider, api_token_encrypted, actor_type, platform, proxy_group, is_active, last_tested_at, test_status, notes) — shared data, no user_id
- [x] Add custom router endpoints: POST `/api_spaces/{id}/set_active` (one-active-per-platform) and POST `/api_spaces/{id}/test` (mock connection test)
- [x] Add frontend types + helpers in `personaApi.ts`: `ApiSpace`, `listApiSpaces`, `setActiveApiSpace`, `testApiSpace`, `getActiveApiSpaceFor`
- [x] Build `src/components/ApiSpacesManager.tsx`: table view, add/edit/delete dialog (label, platform, actor, proxy, masked token, notes), Activate / Test / Edit / Delete actions, per-platform active summary cards
- [x] Refactor `src/pages/AdminConfig.tsx` into Tabs: General (existing config_keys) + API Spaces (new manager)
- [x] Lint + Python syntax check passed

## New: X.com API Integration into Live Feed
- [x] Add `routers/xcom_scan.py` with POST `/api/v1/xcom/scan` and GET `/api/v1/xcom/status`
- [x] Resolve active Apify token from `api_spaces` (platform="twitter", is_active=true)
- [x] Integrate Apify `apidojo~tweet-scraper` with `profile_ids`, `posts_per_profile`, `date_from`, `date_to`
- [x] Deterministic mock-data fallback when no Apify token is configured (demo-friendly)
- [x] Dedup by (platform, raw_url) + refresh engagement on existing rows; compute virality trend
- [x] Add `scanXcom`, `getXcomStatus`, related types to `personaApi.ts`
- [x] LiveFeed: status badge (connected / mock), "Scan X.com" dialog with date range, posts-per-profile, profile filter, per-profile result summary, error toasts
- [x] Lint + Python syntax check

## New: AI Persona Auto-generation + Funnel Stage Mapping
- [x] Extend `personas` table: add `funnel_stages` column via schema repair migration
- [x] Add POST `/api/v1/personas/suggest` endpoint (gpt-5.4) returning N personas with TOFU/MOFU/BOFU guidance
- [x] Update `/api/v1/rewrite/generate` to accept optional `funnel_stage` + `funnel_stage_guidance` and inject into the system prompt
- [x] Update `personaApi.ts`: `FunnelStage`, `FunnelStageMap`, `parseFunnelStages`, `stringifyFunnelStages`, `suggestPersonas`, `funnel_stage*` on generate args
- [x] Update `PersonaManager.tsx`: "✨ Suggest with AI" dialog (category + count + platform), suggestion cards with TOFU/MOFU/BOFU preview, Save / Save all; add funnel-stage textareas to edit form
- [x] Update `RewriteWorkspace.tsx`: add funnel stage selector, auto-pull persona's stage guidance, pass it to generate
- [x] Lint + Python syntax check passed