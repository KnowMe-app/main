// Заповнює `matchingFeedIndex` з вивантаження опублікованих карток.
// Вхід: JSON `matchingCards` (orderBy feedDate, startAt ""), вихід: JSON
// переліку для `database:set`. У stdout — лише кількість: вміст карток у
// журнал публічного репозиторію не йде.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildFeedIndexFromCards } = require('../functions/feedIndex.js');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/buildFeedIndex.mjs <cards.json> <index.json>');
  process.exit(2);
}
const cards = JSON.parse(fs.readFileSync(input, 'utf8')) || {};
const index = buildFeedIndexFromCards(cards);
fs.writeFileSync(output, JSON.stringify(index));
console.log(`published cards: ${Object.keys(index).length - 1}`);
