# KnowMe — visual direction and review contract

## Product posture

KnowMe is a practical, role-aware, Ukrainian-language workspace for profiles, matching and specialist tools. It is **not** a marketing landing page or a decorative dashboard. The visual target is **quiet, precise, premium utility**: enough density to complete a task, calm hierarchy, legible text, and predictable interactions.

This document defines **review criteria**, not a mandate to redesign every screen. Preserve the existing product identity and established decisions described in `CLAUDE.md`. Never replace functional controls, access behavior or terminology merely to satisfy an aesthetic preference.

## Source of truth, in order

1. `CLAUDE.md`: roles, privacy constraints, QA accounts, routes, UX decisions and live-application setup.
2. Existing components and tokens: inspect the actual styling before suggesting a new palette. In particular, check `--km-font-display`, primary navigation sizing (`TOP_NAV_HEIGHT` / `--km-top-nav-h`), profile presentation and `src/components/matchingRoleColors.js` when relevant.
3. This document: design principles and quality bar.
4. Reference screenshots approved by the product owner: use as **inspiration for qualities**, not as permission to copy protected branding or overwrite KnowMe's workflows.

If references conflict with access rules or existing UX commitments, the access and behavior contracts win. If there is a genuine visual-design choice, show the trade-off and recommend one coherent direction.

## Visual principles

1. **Hierarchy before decoration.** Make the primary task, current state and next action visible immediately. Separate page, section, field and metadata levels using layout and typography, not a pile of boxes.
2. **Composition with intent.** Use a consistent grid, left edges, spacing rhythm, line lengths and alignment. Prefer real content examples and realistic Ukrainian labels over lorem ipsum.
3. **Disciplined typography.** Readable body size, deliberate display/body contrast, consistent line heights and numeral alignment. Handle long names, status text, errors and empty values without clipping.
4. **Restraint.** Avoid gratuitous gradients, glassmorphism, ornamental icons, nested cards, oversized roundings, multicolored chips, shadows and motion. A component should earn its visual prominence.
5. **Information density is a feature.** Users manage many cards and fields. Don't enlarge everything until useful content disappears below the fold. Dense does not mean cramped.
6. **Semantic color.** Reuse existing colors and role tokens. Color must help explain state, category, risk or action; it must not be the only means of conveying meaning.
7. **Coherent states.** Design loading, empty, error, partial, disabled, success and offline states alongside the happy path. Don't hide key actions behind hover-only affordances.
8. **Accessibility.** Readable contrast, visible keyboard focus, clear labels, logical tab sequence, touch-friendly hit areas and reduced-motion behavior. Aim for WCAG AA contrast where applicable.
9. **Mobile-first, desktop-intentional.** Review real screenshots at **390 px** and at a **desktop width (at least 1280 px)**. Mobile should not be a squeezed desktop, and desktop should not be a giant stretched phone.
10. **No privacy leaks.** Never use real user profile data in public reference images, exported examples or PR attachments. QA screenshots with sensitive content remain private.

## KnowMe-specific non-negotiables

- Read `CLAUDE.md` before touching a page. Its decisions on `/my-profile`, `/matching`, profile cards, roles, visibility, `PrimaryNavigation`, Flow and Utilities are part of the design contract.
- On mobile, the shared top navigation is a fixed-height slot. Do not reintroduce duplicated page headings or overflow the 53 px header.
- Reuse existing role labels, badges, profile facts and shared components; do not create independent versions that contradict matching or profile views.
- A visually attractive hidden/profile state is still wrong if it leaks information. Test both allowed and disallowed viewers when visibility may be affected.
- Do not edit shared QA profile data during visual review. If a task really requires writes, capture the original state, restore it, and document the restoration.

## Art direction quality gate — 19 November 2026

The product owner rejected the first three `/my-profile` redesign concepts as a **visual regression** despite possible UX advantages. This is a concrete negative reference, not a license to abandon usability.

**Rejected patterns (do not reproduce as default):**
- **Purple stepper wizard:** generic onboarding form, huge progress title, nested outlined card, redundant borders and a "new template" look detached from the rest of KnowMe.
- **Beige editorial profile:** large empty portrait/hero area when no image exists, arbitrary serif headline and maroon CTA, visual emptiness on desktop. The absence of a photo must never create a dominant blank rectangle.
- **Green admin editor:** desktop left navigation / central form / right profile review has useful functional potential, but generic enterprise styling, oversized mobile fields and a heavy bottom action make it feel dated.

These are criticisms of the *shown compositions*, not blanket prohibitions on purple, beige, green, steps, previews or column layouts. A future use must be justified and genuinely more refined.

**Latest owner preference (20 November 2026):** the CURRENT WORKING KnowMe UI is the preferred visual baseline, and the subsequent orange-accented, many-boxed two-column mobile profile concept was also rejected as **a visual regression despite usability gains**. Do not assume a redesign is desirable merely because it is polished.

