import { convertDriveLinkToImage } from '../convertDriveLinkToImage';

describe('convertDriveLinkToImage', () => {
  it('returns same link for Firestore URLs', () => {
    const link = 'https://firebasestorage.googleapis.com/v0/b/app/o/file.jpg?alt=media';
    expect(convertDriveLinkToImage(link)).toBe(link);
  });

  it('converts Google Drive links to direct image URLs', () => {
    const link = 'https://drive.google.com/file/d/ABC123/view?usp=sharing';
    const result = convertDriveLinkToImage(link);
    expect(result).toBe('https://drive.google.com/uc?export=view&id=ABC123');
  });

  it('returns same link for non-Drive URLs', () => {
    const link = 'https://example.com/photo.jpg';
    expect(convertDriveLinkToImage(link)).toBe(link);
  });
});
