// Loads the agency identity record (budget/technical/agency) into pdfTheme's shared config store,
// for export paths that don't otherwise load the budget catalog (the SM profile PDF). Pages that
// already fetch budget/technical (Budget, Invoice Builder) push the same record into the store
// directly via setPdfAgencyConfig at load time instead of re-fetching it here.
import { get, ref } from 'firebase/database';
import { database } from './config';
import { setPdfAgencyConfig } from './pdfTheme';

let loadPromise = null;

export const ensurePdfAgencyConfigLoaded = () => {
  if (!loadPromise) {
    loadPromise = get(ref(database, 'budget/technical/agency'))
      .then(snapshot => {
        if (snapshot.exists()) setPdfAgencyConfig(snapshot.val());
      })
      .catch(loadError => {
        // The document still renders with pdfTheme's built-in fallback identity; retry next time.
        console.error('Unable to load agency config for PDF branding', loadError);
        loadPromise = null;
      });
  }
  return loadPromise;
};
