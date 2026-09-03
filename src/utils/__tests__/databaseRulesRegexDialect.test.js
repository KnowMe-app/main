import fs from 'fs';
import path from 'path';

const rulesSource = fs.readFileSync(
  path.join(__dirname, '../../../database.rules.json'),
  'utf8',
);

const collectExpressions = node => {
  if (typeof node === 'string') return [node];
  if (!node || typeof node !== 'object') return [];
  return Object.values(node).flatMap(collectExpressions);
};

/**
 * Мова правил має власний діалект регулярок, і `\s`/`\S` в ньому немає.
 *
 * Ціна помилки тут не дорівнює одній зламаній умові: база відмовляється
 * прийняти файл цілком («Illegal regular expression, 'whitespacechar' not
 * found»), тобто `firebase deploy --only database` не проходить, а в проді
 * лишається попередній набір правил. Саме так межа «поза стрічкою читач бачить
 * лише картку» місяцями жила в репозиторії й не діяла в базі: код її вже
 * тримав, а правила — ні.
 *
 * Перевірка стоїть у звичайному прогоні тестів, бо емулятор (`npm run
 * test:rules`) на CI не запускається — а він єдиний, хто ловить це інакше.
 * `\d`, `\D`, `\w`, `\W` і екранування (`\.`) діалект приймає; заборонений
 * рівно клас пробілу.
 */
describe('діалект регулярок у правилах бази', () => {
  it('не використовує \\s і \\S — база не приймає файл з ними', () => {
    const offenders = collectExpressions(JSON.parse(rulesSource))
      .filter(expression => /\\[sS]/.test(expression));

    expect(offenders).toEqual([]);
  });

  it('лише дата YYYY-MM-DD рахується за ключ стрічки', () => {
    // Самого `isString()` недостатньо: `false` він відсікає, але довільний
    // непорожній текст без формату дати інакше відкривав би деталі й контакти.
    const dateGuard = 'matches(/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/)';
    const { rules } = JSON.parse(rulesSource);

    // Читання самої картки цієї умови більше не має — воно взагалі не питає
    // `feedDate`: картка це мінімум, який видно поза стрічкою. Умова лишається
    // там, де від неї залежить показ: у валідації ключа і в приватних вузлах.
    expect(rules.matchingCards.$uid.feedDate['.validate']).toContain(dateGuard);
    expect(rules.profileDetails.$uid['.read']).toContain(dateGuard);
    expect(rules.profileContacts.$uid['.read']).toContain(dateGuard);
  });
});
