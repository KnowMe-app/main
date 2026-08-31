# Плагіни Claude Code для цього проєкту

Проєкт: CRA + React 18 + Redux Toolkit + styled-components + Firebase RTDB/Storage,
деплой на GitHub Pages. Набір плагінів підібраний під цей стек.

## Як увімкнути

Базовий набір уже описаний у `.claude/settings.json` (ключ `enabledPlugins`).
Достатньо запустити Claude Code в корені репозиторію, підтвердити довіру до
маркетплейсу — плагіни встановляться самі.

Якщо офіційний маркетплейс не зареєстрований (Claude Code зазвичай робить це
автоматично):

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

## Опційні (потребують акаунта або локальних залежностей)

Ставити точково, коли реально потрібні:

```
/plugin install firebase@claude-plugins-official           # MCP до Firestore/Auth/Storage, потрібен firebase login
/plugin install github@claude-plugins-official             # PR та issues з чату, потрібен GitHub token
/plugin install playwright@claude-plugins-official         # E2E-тести в браузері
/plugin install chrome-devtools-mcp@claude-plugins-official # профайлінг, network, console з живого Chrome
/plugin install sentry@claude-plugins-official             # розбір продакшн-помилок
/plugin install claude-security@claude-plugins-official    # глибокий скан вразливостей на вимогу
/plugin install claude-code-setup@claude-plugins-official  # аудит: які хуки/скіли варто додати саме сюди
/plugin install hookify@claude-plugins-official            # створення власних хуків
```

## Оновлення

```
/plugin marketplace update claude-plugins-official
```
