import { fetchUsersByDefaultGetInTouchPaged } from './config';

// GITnew використовує спільний bucket-first loader: він читає лише невеликі
// searchKey/getInTouch-сторінки від сьогодні назад і не викачує всі candidateId наперед.
export const fetchUsersBySearchKeyGitNewPaged = ({ debug = null, ...options } = {}) =>
  fetchUsersByDefaultGetInTouchPaged({
    ...options,
    debug: typeof debug === 'function'
      ? (step, payload) => debug(`fetchUsersBySearchKeyGitNewPaged:${step}`, payload)
      : null,
  });
