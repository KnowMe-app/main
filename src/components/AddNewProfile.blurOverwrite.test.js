import { makeUploadedInfo } from './makeUploadedInfo';

describe('AddNewProfile field-scoped blur overwrite', () => {
  it('overwrites only the field that blurred', () => {
    const existingData = {
      name: 'Remote name',
      phone: '111',
      tags: ['remote'],
    };
    const staleDraft = {
      name: 'Stale local name',
      phone: '222',
      tags: ['local'],
    };

    const uploadedInfo = makeUploadedInfo(existingData, staleDraft, 'tags');

    expect(uploadedInfo.name).toEqual(['Remote name', 'Stale local name']);
    expect(uploadedInfo.phone).toEqual(['111', '222']);
    expect(uploadedInfo.tags).toEqual(['local']);
  });

  it('keeps full overwrite behavior for existing callers', () => {
    const uploadedInfo = makeUploadedInfo(
      { name: 'Old name', phone: '111' },
      { name: 'New name', phone: '222' },
      'overwrite'
    );

    expect(uploadedInfo).toMatchObject({ name: 'New name', phone: '222' });
  });
});
