import {
  CONTACT_FIELDS,
  getAvailableContactFields,
  getContactEntries,
} from './contactMethods';

describe('contactMethods', () => {
  it('filters internal УК СМ telegram values', () => {
    expect(getContactEntries({ telegram: ['УК СМ internal', '@public'] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ key: 'telegram', value: '@public' })]));
    expect(getContactEntries({ telegram: ['УК СМ internal'] })).toEqual([]);
  });

  it('builds actionable links for core contact methods', () => {
    const entries = getContactEntries({
      phone: '380 50 111 22 33',
      email: 'mail@example.com',
      telegram: '@agency',
      whatsapp: '+380501112233',
      viber: '+380501112233',
      website: 'example.com',
    });

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'phone', href: 'tel:380501112233' }),
      expect.objectContaining({ key: 'email', href: 'mailto:mail@example.com' }),
      expect.objectContaining({ key: 'telegram', href: 'https://t.me/agency' }),
      expect.objectContaining({ key: 'whatsapp', href: 'https://wa.me/380501112233' }),
      expect.objectContaining({ key: 'viber', href: 'viber://chat?number=%2B380501112233' }),
      expect.objectContaining({ key: 'website', href: 'https://example.com' }),
    ]));
  });

  it('keeps all previously supported social and link contacts', () => {
    const user = {
      facebook: 'fb-page',
      tiktok: 'creator',
      linkedin: 'in/person',
      youtube: 'channel',
      twitter: '@handle',
      otherLink: 'other.example',
    };

    expect(CONTACT_FIELDS).toEqual(expect.arrayContaining([
      'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'otherLink',
    ]));
    expect(getAvailableContactFields(user)).toEqual(expect.arrayContaining([
      'facebook', 'tiktok', 'linkedin', 'youtube', 'twitter', 'otherLink',
    ]));
    expect(getContactEntries(user).map(entry => entry.href)).toEqual(expect.arrayContaining([
      'https://facebook.com/fb-page',
      'https://www.tiktok.com/@creator',
      'https://www.linkedin.com/in/person',
      'https://www.youtube.com/@channel',
      'https://x.com/handle',
      'https://other.example',
    ]));
  });
});
