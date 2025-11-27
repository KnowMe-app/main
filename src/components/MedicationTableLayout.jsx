import React, { useMemo } from 'react';

const BASE_INDEX_COLUMN_WIDTH = 48;
const MIN_INDEX_COLUMN_WIDTH = 40;
const INDEX_COLUMN_HEADER_HORIZONTAL_PADDING = 12; // Th padding: 6px on each side
const INDEX_COLUMN_CELL_HORIZONTAL_PADDING = 8; // Td padding: 4px on each side
const INDEX_COLUMN_MIN_HEADER_HORIZONTAL_PADDING = 8;
const INDEX_COLUMN_MIN_CELL_HORIZONTAL_PADDING = 6;
const DATE_COLUMN_HEADER_HORIZONTAL_PADDING = 12; // Th padding: 6px on each side
const DATE_COLUMN_MIN_HEADER_HORIZONTAL_PADDING = 8;
const DATE_COLUMN_CELL_HORIZONTAL_PADDING = 8; // Td padding: 4px on each side
const DATE_COLUMN_MIN_CELL_HORIZONTAL_PADDING = 6;
const DATE_COLUMN_TEXT_WIDTH = 63; // measured width in pixels of '25.10 пн' in the table font at 14px
const MIN_MEDICATION_COLUMN_WIDTH = 72;
const COMPACT_LAYOUT_START_COLUMNS = 6;
const COMPACT_LAYOUT_FULL_COMPACT_COLUMNS = 12;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const interpolate = (start, end, ratio) => start + (end - start) * ratio;

const MedicationTableLayout = ({ medicationCount, children }) => {
  const compactLayoutRatio = useMemo(() => {
    const span = COMPACT_LAYOUT_FULL_COMPACT_COLUMNS - COMPACT_LAYOUT_START_COLUMNS;
    if (span <= 0) return 0;

    const ratio = (medicationCount - COMPACT_LAYOUT_START_COLUMNS) / span;
    return clamp(ratio);
  }, [medicationCount]);

  const indexHeaderPaddingX = useMemo(
    () =>
      interpolate(
        INDEX_COLUMN_HEADER_HORIZONTAL_PADDING / 2,
        INDEX_COLUMN_MIN_HEADER_HORIZONTAL_PADDING / 2,
        compactLayoutRatio,
      ),
    [compactLayoutRatio],
  );

  const indexCellPaddingX = useMemo(
    () =>
      interpolate(
        INDEX_COLUMN_CELL_HORIZONTAL_PADDING / 2,
        INDEX_COLUMN_MIN_CELL_HORIZONTAL_PADDING / 2,
        compactLayoutRatio,
      ),
    [compactLayoutRatio],
  );

  const dateHeaderPaddingX = useMemo(
    () =>
      interpolate(
        DATE_COLUMN_HEADER_HORIZONTAL_PADDING / 2,
        DATE_COLUMN_MIN_HEADER_HORIZONTAL_PADDING / 2,
        compactLayoutRatio,
      ),
    [compactLayoutRatio],
  );

  const dateCellPaddingX = useMemo(
    () =>
      interpolate(
        DATE_COLUMN_CELL_HORIZONTAL_PADDING / 2,
        DATE_COLUMN_MIN_CELL_HORIZONTAL_PADDING / 2,
        compactLayoutRatio,
      ),
    [compactLayoutRatio],
  );

  const indexColumnWidth = useMemo(
    () => Math.round(interpolate(BASE_INDEX_COLUMN_WIDTH, MIN_INDEX_COLUMN_WIDTH, compactLayoutRatio)),
    [compactLayoutRatio],
  );

  const dateColumnWidth = useMemo(() => {
    const headerWidth = DATE_COLUMN_TEXT_WIDTH + dateHeaderPaddingX * 2;
    const cellWidth = DATE_COLUMN_TEXT_WIDTH + dateCellPaddingX * 2;
    return Math.max(Math.round(headerWidth), Math.round(cellWidth));
  }, [dateCellPaddingX, dateHeaderPaddingX]);

  const indexHeaderStyle = useMemo(
    () => ({
      width: `${indexColumnWidth}px`,
      paddingLeft: `${indexHeaderPaddingX}px`,
      paddingRight: `${indexHeaderPaddingX}px`,
    }),
    [indexColumnWidth, indexHeaderPaddingX],
  );

  const dateHeaderStyle = useMemo(
    () => ({
      minWidth: `${dateColumnWidth}px`,
      width: `${dateColumnWidth}px`,
      paddingLeft: `${dateHeaderPaddingX}px`,
      paddingRight: `${dateHeaderPaddingX}px`,
    }),
    [dateColumnWidth, dateHeaderPaddingX],
  );

  const indexCellStyle = useMemo(
    () => ({
      textAlign: 'center',
      width: `${indexColumnWidth}px`,
      paddingLeft: `${indexCellPaddingX}px`,
      paddingRight: `${indexCellPaddingX}px`,
    }),
    [indexCellPaddingX, indexColumnWidth],
  );

  const dateCellStyle = useMemo(
    () => ({
      minWidth: `${dateColumnWidth}px`,
      width: `${dateColumnWidth}px`,
      paddingLeft: `${dateCellPaddingX}px`,
      paddingRight: `${dateCellPaddingX}px`,
    }),
    [dateCellPaddingX, dateColumnWidth],
  );

  const medicationColumnStyle = useMemo(() => {
    if (!medicationCount) {
      return { minWidth: `${MIN_MEDICATION_COLUMN_WIDTH}px` };
    }

    const widthValue = `calc((100% - ${indexColumnWidth}px - ${dateColumnWidth}px) / ${medicationCount})`;

    return {
      width: widthValue,
      minWidth: `${MIN_MEDICATION_COLUMN_WIDTH}px`,
    };
  }, [dateColumnWidth, indexColumnWidth, medicationCount]);

  return children({
    compactLayoutRatio,
    totalColumns: medicationCount + 2,
    indexHeaderStyle,
    dateHeaderStyle,
    indexCellStyle,
    dateCellStyle,
    medicationColumnStyle,
  });
};

export default MedicationTableLayout;
