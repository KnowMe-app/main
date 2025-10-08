const { parseMedicationClipboardData } = require('utils/medicationClipboard');

describe('parseMedicationClipboardData', () => {
  const scheduleText = [
    'Аспірин кардіо, 31.10.2025 1+1 30.10.2025 14',
    'Фолієва кислота, 30.10.2025 1 30.10.2025 25',
    'Метипред, 02.11.2025 1+1+1+1 30.10.2025 30',
    'Прогінова, 31.10.2025 1+1 30.10.2025 21',
  ].join('\n');

  it('restores all medications from multiline clipboard text', () => {
    const parsed = parseMedicationClipboardData(scheduleText);
    expect(parsed).not.toBeNull();
    expect(parsed.medicationOrder).toEqual(['aspirin', 'folicAcid', 'metypred', 'progynova']);
  });

  it('restores all medications when line breaks are lost during paste', () => {
    const singleLine = scheduleText.replace(/\n/g, ' ');
    const parsed = parseMedicationClipboardData(singleLine);
    expect(parsed).not.toBeNull();
    expect(parsed.medicationOrder).toEqual(['aspirin', 'folicAcid', 'metypred', 'progynova']);
  });
});
