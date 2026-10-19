# Telegram chat intake

Turns a community Telegram chat into KnowMe profiles.

```
Telegram Web ─► Phase 1: Claude in Chrome reads the page text ─► telegram_intake.yaml
                classify messages, parse profiles, save every 100 messages
                                                                      │
KnowMe RTDB ◄─ Phase 2: Claude Code on knowme-app/main ───────────────┘
               match by telegram / phone, draft or overlay, private note
```

Core rule: **never drop data.** Every parsed value is written. Conflicts with
existing cards go in as overlays; the admin resolves them.

## Phase 1 — read the chat

The agent reads message text from the page (DOM). Claude in Chrome may still
capture the tab as screenshots internally — a prompt cannot switch that off,
so this route is not screenshot-free. A browser page cannot block those
captures, so a chat that forbids screenshots in the Telegram apps is still
readable here. A route with no screen capture at all is only the Telegram API
(e.g. a Telethon export run on your computer) — then Phase 1 reads the export
file instead of the screen.

Setup:
1. Chrome with the Claude in Chrome extension, signed in to
   `web.telegram.org` with the same account (saved contact names such as
   "УК СМ …" sync there).
2. Open the chat and scroll to the message to start from. That open position
   is the start; nothing else is specified.
3. In the Claude desktop app (or Claude Code on the same computer) start a
   new chat with Claude in Chrome connected, and send the prompt below plus
   the Schema section. Give the chat a working folder (the folder opened in
   the app, or the folder Claude Code runs in): the file goes there. The
   extension alone has no file access. Without file access the run goes one
   batch per reply (see the prompt): after each reply send "далі".

Fallback only if Telegram Web is not possible: Telegram Desktop with computer
use — it reads the screen through screenshots, so it fails on chats that
block them.

Prompt (use as is, nothing to fill in):

```
Work only in the Telegram chat open in the current tab, starting from the
message currently visible at the top of the chat. Read text from the page
(DOM); do not use the screenshot action. Read-only: send nothing, no reactions, open no
links, do not switch chats.
Write telegram_intake.yaml in this chat's working folder. No file access →
process ONE batch per reply: print the full YAML (previous YAML + this batch)
and stop; on "далі" find the `cursor` message on the page and continue from
it.

Loop until the end of the chat:
1. Read the next 100 messages downward from the current position.
2. For every message note its date (day separator) and time, the sender as
   displayed (the account's display name, e.g. "УК СМ Оля"), and the text.
3. Keep a message if it concerns, about the sender:
   - wanting or offering a program: egg donor (ed), surrogate (sm),
     intended parents (ip), agency (ag), clinic (cl);
   - program status, past programs, refusals;
   - profile facts: name, age, location, deliveries, C-sections, cycle,
     height, weight, blood, marital status, health, education, job,
     contacts;
   - agency/clinic/parents offers: program terms, payments, requirements,
     locations, contacts.
   Skip small talk. Facts about third parties do not go to the sender.
   Exception: a sender whose display name does NOT start with "УК СМ" is
   not a saved contact — keep EVERY message of theirs, small talk
   included, verbatim with date and time (see myComment).
4. For each new sender with a kept message: open their profile from the
   message, copy @username and phone if shown, return to the same place in
   the chat.
5. Merge into profiles (Schema); later messages update a profile.
6. Save: rewrite the file and set `cursor` to the last processed message
   (kept or skipped): its date and time, sender, first 60 characters of text.
7. Scroll down past the cursor message and go to step 1. When resuming,
   start AT the cursor message (inclusive): find it by date, time, sender
   and text, and skip messages already in the file (same date, time, sender
   and text) — several messages can share one minute.
Stop when the newest message is processed and scrolling brings nothing new.
Then report: messages processed, people by role, messages that could not be
read (date, time).

File:
chat: <chat title from the header>
cursor:
  datetime: DD.MM.YYYY HH:MM
  sender: <display name>
  text: <first 60 characters>
people:
  - <profile>
```

## Schema

One object per sender, keys in this order, omit unknown/empty, never `null`:

```yaml
name:
surname:
fathersname:
agencyName:
userRole:
birth:
blood:
maritalStatus:
csection:
weight:
height:
ownKids:
lastDelivery:
lastCycle:
experience:
education:
profession:
phone:
telegram:
city:
region:
country:
myComment:
```

- `name/surname/fathersname` — split a full name; never invent. For an
  agency/clinic: `agencyName` = organisation name, `name` = contact person.
- `userRole` — `ed` / `sm` / `ip` / `ag` / `cl`. Several roles → YAML list,
  main role last.
- `birth` — `DD.MM.YYYY`. Age only → `01.01.(message year − age)`;
  "37, turns 38 in August" → `01.08.(message year − 38)`.
- `blood` — `1+`…`4-`; O/I→1, II→2, III→3, IV→4.
- `maritalStatus` — `"Yes"` married, `"No"` unmarried/divorced (quoted).
- `csection` — count; `"-"` (quoted) if explicitly none.
- `weight` kg, `height` cm — numbers; range → midpoint; metres → cm.
- `ownKids` — all deliveries incl. surrogacy; twins = 1; not miscarriages,
  abortions, failed programs, egg donations.
- `lastDelivery`, `lastCycle` — `DD.MM.YYYY`; year only → `01.01.YYYY`;
  month+year → `01.MM.YYYY`; relative ("3 months ago") → from message date.
- `experience` — number of prior egg donations.
- `education` — `Higher` / `Technical` / `Secondary` / `Bachelor` / `Master`
  / `PhD`.
