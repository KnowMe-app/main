// A cheap, dependency-free "does this look right at a glance" preview: small A4-shaped mock-ups
// of the pages @react-pdf/renderer will produce, built from the exact same resolved rows the real
// PDF documents render (InvoicePdfDocument / ExpectedExpensesPdfDocument). It's not a pixel-exact
// rasterization of the generated PDF (that would need a PDF-reading library, not just the
// PDF-writing one this app already ships) - it's a fast layout sanity check so an admin can catch
// an overlong name, a missing row, or a lopsided total before spending time generating the real
// file.

import React from 'react';
import styled from 'styled-components';
import { PDF_COLOR } from './pdfTheme';

const MAX_PREVIEW_ROWS = 9;

const Strip = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 10px;
`;

const Page = styled.div`
  flex: 0 0 auto;
  width: 132px;
  aspect-ratio: 210 / 297;
  background: ${PDF_COLOR.white};
  border: 1px solid var(--km-border);
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  padding: 7px 6px;
  display: flex;
  flex-direction: column;
  font-size: 5px;
  line-height: 1.35;
  color: ${PDF_COLOR.ink};
  position: relative;
`;

const PageNumber = styled.span`
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 6px;
  font-weight: 700;
  color: var(--km-muted);
`;

const PageBadge = styled.span`
  align-self: flex-start;
  font-size: 4.5px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: ${PDF_COLOR.accent};
  background: ${PDF_COLOR.headBg};
  border-radius: 999px;
  padding: 1.5px 4px;
  margin-bottom: 3px;
`;

const PageTitle = styled.div`
  font-weight: 800;
  font-size: 6px;
  color: ${PDF_COLOR.ink};
  margin-bottom: 1px;
`;

const PageSubtitle = styled.div`
  font-size: 4.8px;
  color: ${PDF_COLOR.muted};
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowsBox = styled.div`
  flex: 1 1 auto;
  border: 0.5px solid ${PDF_COLOR.line};
  border-radius: 2px;
  overflow: hidden;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 3px;
  padding: 1.6px 3px;
  background: ${({ $alt }) => ($alt ? PDF_COLOR.rowAlt : 'transparent')};
  border-top: 0.5px solid ${PDF_COLOR.line};

  &:first-child {
    border-top: none;
  }
`;

const RowName = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowPrice = styled.span`
  flex: 0 0 auto;
  font-weight: 700;
`;

const MoreRow = styled(Row)`
  color: var(--km-muted);
  font-style: italic;
`;

const TotalsBox = styled.div`
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 1.5px;
`;

const TotalLine = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 4.8px;
  color: var(--km-muted);
`;

const DueLine = styled(TotalLine)`
  font-weight: 800;
  font-size: 5.6px;
  color: ${PDF_COLOR.accentStrong};
  background: ${PDF_COLOR.totalBg};
  border-radius: 2px;
  padding: 2px 3px;
  margin-top: 1px;
`;

const EmptyState = styled.div`
  font-size: 11px;
  color: var(--km-muted);
  padding: 6px 2px;
`;

const formatThumbPrice = row => {
  if (row?.priceLabel) return row.priceLabel;
  const amount = Number(row?.price);
  return Number.isFinite(amount) ? Math.round(amount) : '-';
};

const formatThumbTotal = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `€${amount.toFixed(2)}` : '€-';
};

// pages: [{ key, label, subtitle?, badge?, rows: [{name, price, priceLabel}], subtotal, taxPercent, total }]
const PdfPagePreviewStrip = ({ title, emptyMessage, pages }) => {
  const safePages = Array.isArray(pages) ? pages : [];
  return (
    <div>
      {title ? <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--km-muted)' }}>{title}</div> : null}
      {safePages.length ? (
        <Strip>
          {safePages.map((page, index) => {
            const rows = Array.isArray(page.rows) ? page.rows : [];
            const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);
            const hiddenCount = rows.length - visibleRows.length;
            return (
              <Page key={page.key || index}>
                <PageNumber>{index + 1}/{safePages.length}</PageNumber>
                {page.badge ? <PageBadge>{page.badge}</PageBadge> : null}
                <PageTitle>{page.label || `Page ${index + 1}`}</PageTitle>
                {page.subtitle ? <PageSubtitle>{page.subtitle}</PageSubtitle> : null}
                <RowsBox>
                  {visibleRows.map((row, rowIndex) => (
                    <Row key={row.key || rowIndex} $alt={Boolean(rowIndex % 2)}>
                      <RowName>{row.name || 'Service'}</RowName>
                      <RowPrice>{formatThumbPrice(row)}</RowPrice>
                    </Row>
                  ))}
                  {hiddenCount > 0 ? <MoreRow><RowName>+{hiddenCount} more</RowName></MoreRow> : null}
                  {!rows.length ? <Row><RowName>No services yet</RowName></Row> : null}
                </RowsBox>
                <TotalsBox>
                  <TotalLine><span>Subtotal</span><span>{formatThumbTotal(page.subtotal)}</span></TotalLine>
                  <TotalLine><span>Tax</span><span>{Number(page.taxPercent) || 0}%</span></TotalLine>
                  <DueLine><span>Due</span><span>{formatThumbTotal(page.total)}</span></DueLine>
                </TotalsBox>
              </Page>
            );
          })}
        </Strip>
      ) : (
        <EmptyState>{emptyMessage || 'Nothing to preview yet.'}</EmptyState>
      )}
    </div>
  );
};

export default PdfPagePreviewStrip;