**Default deliverable for visual-improvement requests:** baseline-first visual refinement. Preserve the existing visual language, identify **3–5 existing strengths**, and propose **at most 3 focused improvements**, with side-by-side evidence. If a proposal does not visibly beat the current design, reject it; reporting **no worthwhile visual changes** is acceptable. Read `.agents/skills/knowme-art-director/BASELINE_FIRST.md` in full. Offer a complete new concept only if the owner explicitly requests a full redesign; multiple concepts only when explicitly requested.

**Fourth rejected proposal (19–20 November 2026):** the orange-accented `/my-profile` mockup with two-column mobile inputs, many rounded nested blocks and repeated accent areas was acknowledged as more usable but still **several steps worse visually than the current product**. Avoid confusing a tidy, compact form with strong art direction. Before judging, compare the *existing UI*, not just the latest concept to the previous mockup.

**State-first composition:** account for no photo, photo present and unavailable photo Storage, as well as incomplete/complete profile data, different roles, long text and publication states. A photo can enrich a header if present; without it, use compact identity treatment (such as initials) and an accessible upload action, avoiding oversized placeholders. Do not assume the same publication requirements for all roles.

**Visual acceptance test:** compare the rendered concept side-by-side with the baseline in matching states at **390 px** and **desktop**. The revision must make the page *visibly better*, not merely different. Reject concepts with incoherent typography, arbitrary color switches, card nesting, giant unused areas, excessive form padding or generic template aesthetics, even if they improve the flow.

**Fidelity and honesty:** a textual description or wireframe describes a layout, but it does not establish high visual quality. Show realistic high-fidelity mockups when rendering tools support them, label them as mockups, critique the rendered result and iterate. Never claim a mockup is a screenshot of live code. Obtain owner approval before production redesign.

**Separate UX/QA from art direction:** defects, focus, contrast and publication clarity matter but cannot stand alone as an "art direction" response. Record them separately and apply them when implementing the chosen design.

## Art director review: four gates

### Gate A — Observe
Read the relevant `CLAUDE.md` scenario and neighboring flows. Inspect the running local page with the documented QA accounts. Capture baseline PNGs at 390 px and desktop for the relevant state(s). Include a short inventory of the current design tokens and reusable components. No invented screenshots.

### Gate B — Art-direct and refine
For ordinary requests to improve beauty, begin from the **current approved UI as baseline**; identify strengths and up to three concrete, high-impact refinements, then compare before/proposed images in the same 390 px/desktop roles and states. Only propose a new comprehensive visual concept if explicitly asked for redesign. Reject or revise anything that looks generic, incoherent or worse than the baseline. For explicitly requested QA audits, report observed defects; keep hypotheses and facts separate and obtain owner approval before changes.

### Gate C — Implement an approved direction
Only after approval, make coherent changes in the existing architecture. Reuse the right shared components and tokens, but do not let existing poor presentation dictate the new composition. Avoid new libraries, unexplained global CSS and needless refactors. Treat preservation of permissions, data and workflows as a hard constraint.

### Gate D — Verify and iterate
Run relevant existing tests and inspect the actual changed UI, not only CSS/JS source. Capture after PNGs at the **same viewport sizes and UI states** as the baseline, visually compare, and fix blocking issues. Check long Ukrainian text, focus, errors and role-specific content. Reread/update the affected `CLAUDE.md` scenario when behavior or QA steps change. Do not claim a visual pass if no browser session was completed.

## Severity and approval

- **Blocker** — functionality, access/visibility, critical responsiveness, loss of content, overlap that prevents use, broken navigation or inaccessible primary action. Must be fixed before marking ready.
- **Major** — confusing hierarchy, inconsistent shared component, unreadable text, keyboard/focus failure, disruptive motion, or substantial mobile/desktop degradation. Fix or document with owner approval.
- **Polish** — visual rhythm, slightly inconsistent whitespace, microcopy or subtle alignment. Resolve when feasible without creating regression.

A good design review is specific: “At 390 px the status wraps into the search control” is useful; “make it prettier” is not.

## Required handoff

**Visual refinement / concept-only:** affected routes and roles, current baseline screenshots when available, 3–5 observed strengths, up to three narrowly scoped proposals (mockups when feasible), like-for-like comparison at 390 px and desktop including photo/no-photo states where relevant, explicit verdict (better / uncertain / worse) and owner approval or recommendation to keep the current UI. For explicitly requested full redesigns, show the proposed high-fidelity concept and rejected alternatives. No claim of implementation or live "after" screenshots.

**Implementation:** approved visual direction, real before/after PNGs (private links when possible), meaningful changes, regressions, tests run, browser/account/viewport verified, and any blocker with the **last verified step** and **next action**. Never present generated mockups as live-application screenshots or automated tests as manual visual verification.

## Reference collection

When the owner approves references, record their URL, what quality is being borrowed (typography, hierarchy, density, navigation, etc.), and the relevant KnowMe component. Record deliberate rejections too, so Codex doesn't repeatedly propose them. Do not prescribe Linear/Notion/Stripe as a fixed visual identity.
