import { fetchUsersByLastLogin2 } from '../components/config';

const DEFAULT_PAGE_SIZE = 9;

const hasPhoto = user => {
  if (Array.isArray(user.photos)) {
    return user.photos.some(Boolean);
  }
  return Boolean(user.photos);
};

const isEdRole = user => {
  const role = (user.userRole || user.role || '').toString().trim().toLowerCase();
  return role === 'ed';
};

export const fetchEdUsersWithPhotoPage = async (page = 2, pageSize = DEFAULT_PAGE_SIZE) => {
  const limit = page * pageSize;
  const res = await fetchUsersByLastLogin2(limit);
  const filtered = res.users.filter(u => isEdRole(u) && hasPhoto(u));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return filtered.slice(start, end);
};