- `phone` — digits, international, no `+`; `0XXXXXXXXX` → `380XXXXXXXXX`.
- `telegram` — sender display name exactly as shown in the chat (e.g.
  `УК СМ Оля`); if a @username is also known → list
  `[<display name>, <username without @>]`. Never a phone.
- `city` without prefixes; `region` only if stated; `country` if stated.
- `myComment` — `|` literal, Ukrainian, one fact per line, each starting
  `🔏`. First line always
  `🔏Telegram: <display name>, DD.MM.YYYY HH:MM` (first kept message);
  second `🔏Повідомлення: DD.MM.YYYY HH:MM, …` (all used messages). Then
  everything without its own field: program wanted, status, history,
  geography, relocation, compensation and every payment (exact amounts,
  currencies, conditions — never convert), program terms of agencies and
  clinics, what parents look for, restrictions, contact instructions.
  Do not repeat structured fields.
  Sender not starting `УК СМ`: after those lines add every message of theirs,
  whatever its content, one line each:
  `🔏DD.MM.YYYY HH:MM: «<message text verbatim>»`.
- Conflicting statements → newest in the field, the other in `myComment`.
- Validate YAML before saving.

### Extraction rules

Optimise for completeness and accuracy, not short output. Every profile keeps
the full meaning of its source; concise wording is fine, lost meaning is not.

1. **Lossless.** Keep every meaningful detail; never drop one for brevity.
2. **Medical.** Conditions, explicit absence of disease, history, procedures,
   reproductive health (protocols, response, AMH, oocyte yield), test results.
3. **Physical.** Every appearance attribute and measurement (hair, eyes,
   build, sizes) and physical requirements.
4. **Experience.** Each past program with type, year, outcome; failed
   attempts; an explicit "no experience".
5. **Money.** One line per component: base fee, monthly, contract, transfer,
   C-section, twins, clothing, nanny, relocation, compensations, bonuses —
   amount, currency, condition, timing; mark what is negotiable. Never sum
   or convert.
6. **Geography.** Keep apart: residence (fields), program location, embryo
   transfer, pregnancy monitoring, delivery. Relocation: full/partial, when,
   limits, who pays. A program city is never `city`.
7. **Requirements.** Everything intended parents, agencies or clinics demand
   or prefer: age, parameters, experience, health, location, habits.
8. **Legal and organisational.** Contract type, notarisation, risk coverage,
   procedures, communication and support expectations.
9. **Multiple roles.** One person in several program types → all roles in
   `userRole`, terms for each role on separate lines; drop nothing secondary.
10. **Contacts.** Every channel, username, number and restriction ("Telegram
    only", "no calls") once, no duplicates.
11. **Negatives.** Keep meaningful absences, exclusions, refusals ("no
    abroad", "no full relocation", "no chronic diseases").
12. **No over-summarising.** Never replace specifics with generic phrases
    ("good conditions", "has experience").
13. **No assumptions.** Do not infer missing facts, turn a wish into an
    agreement, or a program location into an address.
14. **Completeness check.** Before saving, re-read each source message and
    confirm every meaningful statement sits in a field or in `myComment`.

Illustrative only, fictional, never written to the database:

```yaml
name: Марта
userRole: sm
birth: 01.01.1997
blood: 2-
maritalStatus: "Yes"
csection: 2
ownKids: 3
phone: 380000000000
telegram: [Марта Приклад, example_donor]
city: Полтава
myComment: |
  🔏Telegram: Марта Приклад, 01.01.2026 10:00
  🔏Повідомлення: 01.01.2026 10:00
  🔏Бажаний гонорар: 20000–22000€, щомісячні 350€.
```

## Phase 2 — write to KnowMe

Claude Code session on `knowme-app/main`, attach the YAML: "Import
telegram_intake.yaml per docs/telegram-chat-intake.md".

1. Parse YAML; drop the illustrative example.
2. Convert: `birth`, `lastDelivery`, `lastCycle` → `YYYY-MM-DD`; all values
   to strings; `userRole` also written to `role`.
3. Match: `searchId/{buildSearchIdValueKey('telegram', value)}` for each
   `telegram` value (display name first), then `phone`
   (`readSearchIdEntryIds`). Exactly one card → that card. Zero, or two and
   more (a search bug) → new draft. Display names starting `УК СМ` are
   saved contacts and almost always match one card; report those that
   did not or matched several.
4. Write — every value, no filtering:
   - no single match → draft: `reserveProfileCardId()` +
     `saveCreateProfileMutation({ cardId, creatorUid, actorUid, data })`;
   - single match → overlay on that card with every value that differs from it,
     including placeholder dates over exact ones (`{ from, to }`, or
     `{ added }` for array fields). `saveOverlayForUserCard` replaces the
     editor's whole layer for the card — merge with the existing
     `multiData/edits/{cardId}/{uid}/fields` first;
   - `myComment` → `setUserComment(cardId, text, uid)`; append to an
     existing note, never overwrite. For unmatched senders the first line
     (display name + date + time) lets the admin find the message and save
     the contact.
5. Verify every card resolves via `searchId`; report drafts, overlays,
   conflicts (field: card value → chat value), `УК СМ` senders with zero
   or several matches, errors.

Run app code from Node: temp file in `src/` (never commit),
`/** @jest-environment node */`, `signInWithEmailAndPassword` with
`MIGRATION_EMAIL` / `MIGRATION_PASSWORD`:

```bash
NODE_USE_ENV_PROXY=1 CI=true npx react-scripts test \
  --testPathPattern "<file>" --watchAll=false --forceExit
```

Next pass: open the chat at the previous `cursor` message (match date, time,
sender, text) and run the same prompt with the previous YAML attached;
duplicates are skipped, existing people match and get overlays.
