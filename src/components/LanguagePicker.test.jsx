import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguagePicker } from './LanguagePicker';

// Мов сім, тож згорнутим вибір займає один рядок, а сітка з'являється на
// дотик і згортається після вибору.
describe('вибір мови в меню', () => {
  const renderPicker = (language = 'uk') => {
    const setLanguage = jest.fn();
    render(<LanguagePicker language={language} setLanguage={setLanguage} />);
    return { setLanguage };
  };

  it('згорнутий показує поточну мову її ж назвою і підказку «Language»', () => {
    renderPicker('de');
    const toggle = screen.getByTestId('language-picker-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Deutsch · Language');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('англійській підказка «Language» не потрібна', () => {
    renderPicker('en');
    const toggle = screen.getByTestId('language-picker-toggle');
    expect(toggle.textContent).toContain('English');
    expect(toggle.textContent).not.toContain('· Language');
  });

  it('розгортає сім мов рідними назвами і згортається після вибору', () => {
    const { setLanguage } = renderPicker('uk');
    fireEvent.click(screen.getByTestId('language-picker-toggle'));
    expect(screen.getAllByRole('radio').map(radio => radio.value))
      .toEqual(['uk', 'en', 'es', 'de', 'nl', 'ja', 'zh']);
    ['Українська', 'English', 'Español', 'Deutsch', 'Nederlands', '日本語', '中文']
      .forEach(name => expect(screen.getByRole('radio', { name })).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Українська' }).checked).toBe(true);

    // Клік вказівником по підпису: `detail: 1`. Підпис пересилає його
    // радіокнопці — та обирає мову.
    fireEvent.click(screen.getByText('Nederlands'), { detail: 1 });
    expect(setLanguage).toHaveBeenCalledWith('nl');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  // Стрілка в радіогрупі обирає сусідню мову (браузер шле `click` з
  // `detail === 0`) — і сітка мусить лишатись, інакше далі сусідньої не дійти.
  it('стрілка клавіатури перемикає мову, а сітку лишає відкритою', () => {
    const { setLanguage } = renderPicker('uk');
    fireEvent.click(screen.getByTestId('language-picker-toggle'));
    fireEvent.click(screen.getByRole('radio', { name: 'English' }), { detail: 0 });
    expect(setLanguage).toHaveBeenCalledWith('en');
    expect(screen.getByRole('radiogroup')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Enter' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('Escape згортає сітку без вибору', () => {
    const { setLanguage } = renderPicker('uk');
    fireEvent.click(screen.getByTestId('language-picker-toggle'));
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Escape' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(setLanguage).not.toHaveBeenCalled();
  });
});
