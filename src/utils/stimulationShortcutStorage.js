import {
  addCardToList,
  removeCardFromList,
  getCardsByList,
} from './cardsStorage';
import { getIdsByQuery, setIdsForQuery } from './cardIndex';

export const STIMULATION_SHORTCUT_LIST_KEY = 'stimulation-shortcuts';

export const getStoredStimulationShortcutIds = () =>
  getIdsByQuery(STIMULATION_SHORTCUT_LIST_KEY);

export const setStoredStimulationShortcutIds = ids => {
  if (!Array.isArray(ids)) {
    setIdsForQuery(STIMULATION_SHORTCUT_LIST_KEY, []);
    return;
  }
  const uniqueIds = Array.from(new Set(ids.filter(Boolean).map(String)));
  setIdsForQuery(STIMULATION_SHORTCUT_LIST_KEY, uniqueIds);
};

export const addStoredStimulationShortcutId = id => {
  if (!id) return;
  addCardToList(String(id), STIMULATION_SHORTCUT_LIST_KEY);
};

export const removeStoredStimulationShortcutId = id => {
  if (!id) return;
  removeCardFromList(String(id), STIMULATION_SHORTCUT_LIST_KEY);
};

export const getStimulationShortcutCards = remoteFetch =>
  getCardsByList(STIMULATION_SHORTCUT_LIST_KEY, remoteFetch);
