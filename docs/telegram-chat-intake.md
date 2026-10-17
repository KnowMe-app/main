# Telegram chat intake

Turns a community Telegram chat into KnowMe profiles.

```
Telegram Desktop ─► Phase 1: computer-use agent ─► telegram_intake.yaml
                    classify messages, parse profiles
                                                       │
KnowMe RTDB ◄─ Phase 2: Claude Code on knowme-app/main ┘
               match by telegram / phone, draft or overlay, private note
```

Core rule: **never drop data.** Every parsed value is written. Conflicts with
existing cards go in as overlays; the admin resolves them.

## Phase 1 — read the chat

Setup: Claude desktop app, new chat, computer use on, Telegram allowed.
Telegram Desktop full screen, light theme, target chat open, notifications
off. Check first: "Take a screenshot and transcribe the last three messages."

Prompt (fill in chat name and start date, append the Schema section):

```
Read Telegram chat "<CHAT>" in Telegram Desktop from <DD.MM.YYYY> to the
newest message. Read-only: send nothing, no reactions, open no links.
Write ~/Documents/telegram_intake.yaml.

1. Jump to the start date (chat search → calendar).
2. For every message note its date (day separator) and time, and the sender
   as displayed (the account's display name, e.g. "УК СМ Оля").
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
4. For each new sender with a kept message: open their profile, copy
   @username and phone if shown.
5. Parse each sender into one profile (Schema). Later messages update it.
6. Scroll one screen at a time, keep the last processed message at the top.
7. Every 20 screens rewrite the file and set resumeFrom.
8. At the end report: people by role, unreadable messages (date, time).

File:
chat: <CHAT>
resumeFrom: DD.MM.YYYY HH:MM
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

Next pass starts at the previous `resumeFrom`; existing people match and get
overlays.
