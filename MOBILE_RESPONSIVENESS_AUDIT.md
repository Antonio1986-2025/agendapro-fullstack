# AgendaPro — Mobile Responsiveness Audit

**Date:** 2026-07-07  
**Audit scope:** All 22 HTML pages in `/public/`  
**Method:** Static source analysis of each HTML file + `design-system.css`  

---

## Executive Summary

All 22 pages have `viewport-fit=cover` — a good baseline. However, consistent gaps across pages include: missing `safe-area-inset` on fixed bottom navs/headers, touch targets below the 44×44px minimum, and grid layouts that don't stack on narrow viewports (320–375px). The best page is **agendar.html** (score 9/10) — the only one with proper safe-area handling. The worst is **estoque-mobile.html** (score 5/10) due to a 3-column grid on mobile and 4 action icons that overflow at 320px.

**No reCAPTCHA or third-party blocker dependency was found** in any page.

---

## Per-Page Analysis

### 1. `index.html` (Landing Page)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | No hamburger menu — `.header-actions` links (inline flex) overflow on 320px. Backdrop-filter blur on fixed header may cause jank. No `env(safe-area-inset-top)` on fixed header. Hero `clamp()` font-size is good. **`overflow-x: hidden`** on body prevents scroll but can clip content. |
| CSS_CLASSES_USED | `.header`, `.container`, `.logo`, `.header-actions`, `.btn-outline`, `.btn-primary-lp`, `.btn-secondary-lp`, `.section-card`, `.accordion`* |
| SCORE | **6/10** |

### 2. `login.html` (Auth)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Card `max-width: 440px` — well-constrained. Password toggle (fa-eye) touch target small. No `env(safe-area-inset-bottom)`. |
| CSS_CLASSES_USED | `.card`, `.input`, `.btn`, `.btn-primary`, `.btn-full`, `.tabs`, `.tab`, `.alert`, `.alert-error` |
| SCORE | **8/10** |

### 3. `onboarding.html` (Welcome)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Step indicator dots may be small. Checklist items — fine. Simple layout, low risk. |
| CSS_CLASSES_USED | `.card`, `.section-card`, `.btn`, `.btn-primary`, `.btn-full` |
| SCORE | **7/10** |

### 4. `onboarding-step1.html` (Barbearia Info)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | `.form-row` (1fr 1fr) — no stacking breakpoint, fields get <140px on 320px. Logo upload area trigger OK. No safe-area. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-full`, `.form-row`, `.form-group`, `.alert` |
| SCORE | **6/10** |

### 5. `onboarding-step2.html` (Professionals)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | `.form-row` 1fr 1fr — no stacking breakpoint. Icon-btn (36×36) below 44×44 minimum. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.form-row`, `.card` |
| SCORE | **6/10** |

### 6. `onboarding-step3.html` (Services)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | `.form-row` with `2fr 1fr 1fr` — 1fr columns get <90px on 320px. No stacking breakpoint. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.form-row` |
| SCORE | **5/10** |

### 7. `onboarding-step4.html` (WhatsApp Config)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Stacked form layout — no grid columns, so relatively safe. No safe-area. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.alert`, `.switch-row` |
| SCORE | **7/10** |

### 8. `onboarding-step5.html` (Completion Summary)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Animated counters, 2-column stats grid — might wrap oddly on 320px. No safe-area. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-full` |
| SCORE | **7/10** |

### 9. `barbeiro.html` (Barber Dashboard)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | **CSS version mismatch**: uses `design-system.css?v=20260623b` vs `?v=20260623` on all other pages. Tabs (Agenda/Clientes/Financeiro) may overflow. `.row2` 1fr 1fr in modal — no stacking breakpoint. Icon-btn 36px — below minimum. Date nav arrows + text get cramped at 320px. No safe-area. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.card`, `.section-card`, `.data-table`, `.badge`, `.modal-overlay`, `.modal`, `.tabs`, `.tab` |
| SCORE | **6/10** |

### 10. `dashboard-mobile.html` (Main Mobile Dashboard)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | `.metrics-grid` 2-column — gets tight at 320px. Staggered-entry animation may cause jank on low-end devices. **Bottom nav with 6 items** at `min-width: 60px` = 360px min-width — overflows 320px screens. No safe-area-inset-bottom on nav. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-sm`, `.metric-card`, `.appointment-card`, `.action-btn`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.sidebar-item`, `.desktop-layout`, `.desktop-only`, `.desktop-header`, `.page-title`, `.page-subtitle` |
| SCORE | **7/10** |

### 11. `agenda-mobile.html` (Schedule)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Calendar grid `repeat(7, 1fr)` — each cell ~45px at 320px, acceptable but tight. Date nav arrows + text compressed. No safe-area. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-sm`, `.input`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only` |
| SCORE | **7/10** |

### 12. `clientes-mobile.html` (Clients)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Client cards with avatar + info + actions — icon-btn 36px. Bottom nav tight with 6 items. No safe-area. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-sm`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.data-table` |
| SCORE | **7/10** |

