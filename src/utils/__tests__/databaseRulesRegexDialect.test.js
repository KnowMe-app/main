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

  it('порожній і пробільний feedDate не рахуються за ключ стрічки', () => {
    // Та сама умова, записана дозволеним класом: `isString()` пропускає '' і
    // '   ', тож без неї прихована анкета відкривала б деталі й контакти.
    const blankGuard = 'matches(/.*[^ ].*/)';
    const { rules } = JSON.parse(rulesSource);

    expect(rules.matchingCards.$uid['.read']).toContain(blankGuard);
    expect(rules.matchingCards.$uid.feedDate['.validate']).toContain(blankGuard);
    expect(rules.profileDetails.$uid['.read']).toContain(blankGuard);
    expect(rules.profileContacts.$uid['.read']).toContain(blankGuard);
  });
});
