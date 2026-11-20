// Сценарії екрана Flow, які вже ламались (20.11). Чисті функції розбору й
// сум перевіряє `utils/flowEntries.test.js`; тут — рендер і дотики.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { writeFlowCache } from 'utils/flowOfflineWrites';

const CONFIG_FNS = [
  'deleteFlowEntry',
  'deleteFlowCategory',
  'renameFlowCategory',
  'applyFlowRawPatch',
  'clearFlowData',
  'fetchFlowData',
  'fetchMonobankUahExchangeRates',
  'fetchNbuUahExchangeRatesByDate',
  'resolveFlowExchangeRatesForMode',
  'saveFlowEntry',
  'updateFlowEntry',
];

// Фабрика моку піднімається над імпортами, тож функції створює вона сама,
// а тест бере їх з модуля.
jest.mock('./config', () => {
  const fns = {};
  [
    'deleteFlowEntry', 'deleteFlowCategory', 'renameFlowCategory', 'applyFlowRawPatch', 'clearFlowData',
    'fetchFlowData', 'fetchMonobankUahExchangeRates', 'fetchNbuUahExchangeRatesByDate',
    'resolveFlowExchangeRatesForMode', 'saveFlowEntry', 'updateFlowEntry',
  ].forEach(name => {
    fns[name] = jest.fn();
  });
  return { auth: { currentUser: { uid: 'owner-1' } }, ...fns };
});
jest.mock('./flowOwnersRemote', () => ({ listFlowOwners: () => Promise.resolve([]) }));
jest.mock('./ProfileDotsMenu', () => ({ ProfileDotsMenu: () => null }));
jest.mock('react-hot-toast', () => {
  const toast = jest.fn();
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { __esModule: true, default: toast };
});

// eslint-disable-next-line import/first
import { FlowManager } from './FlowManager';
// eslint-disable-next-line import/first
import * as config from './config';

const mockConfig = Object.fromEntries(CONFIG_FNS.map(name => [name, config[name]]));

const OWNER = 'owner-1';
// «Дім» має записи лише в підгрупах — саме таку групу колись не вдавалось обрати.
const DATA = {
  'Дім': {
    'Оренда': { '2026-11-03': { e1: '16500_оренда листопад' } },
    'Комуналка': { '2026-11-12': { e2: '2910_опалення' } },
  },
  'Продукти': { '2026-11-02': { e3: '1240_Сільпо' }, '2026-11-06': { e4: '860_ринок' } },
};

const renderFlow = () => render(
  <MemoryRouter>
    <FlowManager ownerId={OWNER} viewerId={OWNER} />
  </MemoryRouter>,
);

const openPicker = () => fireEvent.click(screen.getByTestId('flow-entry-group'));
const picker = () => screen.getByTestId('flow-group-picker');

describe('FlowManager', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(mockConfig).forEach(fn => fn.mockReset());
    mockConfig.fetchFlowData.mockResolvedValue(JSON.parse(JSON.stringify(DATA)));
    mockConfig.fetchMonobankUahExchangeRates.mockResolvedValue(null);
    mockConfig.resolveFlowExchangeRatesForMode.mockReturnValue(null);
    mockConfig.saveFlowEntry.mockResolvedValue({ patch: {}, delivered: Promise.resolve() });
    mockConfig.renameFlowCategory.mockResolvedValue({ patch: {}, delivered: Promise.resolve() });
    writeFlowCache(OWNER, JSON.parse(JSON.stringify(DATA)));
    jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    window.confirm.mockRestore();
  });

  it('asks about merging groups in its own dialog with the count, not window.confirm', async () => {
    renderFlow();
    await waitFor(() => expect(mockConfig.fetchFlowData).toHaveBeenCalled());
    openPicker();
    fireEvent.click(within(picker()).getByText('Керувати'));
    fireEvent.click(within(picker()).getByLabelText('Перейменувати групу Продукти'));
    const input = within(picker()).getByDisplayValue('Продукти');
    fireEvent.change(input, { target: { value: 'Дім' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const summary = await screen.findByTestId('flow-category-merge-summary');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(summary.textContent).toContain('2 записи');
    expect(summary.textContent).toMatch(/2\s100 грн/);
    expect(mockConfig.renameFlowCategory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('flow-category-merge-confirm'));
    await waitFor(() => expect(mockConfig.renameFlowCategory).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: OWNER,
      fromGroupPath: 'Продукти',
      toGroupPath: 'Дім',
    })));
  });

  it('closes the merge question first on Escape and leaves the group sheet open', async () => {
    renderFlow();
    await waitFor(() => expect(mockConfig.fetchFlowData).toHaveBeenCalled());
    openPicker();
    fireEvent.click(within(picker()).getByText('Керувати'));
    fireEvent.click(within(picker()).getByLabelText('Перейменувати групу Продукти'));
    const input = within(picker()).getByDisplayValue('Продукти');
    fireEvent.change(input, { target: { value: 'Дім' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByTestId('flow-category-merge-summary');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('flow-category-merge-summary')).toBeNull();
    expect(screen.getByTestId('flow-group-picker')).toBeTruthy();
    expect(mockConfig.renameFlowCategory).not.toHaveBeenCalled();
  });

  it('does not save the typed entry into the old group when the group chip is tapped', async () => {
    localStorage.setItem(`flow-last-category:${OWNER}`, 'Дім/Оренда');
    renderFlow();
    await waitFor(() => expect(mockConfig.fetchFlowData).toHaveBeenCalled());
    const entry = screen.getByTestId('flow-entry-input');
    fireEvent.focus(entry);
    fireEvent.change(entry, { target: { value: '450 хліб' } });

    const chip = screen.getByTestId('flow-entry-group');
    fireEvent.pointerDown(chip);
    fireEvent.blur(entry);
    fireEvent.click(chip);
    await screen.findByTestId('flow-group-picker');
    expect(mockConfig.saveFlowEntry).not.toHaveBeenCalled();

    // «Продукти» без підгруп: вибір завершено, шторка закривається й запис іде вже туди.
    fireEvent.click(within(picker()).getByText('Продукти'));
    await waitFor(() => expect(mockConfig.saveFlowEntry).toHaveBeenCalledTimes(1));
    expect(mockConfig.saveFlowEntry.mock.calls[0][0]).toMatchObject({ groupPath: 'Продукти', amount: '450' });
  });

  it('lets a group whose entries all sit in subgroups be chosen and kept', async () => {
    localStorage.setItem(`flow-last-category:${OWNER}`, 'Продукти');
    renderFlow();
    await waitFor(() => expect(mockConfig.fetchFlowData).toHaveBeenCalled());
    openPicker();
    fireEvent.click(within(picker()).getByText('Дім'));
    fireEvent.click(within(picker()).getByText('Готово'));
    await waitFor(() => expect(screen.queryByTestId('flow-group-picker')).toBeNull());
    expect(screen.getByTestId('flow-entry-group').textContent).toContain('Дім');
    expect(screen.getByTestId('flow-entry-group').textContent).not.toContain('Продукти');
  });

  it('restores the text scale and currency labels from the device on the first render', async () => {
    localStorage.setItem(`flow-text-scale:${OWNER}`, '1.3');
    localStorage.setItem(`flow-display-currency:${OWNER}`, 'eur');
    renderFlow();
    expect(screen.getByTestId('flow-scaled-content').style.zoom).toBe('1.3');
    await waitFor(() => expect(mockConfig.fetchFlowData).toHaveBeenCalled());
    expect(localStorage.getItem(`flow-display-currency:${OWNER}`)).toBe('eur');
  });
});