### 13. `comanda-detalhe.html` (Command Detail)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Table-based item list may overflow. Add-item modal with bottom sheet — good. No safe-area. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.input`, `.modal-overlay`, `.modal`, `.data-table`, `.section-card` |
| SCORE | **7/10** |

### 14. `servicos-mobile.html` (Services)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | **`.row2` (1fr 1fr) has NO stacking breakpoint** — unlike profissionais-mobile.html which has `@media (max-width: 400px)`. FAB has `right: 24px` with **no responsive positioning** (profissionais has `calc(50% - 240px + 20px)` + breakpoint). Icon-btn 36px. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.desktop-header`, `.data-table`, `.section-card`, `.modal-overlay`, `.modal` |
| SCORE | **6/10** |

### 15. `profissionais-mobile.html` (Professionals)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Checkboxes (20×20px) used as toggle switches — below 44×44 minimum. Long permission list scrolls in modal — OK. Icon-btn 36px. No safe-area. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.data-table`, `.section-card`, `.modal-overlay`, `.modal`, `.switch-row` |
| SCORE | **8/10** — best among CRUD pages, has row2 and FAB breakpoints |

### 16. `estoque-mobile.html` (Inventory)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | **`row3` (3-column grid** on mobile) — at 320px each column ~90px, inputs unusably narrow. `.row2` — no stacking breakpoint. **4 icon-btns in `.est-actions`** (~160px total) — overflows 320px cards. FAB has no responsive positioning. No safe-area. |
| CSS_CLASSES_USED | `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.data-table`, `.section-card`, `.modal-overlay`, `.modal` |
| SCORE | **5/10** — worst score, 3-col grid is critical issue |

### 17. `financeiro-mobile.html` (Financial)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Period selector (4 buttons in flex) — text may truncate at 320px. **Bottom nav with 6 items** may overflow. No safe-area. Summary card with gradient and 3 stats — OK. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-sm`, `.btn-success`, `.btn-outline`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.desktop-header`, `.section-card`, `.data-table`, `.badge` |
| SCORE | **7/10** |

### 18. `relatorios-mobile.html` (Reports)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Period tabs `flex: 1` — "Personalizado" text wraps on 320px. Bar chart bars may be thin. Bottom nav with 6 items — overflow risk. No safe-area. |
| CSS_CLASSES_USED | `.btn`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.desktop-header`, `.page-title`, `.page-subtitle`, `.chart-card`, `.metric-card` |
| SCORE | **7/10** |

### 19. `configuracoes-mobile.html` (Settings)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Mix of `rem` and `px` in `.edit-profile-btn` padding. Bottom nav with 6 items. No safe-area. Toggle switches (50×24px) — functional but slider is 20×20px. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-sm`, `.btn-outline`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.desktop-header`, `.config-section`, `.config-card`, `.config-item`, `.toggle-switch`, `.modal-overlay`, `.modal-box`, `.input`, `.textarea` |
| SCORE | **8/10** — well-structured, consistent mobile layout |

### 20. `equipe.html` (Team)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Similar to profissionais-mobile. Icon-btn 36px. No safe-area. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.input`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only`, `.data-table`, `.section-card` |
| SCORE | **7/10** |

### 21. `chat-mobile.html` (Chat Support)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Chat message bubbles — dynamic, likely OK. No safe-area. Bottom nav with 6 items. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.input`, `.bottom-nav`, `.nav-item`, `.sidebar`, `.desktop-layout`, `.desktop-only` |
| SCORE | **7/10** |

