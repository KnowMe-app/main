import fs from 'fs';
import path from 'path';

describe('AddNewProfile offline load mode', () => {
  const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');
  const offlineSource = fs.readFileSync(path.join(__dirname, 'AddNewProfileOfflineLoad.jsx'), 'utf8');

  it('keeps offline as a separate AddNewProfileOfflineLoad module and component', () => {
    expect(addNewProfileSource).toContain("} from './AddNewProfileOfflineLoad';");
    expect(offlineSource).toContain('export const AddNewProfileOfflineLoadControls');
    expect(offlineSource).toContain("export const OFFLINE_LOAD_MODE = 'offline';");
    expect(addNewProfileSource).toContain('<AddNewProfileOfflineLoadControls');
  });

  it('registers offline as a load sort mode and routes it to a dedicated filter', () => {
    expect(addNewProfileSource).toContain('OFFLINE: OFFLINE_LOAD_MODE');
    expect(addNewProfileSource).toContain('case LOAD_SORT_MODES.OFFLINE:');
    expect(addNewProfileSource).toContain('return OFFLINE_LOAD_FILTER;');
  });

  it('filters local users/newUsers ids before backend hydration and keeps getInTouch order', () => {
    const getIdsBody = offlineSource.slice(
      offlineSource.indexOf('export const getOfflineFilteredIds'),
      offlineSource.indexOf('export const hydrateOfflineIdsPage')
    );

    expect(getIdsBody).toContain('getMergedUsersFromLocalExportCollections()');
    expect(getIdsBody).toContain('filterMain(');
    expect(getIdsBody).toContain('OFFLINE_LOAD_FILTER');
    expect(getIdsBody).toContain('OFFLINE_FILTER_MAIN_OPTIONS');
    expect(offlineSource).toContain('requireCurrentOrPastGetInTouch: true');
    expect(getIdsBody).toContain('left.getInTouch.localeCompare(right.getInTouch)');
  });

  it('hydrates offline cards from backend in pages of at most 20 and stores passed ids in queries', () => {
    const hydrateStart = offlineSource.indexOf('export const hydrateOfflineIdsPage');
    const loaderBody = offlineSource.slice(
      hydrateStart,
      offlineSource.indexOf('};', offlineSource.indexOf('export const loadMoreUsersOffline'))
    );

    expect(offlineSource).toContain('export const OFFLINE_LOAD_BACKEND_PAGE_SIZE = 20');
    expect(loaderBody).toContain('slice(0, OFFLINE_LOAD_BACKEND_PAGE_SIZE)');
    expect(loaderBody).toContain('fetchUsersByIds(pageIds)');
    expect(loaderBody).toContain('filterBackendHydratedOfflineUsers');
    expect(offlineSource).toContain('setIdsForQuery(queryKey, nextPassedIds)');
  });

  it('removes edited offline cards from the query cache and loads the next card', () => {
    const invalidationBody = addNewProfileSource.slice(
      addNewProfileSource.indexOf('const hideOfflineCardAndLoadNext'),
      addNewProfileSource.indexOf('const refillGitAfterGetInTouchChange')
    );

    expect(invalidationBody).toContain('currentFilter !== OFFLINE_LOAD_FILTER');
    expect(invalidationBody).toContain('removeUserIdFromQuery(queryKey, userId)');
    expect(invalidationBody).toContain('loadMoreUsersOffline(filters, {');
    expect(invalidationBody).toContain('forceVisibleUpdate: true');
  });
});
