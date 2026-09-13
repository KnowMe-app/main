import { canGoBackInHistory, goBackOrTo } from '../appBackNavigation';

/**
 * «Назад» — один жест із трьома входами (стрілка в шапці, кнопка браузера,
 * апаратна кнопка телефона), і всі троє мусять вести в одне місце. Тут
 * перевіряється єдине рішення, від якого це залежить: чи є що знімати з історії.
 */
describe('appBackNavigation', () => {
  const setHistoryIdx = idx => window.history.replaceState({ idx }, '');

  afterEach(() => window.history.replaceState(null, ''));

  it('знімає запис історії, коли попередній екран у ній є', () => {
    setHistoryIdx(3);
    const navigate = jest.fn();

    expect(canGoBackInHistory()).toBe(true);
    goBackOrTo(navigate, '/matching');
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  // Перший запис сесії — це відкрите посиланням або перезавантажене вікно:
  // знімати нічого, і `navigate(-1)` вивів би читача із застосунку.
  it('веде на запасну адресу, коли знімати нічого', () => {
    setHistoryIdx(0);
    const navigate = jest.fn();

    expect(canGoBackInHistory()).toBe(false);
    goBackOrTo(navigate, '/matching');
    expect(navigate).toHaveBeenCalledWith('/matching');
  });

  it('без запасної адреси не робить нічого — краще лишитись, ніж вийти навмання', () => {
    setHistoryIdx(0);
    const navigate = jest.fn();

    goBackOrTo(navigate, '');
    expect(navigate).not.toHaveBeenCalled();
  });
});
