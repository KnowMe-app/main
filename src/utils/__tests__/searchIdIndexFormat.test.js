import { convertSearchIdIndex } from '../../../scripts/convertSearchIdIndex';

/**
 * Форма індексу — це контракт між писачем, читачем і тим файлом, який
 * заливають у базу руками. Тут перевіряється саме перехід: старий експорт із
 * ключем `{поле}_{значення}` мусить лягти в нову форму без втрат.
 */
describe('переведення searchId у нову форму', () => {
  it('поле переїжджає з ключа у значення', () => {
    const { payload } = convertSearchIdIndex({
      phone_380671112233: 'AA0001',
      name_олена: ['AA0001', 'AA0002'],
    });

    expect(payload).toEqual({
      380671112233: { phone: 'AA0001' },
      олена: { name: ['AA0001', 'AA0002'] },
    });
  });

  it('те саме значення з різних полів лягає поруч, а не поверх', () => {
    // Це і є той випадок, заради якого поле переїхало: нікнейм, що збігся з
    // чужим імʼям, не мусить нікого витісняти.
    const { payload, report } = convertSearchIdIndex({
      name_олена: 'AA0001',
      surname_олена: 'AA0002',
    });

    expect(payload).toEqual({ олена: { name: 'AA0001', surname: 'AA0002' } });
    expect(report.mergedValueKeys).toBe(1);
  });

  it('розгортає покалічені вкладені списки', () => {
    // У бойовому експорті таких було три: читач розгортав список лише на один
    // рівень, тож вкладений id не знаходив анкету взагалі.
    const { payload, report } = convertSearchIdIndex({
      surname_заікіна: ['AA4982', ['AA4982', '']],
    });

    expect(payload).toEqual({ заікіна: { surname: 'AA4982' } });
    expect(report.repairedNestedLists).toBe(1);
  });

  it('називає поіменно ключі, у яких поля не впізнати', () => {
    // Мовчазний пропуск тут означав би дірку в пошуку, яку помітять уже по
    // відсутній анкеті.
    const { payload, report } = convertSearchIdIndex({
      userId_0957209135: 'AA0003',
      беззнака: 'AA0004',
    });

    expect(payload).toEqual({});
    expect(report.skippedKeys).toEqual(['userId_0957209135', 'беззнака']);
  });

  it('не робить запису з порожнього значення', () => {
    const { payload, report } = convertSearchIdIndex({ phone_380671112233: '' });

    expect(payload).toEqual({});
    expect(report.emptyKeys).toEqual(['phone_380671112233']);
  });
});
