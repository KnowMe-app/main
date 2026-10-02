/**
 * Варіанти, які форма пропонує: без `legacy`, окрім того, що вже записаний в
 * анкеті.
 *
 * Дублікати довідника («Карі» й «Коричневі», «Темне» й «Брюнет») і «Так/Ні»
 * там, де питають рівень чи текст, з довідника не знято: значення в базі лежать
 * англійськими словами, і з цих пар перекладаються вже записані анкети. Але
 * пропонувати їх для вибору не треба. Записане ж значення лишається видимим —
 * інакше воно зникло б з екрана або впало б у «свій варіант» сирим словом.
 */
const optionValue = option => option?.value ?? option?.placeholder ?? option?.label ?? '';

export const listOfferedOptions = (options, currentValue) => {
  if (!Array.isArray(options)) return [];
  const current = String(currentValue ?? '');
  return options.filter(option => !option?.legacy || String(optionValue(option)) === current);
};
