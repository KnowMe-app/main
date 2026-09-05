#!/bin/bash
# Веб-сесія Claude Code стартує з чистого контейнера: репозиторій клонується, але
# node_modules у ньому немає. Без цього кроку `npm run lint:js` бере глобальний
# eslint з образу (v10), який не читає `eslintConfig` з package.json, і падає з
# «couldn't find eslint.config.js» — на порожньому місці, ще до першої правки.
# Локально нічого не робимо: там залежності вже стоять.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install, а не npm ci: контейнер кешується після хука, тож повторний запуск
# на вже встановлених залежностях завершується швидко й нічого не переставляє.
npm install --no-audit --no-fund
