import { estimateGalleryTileHeight, splitIntoBalancedColumns } from '../galleryColumns';

describe('estimateGalleryTileHeight', () => {
  it('плитка з фото важить помітно більше за плитку без нього', () => {
    const withPhoto = estimateGalleryTileHeight({ hasPhoto: true, textLines: 3, hasActions: true });
    const withoutPhoto = estimateGalleryTileHeight({ hasPhoto: false, textLines: 3, hasActions: true });

    expect(withPhoto).toBeGreaterThan(withoutPhoto * 2);
  });

  it('кожен рядок тексту додає висоти', () => {
    expect(estimateGalleryTileHeight({ textLines: 4 }))
      .toBeGreaterThan(estimateGalleryTileHeight({ textLines: 1 }));
  });
});

describe('splitIntoBalancedColumns', () => {
  it('веде плитку в коротшу колонку, а не через одну', () => {
    // Через одну (`index % 2`) висока картка щоразу лягала б у ту саму колонку.
    const items = [
      { id: 'tall-1', h: 10 },
      { id: 'short-1', h: 1 },
      { id: 'short-2', h: 1 },
      { id: 'short-3', h: 1 },
    ];
    const [left, right] = splitIntoBalancedColumns(items, item => item.h);

    expect(left.map(item => item.id)).toEqual(['tall-1']);
    expect(right.map(item => item.id)).toEqual(['short-1', 'short-2', 'short-3']);
  });

  it('не втрачає і не двоїть плиток', () => {
    const items = Array.from({ length: 17 }, (_, index) => ({ id: index, h: (index % 4) + 1 }));
    const columns = splitIntoBalancedColumns(items, item => item.h);
    const flat = columns.flat();

    expect(flat).toHaveLength(items.length);
    expect(new Set(flat.map(item => item.id)).size).toBe(items.length);
  });

  it('зберігає порядок усередині колонки', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ id: index }));
    const columns = splitIntoBalancedColumns(items, () => 1);

    columns.forEach(column => {
      const ids = column.map(item => item.id);
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    });
  });

  it('однакові плитки лягають рівно навпіл', () => {
    const items = Array.from({ length: 8 }, (_, index) => index);
    const [left, right] = splitIntoBalancedColumns(items, () => 1);

    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    // При рівних висотах перша плитка лишається ліворуч.
    expect(left[0]).toBe(0);
    expect(right[0]).toBe(1);
  });
});
