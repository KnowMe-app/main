export const convertDriveLinkToImage = link => {
  if (typeof link !== 'string') return null;

  try {
    const url = new URL(link);

    if (url.hostname.includes('drive.google.com')) {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
      const fileId = fileMatch ? fileMatch[1] : url.searchParams.get('id');

      return fileId
        ? `https://drive.google.com/uc?export=view&id=${fileId}`
        : link;
    }

    return link;
  } catch (e) {
    return link;
  }
};
