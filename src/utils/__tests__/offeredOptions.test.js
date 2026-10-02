import { listOfferedOptions } from '../offeredOptions';
import { pickerFields } from '../../components/formFields';

const field = name => pickerFields.find(item => item.name === name);
const labels = options => options.map(option => option.ukrainian);

describe('варіанти, які пропонує форма', () => {
  it('не пропонує дублікатів, але лишає їх у довіднику для перекладу', () => {
    const eyes = field('eyeColor').options;
    expect(labels(listOfferedOptions(eyes, ''))).not.toContain('Коричневі');
    expect(labels(listOfferedOptions(eyes, '')).filter(label => label === 'Карі')).toHaveLength(1);
    // `Hazel` у довіднику є — ним перекладаються вже записані анкети.
    expect(eyes.some(option => option.placeholder === 'Hazel')).toBe(true);
  });

  it('лишає записане значення видимим, навіть якщо його вже не пропонують', () => {
    const hair = field('hairColor').options;
    expect(labels(listOfferedOptions(hair, ''))).not.toContain('Темна брюнетка');
    expect(labels(listOfferedOptions(hair, 'Dark Brunette'))).toContain('Темна брюнетка');
  });

  it('питає рівень освіти, а не «так/ні», і хобі текстом', () => {
    expect(labels(listOfferedOptions(field('education').options, ''))).toEqual(expect.arrayContaining(['Вища освіта', 'Бакалавр']));
    expect(labels(listOfferedOptions(field('education').options, ''))).not.toContain('Так');
    expect(listOfferedOptions(field('hobbies').options, '')).toHaveLength(0);
  });

  it('пише варіанти з великої літери', () => {
    ['hairStructure', 'bodyType', 'race'].forEach(name => {
      listOfferedOptions(field(name).options, '').forEach(option => {
        expect(option.ukrainian[0]).toBe(option.ukrainian[0].toUpperCase());
      });
    });
  });
});
