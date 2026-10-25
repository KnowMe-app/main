import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');
const publishCard = source.slice(source.indexOf('data-testid="publish-card"'), source.indexOf('</SubmitWrap>'));

// Прев'ю картки стояло угорі сторінки й розгорнутим: на телефоні перший
// екран «Мого профілю» був карткою, а не анкетою. Тепер воно згорнуте під
// «Переглянути мою анкету» в «Публікації» — перед рішенням, кому її показати.
describe('перегляд анкети — у «Публікації», згорнутий', () => {
  it('стоїть у блоці публікації, а не над формою', () => {
    expect(publishCard).toContain('<MyProfileCardPreview');
    expect(source.indexOf('<MyProfileCardPreview')).toBeGreaterThan(source.indexOf('data-testid="publish-card"'));
  });

  it('розгортається кнопкою і щоразу стартує згорнутим', () => {
    const preview = fs.readFileSync(path.join(__dirname, 'MyProfileCardPreview.jsx'), 'utf8');
    expect(preview).toContain("useState(false)");
    expect(preview).toContain("'Переглянути мою анкету'");
    expect(preview).not.toContain('localStorage');
  });
});

// Три способи показати анкету — відповіді на одне питання, від найширшого до
// найанонімнішого, і посилання серед них — третій, а не окрема картка.
describe('хто бачитиме анкету', () => {
  it('стрічка, вподобані й посилання — по черзі', () => {
    const feed = publishCard.indexOf('data-testid="publish-way-feed"');
    const liked = publishCard.indexOf('data-testid="publish-liked-audience"');
    const link = publishCard.indexOf('data-testid="publish-way-link"');
    expect(feed).toBeGreaterThan(-1);
    expect(liked).toBeGreaterThan(feed);
    expect(link).toBeGreaterThan(liked);
    expect(publishCard).toContain("uiText('Лише за посиланням', language)");
    expect(publishCard).toContain("uiText('Найбільше анонімності', language)");
  });

  it('блок посилань вбудований у «Публікацію» і каже, скільки їх', () => {
    expect(publishCard).toContain('<MyProfileShare');
    expect(publishCard).toContain('embedded');
    expect(publishCard).toContain('onSharesChange={setShareCount}');
    expect(source.indexOf('<MyProfileShare')).toBeLessThan(source.indexOf('</SubmitWrap>'));
  });

  it('рядок стану знає й про посилання', () => {
    expect(publishCard).toContain("'Анкети немає ні в стрічці, ні в пошуку — її бачать лише ті, кому ви надіслали посилання'");
  });
});

// Порожні поля соцмереж стояли в кожній анкеті; тепер — чіпи «Додайте ще».
describe('соцмережі чіпами', () => {
  it('поля — лише заповнені чи відкриті, решта — чіпи', () => {
    expect(source).toContain("section.key === 'social' ? renderSocialFields(section) : null");
    expect(source).toContain('const shown = section.fields.filter(name => keepSkippedField(name));');
    expect(source).toContain("uiText(shown.length ? 'Додайте ще:' : 'Додайте, якщо хочете, щоб вас знаходили й там:', language)");
    expect(source).toContain('onClick={() => revealField(name)}');
  });
});

// «Свій варіант» стояв біля пʼятнадцяти питань; лишився там, де відповідь
// справді не вкладається у варіанти, і там, де своє значення вже записане.
describe('«Свій варіант» — лише де потрібен', () => {
  it('пропонується лише етнічній групі й уже записаному своєму значенню', () => {
    expect(source).toContain("const CUSTOM_OPTION_FIELDS = new Set(['race']);");
    expect(source).toContain('const canUseCustomOption = CUSTOM_OPTION_FIELDS.has(name) || hasCustomValue;');
  });

  it('уточнення відкривається після відповіді, якої стосується', () => {
    expect(source).toContain("csection: { name: 'csectionNote'");
    expect(source).toContain("programPlace: { name: 'programPlaceNote'");
    expect(source).toContain("{withDetails && chosen === 'Yes' ? (");
  });
});
