# Плагіни Claude Code для цього проєкту

Проєкт: CRA + React 18 + Redux Toolkit + styled-components + Firebase RTDB/Storage,
деплой на GitHub Pages. Набір плагінів підібраний під цей стек.

## Як увімкнути

Нічого робити не треба: `.claude/settings.json` описує і сам набір
(`enabledPlugins`), і джерело, з якого він береться (`extraKnownMarketplaces`).
Друге тут не формальність — без нього набір лишався списком імен: у сесії, що
починається з чистого контейнера (Claude Code у вебі), офіційний маркетплейс
нізвідки не береться, бо його реєструють інтерактивною командою, якої там
нема кому виконати. Тепер джерело названо в самому репозиторії, тож кожна
сесія — локальна чи веб — підтягує плагіни сама.

Вручну маркетплейс додається так (потрібно лише поза цим репозиторієм):

```
/plugin marketplace add anthropics/claude-plugins-official
```

Перевірка:

```
/plugin marketplace list
/plugin list
```

## Що входить у базовий набір

| Плагін | Навіщо тут |
|---|---|
| `security-guidance` | Перевіряє згенеровані дифи на XSS, ін'єкції, секрети в коді. Критично: у репо є `database.rules.json` і ключі Firebase. |
| `code-review` | `/code-review` кількома агентами з фільтрацією хибних спрацювань. |
| `pr-review-toolkit` | Ревʼю під PR: тести, обробка помилок, якість, спрощення. |
| `code-simplifier` | Прибирає дублікати й ускладнення в щойно зміненому коді. |
| `feature-dev` | Воркфлоу «дослідити код → спроєктувати → зробити → перевірити» для великих задач. |
| `commit-commands` | Команди для commit / push / PR. |
| `typescript-lsp` | LSP для TS **і JS** — go-to-definition і типи по всьому `src/`. |
| `frontend-design` | Якісний UI-код замість «генеричного AI-вигляду». |
| `modern-web-guidance` | Актуальні веб-практики (від команди Chrome). |
| `claude-md-management` | Підтримує `CLAUDE.md` в актуальному стані. |
| `context7` | Свіжа документація React / Firebase / Redux прямо в контекст. Працює без ключа. |
| `hookify` | Дивиться, **як** тут пишеться код, і перетворює зауваження на правила: `/hookify` без аргументів розбирає розмову й знаходить те, що ви вже виправляли за мною, а `/hookify <вимога>` записує правило зі слів. Далі правило спрацьовує саме — до або після виклику інструмента, а не в ревʼю постфактум. |
| `claude-code-setup` | Разовий аудит кодової бази: які хуки, скіли, субагенти й MCP варто додати саме сюди. Запускається на вимогу, у фоні нічого не робить. |

## Опційні (потребують акаунта або локальних залежностей)

Ставити точково, коли реально потрібні:

```
/plugin install firebase@claude-plugins-official           # MCP до Firestore/Auth/Storage, потрібен firebase login
/plugin install github@claude-plugins-official             # PR та issues з чату, потрібен GitHub token
/plugin install playwright@claude-plugins-official         # E2E-тести в браузері
/plugin install chrome-devtools-mcp@claude-plugins-official # профайлінг, network, console з живого Chrome
/plugin install sentry@claude-plugins-official             # розбір продакшн-помилок
/plugin install claude-security@claude-plugins-official    # глибокий скан вразливостей на вимогу
```

## Правила hookify живуть у репозиторії

`/hookify` кладе кожне правило окремим файлом `.claude/hookify.<назва>.local.md`
(YAML-фронтматер: `name`, `enabled`, `event`, `pattern` або `conditions`, далі —
текст, який побачить Claude). Список — `/hookify:list`, вимкнути чи ввімкнути —
`/hookify:configure` або `enabled:` у самому файлі, прибрати — видалити файл.
Перезапуск не потрібен: правило діє з наступного виклику інструмента.

Суфікс `.local.md` — **вимога формату, а не позначка «не комітити»**:
`config_loader` шукає рівно `.claude/hookify.*.local.md` і файл з іншим імʼям
просто не побачить. Документація плагіна радить додати цей глоб у `.gitignore` —
**ми свідомо робимо навпаки й комітимо ці файли**, з тієї самої причини, з якої в
`settings.json` названо джерело маркетплейсу: сесія в чистому контейнері
(Claude Code у вебі) не має звідки взяти правила, крім репозиторію. Некомічене
правило — це правило, яке діє на одній машині.

### Що вже налаштовано

| Файл | Коли спрацьовує | Про що нагадує |
|---|---|---|
| `hookify.database-rules-deploy.local.md` | правка `database.rules.json` | `npm run test:rules` (єдина перевірка, що файл узагалі приймається) і ручний `npx firebase deploy --only database` — CI правила не викочує |
| `hookify.no-users-read.local.md` | у код додається `get(ref(database, 'users…` | `/users` — legacy-дзеркало, з нього не читають; таблиця, куди що переїхало |
| `hookify.matching-card-schema.local.md` | правка `matchingCardIndex.js` або `profileNodeSchema.js` | поле картки живе в трьох місцях; `$other: false` відхиляє запис мовчки |
| `hookify.push-to-main-deploys.local.md` | `git push … main` | пуш у `main` — це деплой; і чого він **не** зробить |
| `hookify.prettier-mass-reformat.local.md` | `prettier … --write` | масове форматування ламає 19 сюїт понад базові 7 — заміряно, не гіпотеза |

Усі прогнані через `hooks/pretooluse.py` самого плагіна: спрацьовують на
цільових шляхах і мовчать на решті. Запис у `/users` (`update(ref(database,
'users'), …)`) навмисно **не** ловиться — писати в дзеркало можна, не можна лише
читати.

### Як додати своє

Два шляхи:

```
/hookify                                  # розбирає нашу розмову й дістає те,
                                          # що ви вже виправляли за мною
/hookify Не міняй роль анкети без updateProfileRole
```

Правило описує **вимогу до коду, а не смак**, інакше воно шумить на кожній
правці. Матеріал тут ще є: `deriveRole` і два ключі ролі, `getCurrentValue` як
єдине місце правила «останній елемент масиву», `appendEmptyFieldRow` з
`undefined` замість `''`.

## Обмеження середовища

`context7` у веб-сесії може не піднятись: його MCP-хост (`mcp.context7.com`)
блокує мережева політика середовища —
`no rule or allowlist entry allows host mcp.context7.com`. Це відмова проксі, а
не помилка конфігу; локально плагін працює. Так само не спрацюють будь-які
плагіни-проксі, що тримаються на `localhost` (Omniroute, Headroom): у контейнері
веб-сесії того порту немає.

## Оновлення

```
/plugin marketplace update claude-plugins-official
```
