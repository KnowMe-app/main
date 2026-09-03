/**
 * Заливка мігрованих вузлів у RTDB.
 *
 * Перевіряється не «функція викликалась», а те, від чого залежить збереженість
 * даних: на якій глибині адресується запис (від цього залежить, чи пустять
 * правила бази і чи не знесе `update` сусідні гілки) і що порожнє значення в
 * порцію не потрапляє (у `update` воно означає видалення).
 */
import {
  UPLOAD_CHUNK_SIZE,
  chunkUploadEntries,
  countUploadEntries,
  flattenUploadEntries,
  resumeChunkIndex,
  uploadCollection,
} from '../rtdbMigrationUpload';

const noSleep = () => Promise.resolve();

describe('flattenUploadEntries', () => {
  it('на глибині 1 адресує анкету, а не колекцію', () => {
    const { entries } = flattenUploadEntries({
      uid1: { name: 'A' },
      uid2: { name: 'B' },
    }, 1);

    expect(entries).toEqual([
      ['uid1', { name: 'A' }],
      ['uid2', { name: 'B' }],
    ]);
  });

  it('на глибині 2 склеює власника й анкету — рівень, на якому стоїть дозвіл', () => {
    const { entries } = flattenUploadEntries({
      owner1: { uid1: '2026-08-27', uid2: '2026-08-28' },
      owner2: { uid3: '2026-08-29' },
    }, 2);

    expect(entries).toEqual([
      ['owner1/uid1', '2026-08-27'],
      ['owner1/uid2', '2026-08-28'],
      ['owner2/uid3', '2026-08-29'],
    ]);
  });

  it('не бере порожніх значень: в `update` вони означають видалення', () => {
    const { entries, skipped } = flattenUploadEntries({
      uid1: { name: 'A' },
      uid2: {},
      uid3: null,
    }, 1);

    expect(entries).toEqual([['uid1', { name: 'A' }]]);
    expect(skipped.emptyValues).toBe(2);
  });

  it('відкладає ключ із забороненим символом, а не валить ним усю порцію', () => {
    const { entries, skipped } = flattenUploadEntries({
      'uid.1': { name: 'A' },
      uid2: { name: 'B' },
    }, 1);

    expect(entries).toEqual([['uid2', { name: 'B' }]]);
    expect(skipped.invalidKeys).toEqual(['uid.1']);
  });

  it('не спускається глибше, ніж є вкладеність', () => {
    const { entries } = flattenUploadEntries({ owner1: { uid1: 'значення' } }, 3);

    expect(entries).toEqual([['owner1/uid1', 'значення']]);
  });
});

describe('chunkUploadEntries', () => {
  it('ріже на порції заданого розміру', () => {
    const entries = Array.from({ length: 5 }, (_, index) => [`uid${index}`, index]);

    expect(chunkUploadEntries(entries, 2)).toEqual([
      { uid0: 0, uid1: 1 },
      { uid2: 2, uid3: 3 },
      { uid4: 4 },
    ]);
  });
});

