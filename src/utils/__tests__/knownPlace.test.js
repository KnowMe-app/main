import { cardMatchesPlace, resolveKnownPlace } from '../profileNormalization';

describe('місце в запиті пошуку', () => {
  it('впізнає місто й область у будь-якому написанні', () => {
    expect(resolveKnownPlace('Київ')).toEqual({ kind: 'city', uk: 'Київ', en: 'Kyiv' });
    expect(resolveKnownPlace('киев')).toMatchObject({ kind: 'city', uk: 'Київ' });
    expect(resolveKnownPlace('Харківська область')).toMatchObject({ kind: 'oblast', uk: 'Харківська' });
    expect(resolveKnownPlace('Оксана')).toBeNull();
    expect(resolveKnownPlace('380501234567')).toBeNull();
  });

  it('звіряє картку з містом за довідником', () => {
    const kyiv = resolveKnownPlace('Київ');
    expect(cardMatchesPlace({ city: 'Kyiv' }, kyiv)).toBe(true);
    expect(cardMatchesPlace({ city: ['Львів', 'Киев'] }, kyiv)).toBe(true);
    expect(cardMatchesPlace({ city: 'Бровари' }, kyiv)).toBe(false);
  });

  it('звіряє картку з областю — за полем області або за містом', () => {
    const kharkiv = resolveKnownPlace('Харківська обл.');
    expect(cardMatchesPlace({ region: 'Харьковская' }, kharkiv)).toBe(true);
    expect(cardMatchesPlace({ city: 'Харків' }, kharkiv)).toBe(true);
    expect(cardMatchesPlace({ city: 'Київ', region: 'Київська' }, kharkiv)).toBe(false);
  });
});
