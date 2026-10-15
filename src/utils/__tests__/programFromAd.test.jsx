import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { ProgramPreview } from '../../components/programs/ProgramsView';
import { normalizeProgram, programBreakdown } from '../donorPrograms';
import { SURROGACY_EURO_AD, SURROGACY_GEORGIA_AD } from '../__fixtures__/programAdSurrogacyGeorgia';
import { applyUkrainianInterface } from '../../testUtils/interfaceLanguage';

applyUkrainianInterface();

// Тестове заповнення програми за справжнім оголошенням: усе, що агенція
// написала, мусить пережити нормалізацію (вона мовчки відкидає те, чого не
// знає) і дійти до картки.
const previewText = program => {
  const { container } = render(<ProgramPreview program={program} language="uk" defaultOpen />);
  return container.textContent.replace(/\s+/g, ' ');
};

describe('програма СМ з оголошення: Грузія, 40–41 рік', () => {
  const program = normalizeProgram(SURROGACY_GEORGIA_AD, 'ad1');

  it('нормалізація не губить жодного поля оголошення', () => {
    expect(program.requirements).toMatchObject({ ageFrom: 40, ageTo: 41, rh: '+', csectionMax: '1' });
    expect(program.customRequirements).toHaveLength(2);
    expect(Object.keys(program.payments).sort()).toEqual(['cSection', 'experience', 'final', 'monthly', 'transfer']);
    expect(program.otherPayments).toHaveLength(2);
    expect(program.coverageDetails.food).toMatchObject({ mode: 'allowance', per: 'day', limit: { amount: 15 } });
    expect(program.coverageDetails.clothes.limit.amount).toBe(300);
  });

  it('сума: 19 000 + 400 × 9 (місяців агенція не вказала) + перший перенос; решта — додаткові', () => {
    const { guaranteed, max } = programBreakdown(program);
    expect(guaranteed.amount).toBe(19000 + 3600 + 300);
    expect(guaranteed.approximate).toBe(true);
    expect(max.amount).toBe(22900 + 1000 + 500 + 400 + 500);
  });

  it('картка показує все, що написала агенція', () => {
    const text = previewText(program);
    [
      'Шукаємо сурогатну маму',
      'Винагорода ≈ 22 900–25 300 $',
      'Грузія — частково або повністю виїзна',
      '19 000 $',
      '400 $/міс',
      'перший перенос',
      'Кесарів розтин',
      'Другий перенос',
      'Третій перенос',
      '40–41 років',
      'лише Rh+',
      'можна з 1 КР',
      'Вага в нормі',
      'Згода чоловіка не потрібна',
      'до 15 $ на день',
      'на одяг (няню)',
      'Всього 3 спроби',
    ].forEach(fragment => expect(text).toContain(fragment));
  });
});

describe('програма СМ з оголошення: виплати в євро', () => {
  const program = normalizeProgram(SURROGACY_EURO_AD, 'ad2');

  it('вимоги й виплата в євро доходять до картки', () => {
    const text = previewText(program);
    ['22–36 років', 'лише Rh+', 'можна з 1 КР', 'є власна дитина', 'до 4 пологів', 'Без шкідливих звичок', '18 500 €', 'до 19 000 €']
      .forEach(fragment => expect(text).toContain(fragment));
  });
});
