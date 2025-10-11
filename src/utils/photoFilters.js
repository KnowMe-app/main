export const isMedicationPhotoUrl = (photoUrl, userId) => {
  if (!photoUrl) {
    return false;
  }

  try {
    const afterObjectSegment = photoUrl.split('/o/')[1];
    if (!afterObjectSegment) {
      return false;
    }
    const [encodedPath] = afterObjectSegment.split('?');
    if (!encodedPath) {
      return false;
    }
    const decodedPath = decodeURIComponent(encodedPath);
    if (userId) {
      return decodedPath.startsWith(`avatar/${userId}/medication/`);
    }
    return decodedPath.includes('/medication/');
  } catch (error) {
    console.error('Failed to parse photo url', error);
    return false;
  }
};

export const filterOutMedicationPhotos = (photoUrls = [], userId) => {
  if (!Array.isArray(photoUrls)) {
    return [];
  }

  return photoUrls.filter(url => !isMedicationPhotoUrl(url, userId));
};

