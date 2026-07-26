// Clean layoutV2 template support (spec: "підтримка очищеного layoutV2 для довідки про генетичну
// спорідненість") - the fixture below is the actual genetic-affinity-certificate-clean-layout-v2.json
// template: no legacy fields (beforeTitle/title/paragraphs/logo/columns), a `format` base style
// instead of a required `styleSheet.document`, `lineStyles` + block-level `lineStyle`/
// `bottomBorderStyle` references instead of inline `line`/`bottomBorder` objects, and no stored
// page.widthMm/heightMm/layoutV2.contentWidthMm/signatureTable.widthMm - every derived geometry
// value is computed by the renderer.
import fs from 'fs';
import path from 'path';
import React from 'react';
import {
  buildGeneratedDocument,
  findUnresolvedPlaceholders,
  getPageGeometry,
  getSignatureTableWidthMm,
  isLayoutV2Template,
  resolveLayoutV2Style,
  resolveLineStyle,
  validateLayoutV2Template,
} from './documentsCatalogUtils';

const toDataUri = file => {
  const buf = fs.readFileSync(path.join(__dirname, '../../public/fonts', file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
};

// The exact clean template JSON (genetic-affinity-certificate-clean-layout-v2.json) - a fresh deep
// clone per call so no test can mutate another's fixture.
const CLEAN_TEMPLATE_JSON = {
  id: 'genetic-affinity-certificate',
  catalogName: 'Довідка про генетичну спорідненість',
  rendererVersion: 2,
  languages: ['uk'],
  allowPageBreaks: true,
  page: {
    size: 'A4',
    orientation: 'portrait',
    marginsMm: {
      top: 5, right: 15, bottom: 10, left: 15,
    },
    headerDistanceMm: 0,
    footerDistanceMm: 0,
  },
  format: {
    fontFamily: 'Times New Roman',
    fontSizePt: 11,
    lineHeight: 1,
    paragraphSpacingBeforePt: 0,
    paragraphSpacingAfterPt: 0,
    showPageNumbers: false,
  },
  styleSheet: {
    body: { align: 'left' },
    bodyJustify: { align: 'justify' },
    title: { fontSizePt: 14, fontWeight: 700, align: 'center' },
    appendixReference: { fontSizePt: 10, align: 'left' },
    formCaption: { fontSizePt: 10, align: 'center' },
    formValue: { fontWeight: 700, textTransform: 'uppercase', align: 'center' },
    inlineEmphasis: { fontWeight: 700, textDecoration: 'underline' },
    letterheadContact: {
      fontSizePt: 9, fontWeight: 700, fontStyle: 'italic', align: 'right',
    },
    signatureName: { align: 'center' },
    signatureCaption: { align: 'center' },
  },
  lineStyles: {
    letterheadDivider: { style: 'solid', widthPt: 3, color: '#000000' },
    formLine: {
      style: 'solid', widthPt: 0.75, color: '#000000', fillBeforeValue: true, fillAfterValue: true,
    },
    signatureLine: { style: 'solid', widthPt: 0.75, color: '#000000' },
  },
  layoutV2: {
    renderLegacyContent: false,
    blocks: [
      {
        columnGapMm: 5,
        columns: [
          {
            content: {
              fit: 'contain', heightMm: 17, horizontalAlign: 'left', source: '{{logo}}', type: 'image', verticalAlign: 'top', widthMm: 64.4,
            },
            widthMm: 64.4,
          },
          {
            content: {
              horizontalAlign: 'right',
              lines: [
                '{{clinic.address.uk}}',
                'Код ЄДРПОУ {{clinic.edrpou}}, ІПН {{clinic.taxId}}, Свідоцтво ПДВ №{{clinic.vatCertificateNumber}}',
                'тел.: {{clinic.phone}}',
              ],
              style: 'letterheadContact',
              type: 'stack',
            },
            widthMm: 110.6,
          },
        ],
        heightMm: 18,
        paddingBottomMm: 1,
        type: 'letterhead',
        bottomBorderStyle: 'letterheadDivider',
      },
      {
        marginBottomMm: 5,
        marginTopMm: 4,
        style: 'body',
        text: 'Вих. № {{geneticAffinityCertificate.outgoingNumberOrBlank}} від {{geneticAffinityCertificate.issueDateOrBlank.uk}} року',
        type: 'paragraph',
      },
      {
        horizontalAlign: 'right',
        lines: [
          'Додаток 18',
          'до Порядку застосування допоміжних',
          'репродуктивних технологій в Україні',
          '(пункт 6.9 розділу VI)',
        ],
        marginBottomMm: 6,
        style: 'appendixReference',
        type: 'alignedBox',
        widthMm: 70,
      },
      { style: 'title', text: 'ДОВІДКА', type: 'paragraph' },
      {
        marginBottomMm: 1, style: 'title', text: 'про генетичну спорідненість батьків (матері чи батька) з плодом', type: 'paragraph',
      },
      { style: 'body', text: 'Подружжя:', type: 'paragraph' },
      {
        caption: '(прізвище, ім’я, по батькові, рік народження)',
        captionStyle: 'formCaption',
        label: 'дружина',
        labelWidthMm: 15,
        marginBottomMm: 0.5,
        style: 'body',
        type: 'fieldLine',
        value: '{{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.,',
        valueStyle: 'formValue',
        lineStyle: 'formLine',
      },
      {
        marginBottomMm: 2.5,
        style: 'body',
        text: 'паспорт: тип: {{wife.passport.type}}, Код країни: {{wife.passport.countryCode}}, № {{wife.passport.number}} виданий {{wife.passport.issuedBy.uk}} від {{wife.passport.issueDate}} року,',
        type: 'paragraph',
      },
      {
        caption: '(прізвище, ім’я, по батькові, рік народження)',
        captionStyle: 'formCaption',
        label: 'та чоловік',
        labelWidthMm: 23,
        marginBottomMm: 0.5,
        style: 'body',
        type: 'fieldLine',
        value: '{{husband.name.uk.nominative}}, {{husband.birthDate}} р.н.,',
        valueStyle: 'formValue',
        lineStyle: 'formLine',
      },
      {
        marginBottomMm: 3,
        style: 'body',
        text: 'паспорт: тип: {{husband.passport.type}}, Код країни: {{husband.passport.countryCode}}, № {{husband.passport.number}}, виданий {{husband.passport.issuedBy.uk}} від {{husband.passport.issueDate}} року,',
        type: 'paragraph',
      },
      {
        marginBottomMm: 3,
        style: 'bodyJustify',
        text: 'які перебувають у зареєстрованому шлюбі від {{couple.marriage.dateFormatted.uk}} року, {{couple.marriage.certificateType.uk}} № {{couple.marriage.certificateNumber}}, виданий {{couple.marriage.certificateIssuedBy.uk}} від {{couple.marriage.certificateDateFormatted.uk}} року, звернулися в заклад охорони здоров\'я.',
        type: 'paragraph',
      },
      {
        marginBottomMm: 3, style: 'body', text: 'Після обстеження встановлено діагноз: {{case.artProgram.medicalIndication.diagnosis.uk}}', type: 'paragraph',
      },
      {
        runs: [
          { text: 'У зв’язку з неможливістю виношування вагітності було проведено програму ДРТ з перенесенням ' },
          { style: 'inlineEmphasis', text: 'ембріона' },
          { text: '/ембріонів, доставленого {{geneticAffinityCertificate.transferAttempt.shipment.receivedDateFormatted.uk}} року у {{geneticAffinityCertificate.transferAttempt.shipment.destinationClinic.name.uk}} з {{geneticAffinityCertificate.transferAttempt.shipment.sourceClinic.name.uk}}, {{geneticAffinityCertificate.transferAttempt.shipment.sourceClinic.country.uk}}, на стадії {{geneticAffinityCertificate.transferAttempt.embryoStageLabel.uk.genitive}}, після відтаювання, у порожнину матки сурогатної матері' },
        ],
        style: 'bodyJustify',
        type: 'richParagraph',
      },
      {
        caption: '(прізвище, ім’я, по батькові, рік народження)',
        captionStyle: 'formCaption',
        marginBottomMm: 0.5,
        style: 'body',
        type: 'fieldLine',
        value: '{{surrogateMother.name.uk.nominative}}, {{surrogateMother.birthDate}} р.н.,',
        valueStyle: 'formValue',
        lineStyle: 'formLine',
      },
      {
        style: 'body', text: 'паспорт: серії {{surrogateMother.passport.number}} виданий {{surrogateMother.passport.issuedBy.uk}} від {{surrogateMother.passport.issueDate}} року.', type: 'paragraph',
      },
      {
        caption: '(прізвище, ініціали дружини / код донора)',
        captionStyle: 'formCaption',
        label: 'У лікувальній програмі ДРТ використано яйцеклітини',
        labelWidthMm: 91,
        style: 'body',
        type: 'fieldLine',
        value: '{{wife.name.uk.nominative}}',
        valueStyle: 'formValue',
        lineStyle: 'formLine',
      },
      {
        caption: '(прізвище, ініціали / код донора)',
        captionStyle: 'formCaption',
        labelRuns: [
          { style: 'inlineEmphasis', text: 'та' },
          { text: '/або сперматозоїди' },
        ],
        labelWidthMm: 44,
        style: 'body',
        type: 'fieldLine',
        value: '{{husband.name.uk.nominative}}',
        valueStyle: 'formValue',
        lineStyle: 'formLine',
      },
      {
        style: 'body', text: 'Перенесення ембріона у порожнину матки сурогатної матері відбулось {{geneticAffinityCertificate.transferAttempt.dateFormatted.uk}} року.', type: 'paragraph',
      },
      {
        style: 'body', text: 'Перенесено {{geneticAffinityCertificate.transferAttempt.embryoCountText.uk}} на стадії {{geneticAffinityCertificate.transferAttempt.embryoStageLabel.uk.genitive}}.', type: 'paragraph',
      },
      {
        style: 'formCaption', text: '(кількість, стадія розвитку, в тому числі кріоконсервованих)', type: 'paragraph',
      },
      {
        style: 'body', text: 'Факт вагітності при дослідженні ХГ в крові встановлено {{geneticAffinityCertificate.hcgTest.dateFormatted.uk}} року.', type: 'paragraph',
      },
      {
        style: 'body', text: 'На УЗД факт вагітності, кількість плодів та строк вагітності підтверджено {{geneticAffinityCertificate.ultrasound.dateFormatted.uk}} року – вагітність {{geneticAffinityCertificate.ultrasound.gestationalAgeText.uk}}, {{geneticAffinityCertificate.ultrasound.pregnancyTypeText.uk}}.', type: 'paragraph',
      },
      {
        runs: [
          { text: 'Має місце генетична спорідненість батьків з ' },
          { style: 'inlineEmphasis', text: 'плодом' },
          { text: '/плодами.' },
        ],
        style: 'body',
        type: 'richParagraph',
      },
      { heightMm: 12, type: 'spacer' },
      {
        border: 'none',
        cellPaddingMm: 0,
        columnWidthsMm: [80, 60, 32.5],
        horizontalAlign: 'left',
        rows: [
          [
            { style: 'body', text: 'Лікар' },
            {
              style: 'signatureName', text: '{{case.artProgram.medicalTeam.physician.name.uk.nominative}}', bottomBorderStyle: 'signatureLine',
            },
            { style: 'signatureName', text: '', bottomBorderStyle: 'signatureLine' },
          ],
          [
            { text: '' },
            { style: 'signatureCaption', text: '(прізвище, ім’я, по батькові)' },
            { style: 'signatureCaption', text: '(підпис)' },
          ],
          { heightMm: 5, type: 'spacerRow' },
          [
            { style: 'body', text: 'Керівник закладу охорони здоров’я' },
            {
              style: 'signatureName', text: '{{clinic.medicalDirector.name.uk.nominative}}', bottomBorderStyle: 'signatureLine',
            },
            { style: 'signatureName', text: '', bottomBorderStyle: 'signatureLine' },
          ],
          [
            { text: '' },
            { style: 'signatureCaption', text: '(прізвище, ім’я, по батькові)' },
            { style: 'signatureCaption', text: '(підпис)' },
          ],
        ],
        type: 'signatureTable',
      },
      {
        marginTopMm: 5, style: 'body', text: '{{geneticAffinityCertificate.issueDateOrBlank.uk}} року', type: 'paragraph',
      },
      { marginTopMm: 4, style: 'body', text: 'М.П.', type: 'paragraph' },
    ],
  },
};

const cleanTemplate = () => JSON.parse(JSON.stringify(CLEAN_TEMPLATE_JSON));

const TINY_PNG_DATA_URL = 'data:image/png;base64,'
  + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const clinicLogos = [{ fileName: 'logo.png', dataUrl: TINY_PNG_DATA_URL, layout: '1col', width: 4, height: 1 }];

// Full context - every placeholder path the template actually references.
const fullContext = () => ({
  logo: '{{logo}}',
  wife: {
    name: { uk: { nominative: 'Кікава Харука' } },
    birthDate: '01.01.1990',
    passport: {
      type: 'Р', countryCode: 'JPN', number: 'TS0299493', issuedBy: { uk: 'Міністерством закордонних справ' }, issueDate: '06.04.2018',
    },
  },
  husband: {
    name: { uk: { nominative: 'Кікава Йосуке' } },
    birthDate: '02.02.1988',
    passport: {
      type: 'Р', countryCode: 'JPN', number: 'TT2633446', issuedBy: { uk: 'Міністерством закордонних справ' }, issueDate: '11.01.2023',
    },
  },
  surrogateMother: {
    name: { uk: { nominative: 'Молвінських Юлія Володимирівна' } },
    birthDate: '27.05.1993',
    passport: { number: 'ЕВ 409051', issuedBy: { uk: 'Гайворонським РС УДМС України в Кіровоградській області' }, issueDate: '28.04.2016' },
  },
  couple: {
    marriage: {
      dateFormatted: { uk: '25.11.2017' },
      certificateType: { uk: 'Витяг з сімейного реєстру' },
      certificateNumber: '00554629',
      certificateIssuedBy: { uk: 'Мером району Кіта' },
      certificateDateFormatted: { uk: '25.11.2017' },
    },
  },
  clinic: {
    address: { uk: 'м. Київ, вул. Тестова, 1' },
    edrpou: '35085030',
    taxId: '350850326598',
    vatCertificateNumber: '200107025',
    phone: '(044) 425-52-77',
    medicalDirector: { name: { uk: { nominative: 'Пилип Юрій Юрійович' } } },
  },
  case: {
    artProgram: {
      medicalIndication: { diagnosis: { uk: 'Непліддя І. Матковий фактор.' } },
      medicalTeam: { physician: { name: { uk: { nominative: 'Тестовий Лікар Лікарович' } } } },
    },
  },
  geneticAffinityCertificate: {
    outgoingNumberOrBlank: '123',
    issueDateOrBlank: { uk: '15.05.2026' },
    transferAttempt: {
      dateFormatted: { uk: '18.09.2025' },
      embryoCountText: { uk: 'один ембріон' },
      embryoStageLabel: { uk: { genitive: 'бластоцисти' } },
      shipment: {
        receivedDateFormatted: { uk: '27.08.2025' },
        destinationClinic: { name: { uk: 'Клініка призначення' } },
        sourceClinic: { name: { uk: 'Клініка джерело' }, country: { uk: 'Японія' } },
      },
    },
    hcgTest: { dateFormatted: { uk: '30.09.2025' } },
    ultrasound: {
      dateFormatted: { uk: '17.10.2025' }, gestationalAgeText: { uk: '6-7 тижнів' }, pregnancyTypeText: { uk: 'одноплідна' },
    },
  },
});

describe('clean layoutV2 template - geometry/lineStyles/style-cascade unit tests', () => {
  it('getPageGeometry derives contentWidthMm from size/orientation/marginsMm, never a stored value', () => {
    const geometry = getPageGeometry(cleanTemplate());
    expect(geometry.widthMm).toBe(210);
    expect(geometry.heightMm).toBe(297);
    expect(geometry.margins).toEqual({
      top: 5, right: 15, bottom: 10, left: 15,
    });
    expect(geometry.contentWidthMm).toBe(180);
  });

  it('getPageGeometry never requires page.widthMm/heightMm/contentWidthMm on the template', () => {
    const template = cleanTemplate();
    expect(template.page.widthMm).toBeUndefined();
    expect(template.page.heightMm).toBeUndefined();
    expect(template.layoutV2.contentWidthMm).toBeUndefined();
  });

  it('getSignatureTableWidthMm sums columnWidthsMm - never requires a stored widthMm', () => {
    expect(getSignatureTableWidthMm({ columnWidthsMm: [80, 60, 32.5] })).toBe(172.5);
    const signatureBlock = cleanTemplate().layoutV2.blocks.find(block => block.type === 'signatureTable');
    expect(signatureBlock.widthMm).toBeUndefined();
    expect(getSignatureTableWidthMm(signatureBlock)).toBe(172.5);
  });

  it('resolveLineStyle reads a named entry from lineStyles, null for an unknown/absent name', () => {
    const template = cleanTemplate();
    expect(resolveLineStyle(template, 'formLine')).toEqual({
      style: 'solid', widthPt: 0.75, color: '#000000', fillBeforeValue: true, fillAfterValue: true,
    });
    expect(resolveLineStyle(template, 'letterheadDivider')).toEqual({ style: 'solid', widthPt: 3, color: '#000000' });
    expect(resolveLineStyle(template, 'doesNotExist')).toBeNull();
    expect(resolveLineStyle(template, undefined)).toBeNull();
  });

  it('resolveLayoutV2Style cascades format -> named style -> styleOverrides, never requiring styleSheet.document', () => {
    const template = cleanTemplate();
    expect(template.styleSheet.document).toBeUndefined();
    // "body" only overrides align - fontFamily/fontSizePt/lineHeight must still come from `format`.
    const bodyStyle = resolveLayoutV2Style(template, 'body', {});
    expect(bodyStyle.fontFamily).toBe('Times New Roman');
    expect(bodyStyle.fontSizePt).toBe(11);
    expect(bodyStyle.lineHeight).toBe(1);
    expect(bodyStyle.align).toBe('left');
    // named style wins over format when both set a key.
    const titleStyle = resolveLayoutV2Style(template, 'title', {});
    expect(titleStyle.fontSizePt).toBe(14);
    expect(titleStyle.fontFamily).toBe('Times New Roman'); // still inherited from format
    // an explicit block override wins over the named style.
    const overridden = resolveLayoutV2Style(template, 'title', { fontSizePt: 20 });
    expect(overridden.fontSizePt).toBe(20);
  });

  it('validateLayoutV2Template reports no errors/warnings for a well-formed clean template', () => {
    const { errors, warnings } = validateLayoutV2Template(cleanTemplate());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('validateLayoutV2Template flags an unknown named style, lineStyle, bottomBorderStyle and block type', () => {
    const template = cleanTemplate();
    template.layoutV2.blocks.push({ type: 'paragraph', style: 'noSuchStyle', text: 'x' });
    template.layoutV2.blocks.push({
      type: 'fieldLine', style: 'body', value: 'x', lineStyle: 'noSuchLine',
    });
    template.layoutV2.blocks[0].bottomBorderStyle = 'noSuchBorder';
    template.layoutV2.blocks.push({ type: 'somethingWeird' });
    const { warnings } = validateLayoutV2Template(template);
    expect(warnings.some(message => message.includes('noSuchStyle'))).toBe(true);
    expect(warnings.some(message => message.includes('noSuchLine'))).toBe(true);
    expect(warnings.some(message => message.includes('noSuchBorder'))).toBe(true);
    expect(warnings.some(message => message.includes('somethingWeird'))).toBe(true);
  });

  it('validateLayoutV2Template flags letterhead/signatureTable columns that overflow the content width', () => {
    const template = cleanTemplate();
    const letterhead = template.layoutV2.blocks.find(block => block.type === 'letterhead');
    letterhead.columns[1].widthMm = 200;
    const { warnings } = validateLayoutV2Template(template);
    expect(warnings.some(message => message.includes('Letterhead columns'))).toBe(true);
  });
});

describe('clean layoutV2 template - normalization (buildGeneratedDocument)', () => {
  it('flags the clean template as layoutV2 and normalizes without throwing', () => {
    expect(isLayoutV2Template(cleanTemplate())).toBe(true);
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    expect(resolved.layoutV2).toBeTruthy();
    expect(resolved.layoutV2.blocks).toHaveLength(cleanTemplate().layoutV2.blocks.length);
  });

  it('computes page geometry (widthMm/heightMm/marginsMm/contentWidthMm) - never reads a stored value', () => {
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    expect(resolved.layoutV2.page.widthMm).toBe(210);
    expect(resolved.layoutV2.page.heightMm).toBe(297);
    expect(resolved.layoutV2.page.marginsMm).toEqual({
      top: 5, right: 15, bottom: 10, left: 15,
    });
    expect(resolved.layoutV2.contentWidthMm).toBe(180);
  });

  it('resolves the letterhead bottomBorderStyle into a concrete border, without mutating the template', () => {
    const template = cleanTemplate();
    const resolved = buildGeneratedDocument(template, fullContext());
    const letterhead = resolved.layoutV2.blocks.find(block => block.type === 'letterhead');
    expect(letterhead.bottomBorder).toEqual({ style: 'solid', widthPt: 3, color: '#000000' });
    // The source template's own block never gets a resolved copy written back onto it.
    expect(cleanTemplate().layoutV2.blocks[0].bottomBorder).toBeUndefined();
  });

  it('resolves every fieldLine\'s lineStyle into a concrete line object (fillBeforeValue/fillAfterValue included)', () => {
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    const fieldLines = resolved.layoutV2.blocks.filter(block => block.type === 'fieldLine');
    expect(fieldLines.length).toBeGreaterThan(0);
    fieldLines.forEach(block => {
      expect(block.line).toEqual({
        style: 'solid', widthPt: 0.75, color: '#000000', fillBeforeValue: true, fillAfterValue: true,
      });
    });
  });

  it('resolves signatureTable cell bottomBorderStyle and computes the table width from columnWidthsMm', () => {
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    const table = resolved.layoutV2.blocks.find(block => block.type === 'signatureTable');
    expect(table.widthMm).toBe(172.5);
    const physicianNameCell = table.rows.flat().find(cell => cell?.text?.includes('Тестовий Лікар'));
    expect(physicianNameCell.bottomBorder).toEqual({ style: 'solid', widthPt: 0.75, color: '#000000' });
    // The caption row's cells never asked for a bottomBorderStyle - they must stay borderless.
    const captionCell = table.rows.flat().find(cell => cell?.text === '(підпис)');
    expect(captionCell.bottomBorder).toBeFalsy();
  });

  it('leaves no unresolved {{...}} placeholders anywhere in the normalized tree', () => {
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    expect(findUnresolvedPlaceholders(resolved.layoutV2)).toEqual([]);
  });

  it('never introduces legacy template fields (beforeTitle/title/paragraphs/logo/columns) into layoutV2 itself', () => {
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    expect(resolved.layoutV2.beforeTitle).toBeUndefined();
    expect(resolved.layoutV2.title).toBeUndefined();
    expect(resolved.layoutV2.paragraphs).toBeUndefined();
    expect(resolved.layoutV2.logo).toBeUndefined();
    expect(resolved.layoutV2.columns).toBeUndefined();
  });
});

describe('clean layoutV2 template - real render backends', () => {
  it('renders the clean template to a PDF without throwing', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    Font.register({
      family: 'Tinos',
      fonts: [
        { src: toDataUri('Tinos-Regular.ttf'), fontWeight: 400 },
        { src: toDataUri('Tinos-Bold.ttf'), fontWeight: 700 },
        { src: toDataUri('Tinos-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
        { src: toDataUri('Tinos-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
      ],
    });
    Font.registerHyphenationCallback(word => [word]);
    const DocumentsPdfDocument = documentsModule.default;
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    const element = React.createElement(DocumentsPdfDocument, {
      documents: [resolved], layout: 'two-column', clinicLogos,
    });
    const buffer = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(500);
  }, 20000);

  it('builds a .docx blob for the clean template without throwing', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const resolved = buildGeneratedDocument(cleanTemplate(), fullContext());
    const blob = await buildDocumentsDocx({ documents: [resolved], layout: 'two-column', clinicLogos });
    expect(blob.size).toBeGreaterThan(500);
  }, 20000);
});
