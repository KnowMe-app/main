import {
  buildContactCardName,
  buildContactFileName,
  withSharedCardTimeout,
  buildProfileCardPath,
  buildProfileCardUrl,
  buildReaderVCard,
  isProfileCardReturnTo,
  isShareableCardId,
  readSharedCardIdFromSearch,
  shareProfileCardLink,
} from './profileCardLink';

describe('profileCardLink', () => {
  it('builds a link with the card id, never a contact', () => {
    expect(buildProfileCardPath('3LiD7JGCJTSJoVMU7fdR1ZrcIZH2')).toBe('/matching?card=3LiD7JGCJTSJoVMU7fdR1ZrcIZH2');
    expect(buildProfileCardUrl('-OA1b2c3d4e5f6g7h8i9', 'https://knowme.pp.ua')).toBe('https://knowme.pp.ua/matching?card=-OA1b2c3d4e5f6g7h8i9');
  });

  it('rejects ids that are database paths rather than keys', () => {
    expect(isShareableCardId('a/b')).toBe(false);
    expect(isShareableCardId('a.b')).toBe(false);
    expect(isShareableCardId('')).toBe(false);
    expect(isShareableCardId('AC00001')).toBe(true);
    expect(readSharedCardIdFromSearch('?card=..%2Fusers')).toBe('');
    expect(readSharedCardIdFromSearch('?card=AC00001&q=x')).toBe('AC00001');
  });

  it('recognises a login redirect that leads to a shared card', () => {
    expect(isProfileCardReturnTo('/matching?card=AC00001')).toBe(true);
    expect(isProfileCardReturnTo('/matching?q=Ольга')).toBe(false);
    expect(isProfileCardReturnTo('/my-profile?card=AC00001')).toBe(false);
  });

  it('names the contact "KM Name Surname" from current values', () => {
    expect(buildContactCardName({ name: ['Оля', 'Олена'], surname: 'К.' })).toBe('KM Олена К.');
    expect(buildContactCardName({ name: 'Ірина', agencyName: 'Surrohelp' })).toBe('KM Surrohelp (Ірина)');
    expect(buildContactCardName({})).toBe('KM');
  });

  it('writes a vCard with phones, the card link and escaped text', () => {
    const vcard = buildReaderVCard({
      name: 'KM Олена; К.',
      roleLabel: 'Донор ооцитів',
      phones: ['380501234567', '+380501234567', ''],
      emails: ['a@b.c', 'not-mail'],
      links: ['https://t.me/olena', 'javascript:alert(1)'],
      cardUrl: 'https://knowme.pp.ua/matching?card=AC00001',
    });
    expect(vcard).toContain('FN;CHARSET=UTF-8:KM Олена\\; К.');
    expect(vcard.match(/TEL;TYPE=CELL:\+380501234567/g)).toHaveLength(1);
    expect(vcard).toContain('EMAIL;TYPE=INTERNET:a@b.c');
    expect(vcard).not.toContain('not-mail');
    expect(vcard).toContain('URL:https://knowme.pp.ua/matching?card=AC00001');
    expect(vcard).toContain('URL:https://t.me/olena');
    expect(vcard).not.toContain('javascript');
    expect(vcard.startsWith('BEGIN:VCARD\r\n')).toBe(true);
  });

  it('shares through the system sheet, falls back to the clipboard', async () => {
    const share = jest.fn().mockResolvedValue();
    await expect(shareProfileCardLink({ url: 'u', nav: { share } })).resolves.toBe('shared');
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    await expect(shareProfileCardLink({ url: 'u', nav: { share: jest.fn().mockRejectedValue(abort) } })).resolves.toBe('cancelled');
    const writeText = jest.fn().mockResolvedValue();
    await expect(shareProfileCardLink({ url: 'u', nav: { clipboard: { writeText } } })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('u');
    await expect(shareProfileCardLink({ url: 'u', nav: {} })).resolves.toBe('failed');
  });

  it('names the vCard file in Latin so the browser keeps the extension', () => {
    expect(buildContactFileName('KM Вікторія Ш.')).toBe('KM_Viktoriya_Sh.vcf');
    expect(buildContactFileName('KM 李')).toBe('KnowMe_contact.vcf');
  });

  it('turns a hanging read into a timeout, not into "card not found"', async () => {
    jest.useFakeTimers();
    const pending = withSharedCardTimeout(new Promise(() => {}), 50);
    jest.advanceTimersByTime(60);
    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
    jest.useRealTimers();
    await expect(withSharedCardTimeout(Promise.resolve({ a: 1 }), 50)).resolves.toEqual({ a: 1 });
  });
});
