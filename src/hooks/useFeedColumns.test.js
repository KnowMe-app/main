import fs from 'fs';
import path from 'path';
import { FEED_WIDE_MIN_WIDTH, FEED_XWIDE_MIN_WIDTH, resolveFeedColumns } from './useFeedColumns';

/**
 * На комп'ютері стрічка — сітка, а не колонка в 480 px посеред екрана.
 */
describe('колонки стрічки за шириною екрана', () => {
  it('дає телефонові читабельну галерею в одну колонку', () => {
    expect(resolveFeedColumns(390)).toEqual({ list: 1, gallery: 1 });
    expect(resolveFeedColumns(599)).toEqual({ list: 1, gallery: 1 });
    expect(resolveFeedColumns(600)).toEqual({ list: 1, gallery: 2 });
    expect(resolveFeedColumns(FEED_WIDE_MIN_WIDTH - 1)).toEqual({ list: 1, gallery: 2 });
  });

  it('ділить ширину комп\'ютера на колонки', () => {
    expect(resolveFeedColumns(FEED_WIDE_MIN_WIDTH)).toEqual({ list: 2, gallery: 3 });
    expect(resolveFeedColumns(1366)).toEqual({ list: 3, gallery: 4 });
    expect(resolveFeedColumns(FEED_XWIDE_MIN_WIDTH)).toEqual({ list: 3, gallery: 4 });
  });

  it('тримає ті самі межі в стилях, що й у розкладці галереї', () => {
    const styled = fs.readFileSync(path.join(__dirname, '../components/Matching.styled.jsx'), 'utf8');
    const list = styled.slice(styled.indexOf('export const FeedList'), styled.indexOf('export const GalleryGrid'));
    expect(list).toContain('FEED_WIDE_MIN_WIDTH}px)');
    expect(list).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(list).toContain('FEED_XWIDE_MIN_WIDTH}px)');
    expect(list).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    const container = styled.slice(styled.indexOf('export const InnerContainer'), styled.indexOf('export const Grid ='));
    expect(container).toContain('max-width: 480px;');
    expect(container).toContain('FEED_WIDE_MIN_WIDTH}px)');
  });
});