### 22. `agendar.html` (Public Scheduling)
| Check | Status |
|---|---|
| HAS_VIEWPORT | **Yes** — `viewport-fit=cover` |
| MOBILE_ISSUES | Minor: `max-width: 480px !important` on desktop is opinionated. |
| CSS_CLASSES_USED | `.btn`, `.btn-primary`, `.btn-full`, `.input`, `.alert`, `.alert-error` |
| SCORE | **9/10** — **BEST PAGE**. Only page with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`. Has 3 responsive breakpoints for time-slot grid (4→3→2 columns). |

---

## Global Cross-Cutting Issues

### 🔴 Critical

| Issue | Affected Pages | Details |
|---|---|---|
| **No safe-area-inset on fixed/sticky elements** | 21/22 | Only `agendar.html` uses `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`. All bottom navs, sticky headers, and FABs render behind notches/system bars on iPhone X+ |
| **3-column grid on mobile** | estoque-mobile.html | `.row3` with no breakpoint — fields ~90px wide at 320px |
| **4 action icons in tight card** | estoque-mobile.html | `.est-actions` with 4 × 36px buttons + gaps ~160px — overflows 320px cards |
| **Bottom nav 6 items** | dashboard-mobile, financeiro-mobile, relatorios-mobile, configuracoes-mobile, chat-mobile, clientes-mobile | 6 nav items × `min-width: 60px` = 360px minimum — overflows on 320px screens |

### 🟠 High

| Issue | Affected Pages | Details |
|---|---|---|
| **`.row2` without stacking breakpoint** | servicos-mobile, estoque-mobile, onboarding-step1, onboarding-step2 | 2-column grid doesn't collapse to 1 column at narrow widths. **profissionais-mobile.html has the fix** (`@media max-width: 400px`) — not replicated |
| **CSS version mismatch** | barbeiro.html | Uses `?v=20260623b` vs all others use `?v=20260623` — cached CSS may differ |
| **Icon buttons 36×36px** | ALL authenticated pages | WCAG minimum touch target is 44×44px. `.icon-btn` used for edit/delete/movimentar actions |
| **Checkboxes as toggles** | profissionais-mobile.html | 20×20px checkboxes used for permissions — virtually untappable on mobile without precision |

### 🟡 Medium

| Issue | Affected Pages | Details |
|---|---|---|
| **Missing responsive FAB positioning** | servicos-mobile, estoque-mobile (and most others) | FAB uses fixed `right: 24px`. **profissionais-mobile has the fix** — a `calc()` position + `@media max-width: 520px` |
| **No hamburger menu** | index.html | Header links are full text — overflow at 320px |
| **Mixing px and rem in same rule** | configuracoes-mobile.html (`.edit-profile-btn`) | Inconsistent units |
| **Entry animation jank** | dashboard-mobile.html, relatorios-mobile.html, clientes-mobile.html | `translateY(20px)` + `opacity: 0` animations on all cards — can stutter on low-end Android |
| **Period button text wrapping** | financeiro-mobile, relatorios-mobile | `flex: 1` buttons may truncate or wrap "Personalizado" |
| **Calendar grid tightness** | agenda-mobile.html | `repeat(7, 1fr)` at 320px — each cell ~45px |

### 🟢 Low

| Issue | Affected Pages | Details |
|---|---|---|
| **Backdrop-filter performance** | index.html | `backdrop-filter: blur(10px)` on fixed header — GPU-heavy on old phones |
| **No `overscroll-behavior`** | ALL | Rubber-banding / pull-to-refresh not controlled |
| **Back button touch target** | ALL with `.back-btn` | Padding-only (no explicit width/height) |
| **No `-webkit-overflow-scrolling: touch`** | ALL with scroll containers | iOS smooth scrolling not enforced |

---

## `design-system.css` Gaps

| Gap | Impact |
|---|---|
| **No `safe-area-inset-*` CSS custom properties** | Every page re-implements or forgets safe-area handling. A `--safe-area-top` / `--safe-area-bottom` CSS var pair would fix 21 pages at once |
| **No `.icon-btn` touch-target override** | `.icon-btn` is 36×36px — should be `min-width: 44px; min-height: 44px` with inner icon centered |
| **No `@media` breakpoint for `.row2` → single column** | Currently each page defines its own — should be a utility class `.row-stack-sm` or responsive grid in the design system |
| **No bottom-nav safe-area mixin** | Every page's bottom-nav duplicates the same positioning pattern — a shared class should include safe-area |
| **No `prefers-reduced-motion`** | The entry animations on dashboard/relatorios don't respect OS motion preferences |

---

## Scoring Summary

| Score | Count | Files |
|---|---|---|
| **9/10** | 1 | agendar.html |
| **8/10** | 3 | login.html, profissionais-mobile.html, configuracoes-mobile.html |
| **7/10** | 11 | onboarding.html, onboarding-step4, onboarding-step5, dashboard-mobile.html, agenda-mobile.html, clientes-mobile.html, comanda-detalhe.html, financeiro-mobile.html, relatorios-mobile.html, equipe.html, chat-mobile.html |
| **6/10** | 4 | index.html, onboarding-step1, onboarding-step2, barbeiro.html, servicos-mobile.html |
| **5/10** | 2 | onboarding-step3, estoque-mobile.html |

**Overall average: 6.7/10**

---

## Top 5 Quick Wins

1. **Add `env(safe-area-inset-bottom)` to bottom nav** — 21 pages benefit from one CSS change in the shared `.bottom-nav` rule.
2. **Add `@media (max-width: 400px) { .row2, .row3 { grid-template-columns: 1fr; } }`** to the design system — fixes 3-column and 2-column overflow on 5+ pages.
3. **Bump `.icon-btn` to `min-width: 44px; min-height: 44px`** in the design system — fixes touch targets across all CRUD pages.
4. **Reduce bottom-nav items or add scroll** — the 6-item nav overflows 320px. Either remove "Equipe" duplicate (it appears in both nav and sidebar) or add `overflow-x: auto`.
5. **Standardize CSS version** — change barbeiro.html from `?v=20260623b` to `?v=20260623` to match all other pages.

---

## Dependency Check

| Dependency | Found? |
|---|---|
| reCAPTCHA v2 | ❌ No |
| reCAPTCHA v3 | ❌ No |
| Google Maps | ❌ No |
| Facebook SDK | ❌ No |
| Third-party JS widgets | ❌ None (only Font Awesome 6.0.0 from CDN + inline JS + `api.js`) |
