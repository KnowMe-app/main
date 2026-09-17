import '@testing-library/jest-dom';
import { buildGridRows } from './ProfileRow';

const card = {
  userId: 'ID0004',
  education: 'No',
  race: 'European',
  hairColor: 'Fair',
  hairStructure: 'Straight',
  faceShape: 'Round',
  bodyType: 'Hourglass',
  clothingSize: '44',
  profession: 'Лікарка',
};

const valueOf = (rows, label) => rows.find(row => row.label === label)?.parts.map(part => part.value).join(', ');

/**
 * Половина комірки українською, половина англійською — «Раса: European».
 *
 * Підписи сітки перекладались, значення — ні, і рядок стрічки говорив двома
 * мовами одночасно. Варіанти цих полів вибирають зі списку, і пара до кожного
 * лежить у формі, тож перекладає їх те саме `translateFieldValue`, що й
 * відкрита картка анкети.
 */
describe('мова сітки «всі дані»', () => {
  it('веде підпис і значення однією мовою', () => {
    const rows = buildGridRows(card, 'uk');

    expect(valueOf(rows, 'Раса')).toBe('Європейська');
    expect(valueOf(rows, 'Волосся')).toBe('Русяве, Пряме');
    expect(valueOf(rows, 'Форма обличчя')).toBe('Кругле');
    expect(valueOf(rows, 'Фігура')).toBe('Пісочний Годинник');
    expect(valueOf(rows, 'Освіта')).toBe('Ні');
  });

  it('англійською лишає і підпис, і значення англійськими', () => {
    const rows = buildGridRows(card, 'en');

    expect(valueOf(rows, 'Race')).toBe('European');
    expect(valueOf(rows, 'Hair')).toBe('Fair, Straight');
  });

  // Те, що ввела людина, не перекладається ніколи: словник складений по
  // конкретних полях, і вільному тексту в ньому просто нема чого зіставити.
  it('не чіпає вільного тексту', () => {
    const rows = buildGridRows({ ...card, clothingSize: '44' }, 'uk');
    expect(valueOf(rows, 'Одяг')).toBe('44');
  });
});
