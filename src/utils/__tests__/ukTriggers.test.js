import { parseUkTrigger } from '../ukTriggers';

describe('parseUkTrigger', () => {
  it('returns null when no УК trigger is present', () => {
    expect(parseUkTrigger('Марія Сидоренко')).toBeNull();
    expect(parseUkTrigger('')).toBeNull();
  });

  it('parses contact information and normalized name from a trigger', () => {
    const raw =
      'УК СМ Марія Сидоренко телеграм @maria_test +380 50 123 45 67 insta: maria.story email TEST@MAIL.COM';
    const parsed = parseUkTrigger(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.normalizedName).toBe('Марія Сидоренко');
    expect(parsed?.prefill).toMatchObject({
      name: 'Марія Сидоренко',
      telegram: 'maria_test',
      phone: '380501234567',
      instagram: 'maria.story',
      email: 'test@mail.com',
    });
    expect(parsed?.prefill?._ukTrigger).toMatchObject({
      raw,
      normalizedName: 'Марія Сидоренко',
      payload: parsed?.withoutPrefix,
    });
  });

  it('handles compact prefix formatting and missing name data', () => {
    const parsed = parseUkTrigger('УкСм тг @anon_user');

    expect(parsed).not.toBeNull();
    expect(parsed?.prefill?.telegram).toBe('anon_user');
    expect(parsed?.normalizedName).toBe('тг @anon_user');
  });

  it('supports latin prefix variations and multiple contact types', () => {
    const parsed = parseUkTrigger('uk sm Oksana tg oksana123 tt: oksana.tt phone 050-123-45-67');

    expect(parsed).not.toBeNull();
    expect(parsed?.prefill).toMatchObject({
      name: 'Oksana',
      telegram: 'oksana123',
      tiktok: 'oksana.tt',
      phone: '380501234567',
    });
  });
});
