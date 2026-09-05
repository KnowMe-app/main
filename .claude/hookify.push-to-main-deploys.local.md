---
name: warn-push-to-main-triggers-deploy
enabled: true
event: bash
pattern: git\s+push\s+[^\n]*\bmain\b
---

🚀 **Пуш у `main` — це деплой у прод.**

`.github/workflows/deploy.yml`: install → lint → build → gh-pages. Прод оновиться
одразу, без окремого підтвердження.

**Перед цим:**

- `npm run lint:js` має завершитись кодом 0 — інакше воркфлоу впаде на кроці lint;
- перевірте, що це справді цільова гілка, а не робоча.

**І пам'ятайте, чого цей пуш НЕ зробить:** `database.rules.json` CI не викочує.
Правила деплояться руками — `npx firebase deploy --only database`.