describe('uploadCollection', () => {
  const payload = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`uid${index}`, { name: `A${index}` }]),
  );

  it('шле порції в один і той самий шлях і рахує залите', async () => {
    const write = jest.fn().mockResolvedValue(undefined);

    const result = await uploadCollection(payload, {
      path: 'profileDetails',
      depth: 1,
      chunkSize: 2,
      write,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(3);
    expect(write.mock.calls.every(([path]) => path === 'profileDetails')).toBe(true);
    expect(write.mock.calls[0][1]).toEqual({ uid0: { name: 'A0' }, uid1: { name: 'A1' } });
    expect(result.written).toBe(5);
    expect(result.total).toBe(5);
    expect(result.error).toBeNull();
  });

  it('повідомляє прогрес після кожної порції', async () => {
    const onProgress = jest.fn();

    await uploadCollection(payload, {
      path: 'profileDetails',
      chunkSize: 2,
      write: jest.fn().mockResolvedValue(undefined),
      onProgress,
      sleep: noSleep,
    });

    expect(onProgress.mock.calls.map(([state]) => state.written)).toEqual([0, 2, 4, 5]);
  });

  it('пробує порцію повторно після мережевої помилки', async () => {
    const write = jest.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(undefined);

    const result = await uploadCollection(payload, {
      path: 'profileDetails',
      chunkSize: 5,
      write,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(result.written).toBe(5);
  });

  it('на PERMISSION_DENIED спиняється одразу і каже, скільки вже залито', async () => {
    const write = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'));

    const result = await uploadCollection(payload, {
      path: 'profileTechnical',
      chunkSize: 2,
      write,
      sleep: noSleep,
    });

    // Перша порція пройшла, друга впала і не повторювалась.
    expect(write).toHaveBeenCalledTimes(2);
    expect(result.written).toBe(2);
    expect(result.error.message).toContain('PERMISSION_DENIED');
  });

  it('віддає керування зупинці між порціями', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    let stop = false;

    const result = await uploadCollection(payload, {
      path: 'profileDetails',
      chunkSize: 2,
      write: async (...args) => {
        stop = true;
        return write(...args);
      },
      shouldStop: () => stop,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.stopped).toBe(true);
    expect(result.written).toBe(2);
  });

  it('порожній вузол не робить жодного запису', async () => {
    const write = jest.fn();

    const result = await uploadCollection({}, { path: 'matchingCards', write, sleep: noSleep });

    expect(write).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });

  it('порція за замовчуванням не безмежна', () => {
    expect(UPLOAD_CHUNK_SIZE).toBeGreaterThan(0);
    expect(countUploadEntries(payload, 1)).toBe(5);
  });
});

/**
 * Продовження після обриву.
 *
 * Заливка йде порціями по 200, тож один невдалий запис забирає з собою всю
 * порцію, а решта вузла лишається незалитою. Другий захід не мусить писати
 * наново те, що вже лежить у базі: перезапис не псує даних, але на 26 тисячах
 * анкет це хвилини з телефона. Тут перевіряється не швидкість, а те, від чого
 * залежить цілість: продовження ніколи не перестрибує запис.
 */
describe('продовження заливки', () => {
  const payload = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`uid${index}`, { name: `A${index}` }]),
  );

  it('рахує порцію за кількістю вже залитих записів', () => {
    expect(resumeChunkIndex(0, 200)).toBe(0);
    expect(resumeChunkIndex(200, 200)).toBe(1);
    expect(resumeChunkIndex(5200, 200)).toBe(26);
  });

  it('округляє вниз: неповна порція переписується, а не пропускається', () => {
    // 5 250 записів — це 26 повних порцій і половина 27-ї. Продовжувати треба
    // з 27-ї цілком, інакше 50 записів лишились би незалитими назавжди.
    expect(resumeChunkIndex(5250, 200)).toBe(26);
  });

  it('не приймає сміття за номер порції', () => {
    expect(resumeChunkIndex(-5, 200)).toBe(0);
    expect(resumeChunkIndex(undefined, 200)).toBe(0);
    expect(resumeChunkIndex(Number.NaN, 200)).toBe(0);
  });

  it('пропускає вже залиті порції і дописує решту', async () => {
    const write = jest.fn().mockResolvedValue(undefined);

    await uploadCollection(payload, {
      path: 'profileDetails',
      depth: 1,
      chunkSize: 2,
      resumeFrom: 2,
      write,
      sleep: noSleep,
    });

    // Перша порція (uid0, uid1) не переписується.
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0][1]).toEqual({ uid2: { name: 'A2' }, uid3: { name: 'A3' } });
    expect(write.mock.calls[1][1]).toEqual({ uid4: { name: 'A4' } });
  });

  it('звітує наскрізним числом, а не від місця продовження', async () => {
    const result = await uploadCollection(payload, {
      path: 'profileDetails',
      chunkSize: 2,
      resumeFrom: 2,
      write: jest.fn().mockResolvedValue(undefined),
      sleep: noSleep,
    });

    // «5 з 5», а не «3 з 5»: інакше друга спроба звітує меншим числом, ніж
    // перша, і зрозуміти по ній, чи вузол долитий, неможливо.
    expect(result.written).toBe(5);
    expect(result.total).toBe(5);
    expect(result.resumedFrom).toBe(2);
    expect(result.error).toBeNull();
  });

  it('без продовження заливає з початку', async () => {
    const write = jest.fn().mockResolvedValue(undefined);

    await uploadCollection(payload, {
      path: 'profileDetails',
      chunkSize: 2,
      write,
      sleep: noSleep,
    });

    expect(write).toHaveBeenCalledTimes(3);
  });
});
