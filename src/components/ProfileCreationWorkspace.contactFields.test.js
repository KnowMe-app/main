import fs from 'fs';
import path from 'path';

import {
  buildOverlayPrefill,
  collectExtraContactFields,
} from './ProfileCreationWorkspace';

// Верхній блок картки показує контакти, а форма під ним — поля. Поки ці двоє
// рахували «що є в картці» по-різному, збережений контакт було видно вгорі й
// ніде не можна було виправити: канал наче є, а поля для нього немає.
describe('контакти форми доповнення', () => {
  it('канал поза переліком секцій отримує власний рядок', () => {
    expect(collectExtraContactFields({ viber: '380501112233', phone: '380501112233' }))
      .toEqual(['viber']);
  });

  it('порожній чи стертий канал рядка не додає', () => {
    expect(collectExtraContactFields({ viber: '', whatsapp: ['380501112233', ''] })).toEqual([]);
  });

  it('канал, який форма й так показує, другим рядком не йде', () => {
    expect(collectExtraContactFields({ tiktok: 'nick' })).toEqual([]);
  });

  // Підставлене й не змінене не пише в базу нічого — але лише доти, доки
  // канонічне значення взагалі є з чим порівнювати. Без цього рядка
  // дописаний канал виглядав би правкою читача з першого ж відкриття.
  it('підставляє і ті канали, яким рядок додається окремо', () => {
    expect(buildOverlayPrefill({ viber: '380501112233', tiktok: 'nick' }, 'card')).toEqual({
      userId: 'card',
      tiktok: 'nick',
      viber: '380501112233',
    });
  });
});

/*
 * Шапка форми доповнення показує контакти тим самим представленням, що й решта
 * застосунку (`ContactLinks`): номер повністю плюс три кнопки месенджерів,
 * зібрані з нього ж, а решта каналів — значками.
 *
 * Своє в неї було рівно одне: кожен канал окремим рядком, значок плюс ніком
 * текстом. Ті самі ніки стоять у полях форми просто під шапкою — виходило по
 * дві копії кожного: вгорі показати, внизу правити.
 */
describe('представлення контактів у шапці форми', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('бере спільне представлення, а не власний список рядків', () => {
    expect(source).toContain('<ContactLinks entries={summaryContactEntries}');
    expect(source).not.toContain('fieldContacts');
  });

  it('складає перелік тими самими правилами, що й рядок стрічки', () => {
    expect(source).toContain('getContactEntries(summaryContacts)');
  });
});

/*
 * «+» під полем відкриває рядок під **наступну версію** значення («телефон був
 * той, став цей»). У коментаря версій не буває: він один, його розширюють або
 * звужують, правлячи той самий текст. Дописаний другий рядок поїхав би в базу
 * другою версією, а показувалась би скрізь сама лише остання — тобто перша
 * половина відгуку мовчки зникла б з усіх екранів, лишаючись у базі. Форма
 * анкети це правило знала (`fieldAcceptsMultipleValues`), а форма доповнення —
 * ні, і «+» біля публічного коментаря стояв.
 */
describe('другий рядок пропонується лише там, де версії бувають', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('питає про це те саме правило, що й форма анкети', () => {
    expect(source).toContain("import { fieldAcceptsMultipleValues } from 'utils/profileFieldRows';");
    expect(source).toContain('const canAddAnotherValue = fieldAcceptsMultipleValues(fieldName);');
  });

  it('жодна кнопка «+» не малюється без цієї перевірки', () => {
    const addButtons = source.match(/<AddValueButton/g) || [];
    const guarded = source.match(/\{canAddAnotherValue && <AddValueButton/g) || [];
    expect(addButtons).toHaveLength(guarded.length);
    expect(addButtons.length).toBeGreaterThan(0);
  });
});
