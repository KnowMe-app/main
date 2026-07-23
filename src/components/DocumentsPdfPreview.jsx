// PDF-true preview under each document (batch 2026-07-23 B §4): runs the exact PDF generation
// pipeline the export button uses (same component, same props, same data - real PDF bytes), then
// rasterizes the pages via pdf.js at container width × devicePixelRatio. Never an HTML/CSS
// approximation - if this differs from the exported file, the preview is wrong, not the file.
// Multiple pages present as a horizontal one-page-per-view carousel (swipe + arrows, a laconic
// "1 / N" counter, no autoplay, no thumbnails); a single page renders with no carousel chrome.
// Regeneration is debounced ~500 ms and the previous render stays visible while a new one is
// prepared - only a subtle updating badge, never a flicker to blank.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaChevronDown, FaChevronLeft, FaChevronRight, FaChevronUp } from 'react-icons/fa';

const PreviewBlock = styled.div.attrs({ className: 'pdf-preview-block' })`
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 6px 8px 8px;
  margin-top: 10px;
  background: rgba(162, 121, 63, 0.025);
`;

const PreviewHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const PreviewTitle = styled.div`
  color: var(--km-muted);
  font-size: 10.5px;
  font-weight: 700;
`;

const PreviewHeadControls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const UpdatingBadge = styled.span`
  color: var(--km-muted);
  font-size: 10px;
  font-weight: 600;
`;

const ChromeButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 5px;
  min-height: 24px;
  min-width: 26px;
  padding: 3px 6px;
  font-size: 10.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.55 : 1)};

  &:hover:not(:disabled) {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

// touch-action pan-y keeps vertical page scrolling native while horizontal swipes drive the
// carousel.
const PageViewport = styled.div`
  margin-top: 6px;
  touch-action: pan-y;

  canvas {
    display: block;
    width: 100%;
    border: 1px solid var(--km-border);
    border-radius: 4px;
    background: #fff;
  }
`;

const CarouselRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 6px;
`;

const PageCounter = styled.span`
  color: var(--km-muted);
  font-size: 10.5px;
  font-weight: 700;
  min-width: 44px;
  text-align: center;
`;

const PreviewHint = styled.div`
  color: var(--km-muted);
  font-size: 11px;
  padding: 8px 0 2px;
`;

const SWIPE_THRESHOLD_PX = 40;
const REGENERATE_DEBOUNCE_MS = 500;

const DocumentsPdfPreview = ({ doc, layout, formatting, clinicLogos }) => {
  // Collapsible like the page's other blocks, default expanded (spec §4.2).
  const [expanded, setExpanded] = useState(true);
  // Lazy: nothing is generated until the block has actually been on screen (spec §4.2). Without
  // IntersectionObserver (jsdom/tests) the preview simply stays un-generated.
  const [visible, setVisible] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  // Bumped when a freshly generated document is ready, so the page-render effect redraws the
  // current page even when pageIndex itself didn't change.
  const [renderedGeneration, setRenderedGeneration] = useState(0);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfDocumentRef = useRef(null);
  const generationRef = useRef(0);
  const touchStartXRef = useRef(null);
  // Read by the debounced generator at fire time, so the payload is always the latest one even
  // though the effect below is keyed only on the cheap signature string.
  const payloadRef = useRef(null);
  payloadRef.current = {
    doc, layout, formatting, clinicLogos,
  };

  // Cheap change signature (spec §4.3: regenerate on any data or formatting change). Logo data
  // URLs can be near a megabyte, so variants participate by name + layout assignment only.
  const signature = useMemo(
    () => JSON.stringify([doc, layout, formatting, (clinicLogos || []).map(variant => `${variant.fileName}:${variant.layout}`)]),
    [doc, layout, formatting, clinicLogos],
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const node = containerRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Release the pdf.js document when the preview unmounts.
  useEffect(() => () => {
    generationRef.current += 1;
    pdfDocumentRef.current?.destroy?.();
    pdfDocumentRef.current = null;
  }, []);

  useEffect(() => {
    if (!expanded || !visible) return undefined;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setUpdating(true);
    const timer = setTimeout(async () => {
      try {
        const payload = payloadRef.current;
        const [{ pdf }, documentsModule, engine] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./DocumentsPdfDocument'),
          import('./documentsPdfPreviewEngine'),
        ]);
        documentsModule.ensureDocumentsPdfFontsRegistered();
        // Exactly the export call (see handleGeneratePdf): one document, the same resolved doc /
        // layout / per-document formatting / clinic logos.
        const blob = await pdf(React.createElement(documentsModule.default, {
          documents: [payload.doc],
          layout: payload.layout,
          formatting: payload.formatting,
          clinicLogos: payload.clinicLogos,
        })).toBlob();
        if (generationRef.current !== generation) return;
        const nextPdfDocument = await engine.loadPdfDocument(await blob.arrayBuffer());
        if (generationRef.current !== generation) {
          nextPdfDocument.destroy?.();
          return;
        }
        // The old document (and its canvas render) stays up until this exact moment - swapping
        // here is what makes regeneration flicker-free.
        pdfDocumentRef.current?.destroy?.();
        pdfDocumentRef.current = nextPdfDocument;
        setPageCount(nextPdfDocument.numPages);
        setPageIndex(previous => Math.min(previous, nextPdfDocument.numPages - 1));
        setError('');
        setRenderedGeneration(generation);
      } catch (previewError) {
        // Never a silent generic failure (batch 2026-07-23 C §4): the full exception goes to the
        // console, and its one-line cause is appended to the on-screen error state - mobile
        // admins have no devtools, so the visible message is the only diagnostic they can report.
        console.error('Unable to build the PDF preview', previewError);
        if (generationRef.current === generation) {
          const cause = `${previewError?.name || 'Error'}: ${previewError?.message || String(previewError)}`;
          setError(`Не вдалося побудувати прев'ю PDF. ${cause}`);
        }
      } finally {
        if (generationRef.current === generation) setUpdating(false);
      }
    }, REGENERATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [signature, expanded, visible]);

  // Draws the current page of the current document onto the one visible canvas.
  useEffect(() => {
    const pdfDocument = pdfDocumentRef.current;
    const canvas = canvasRef.current;
    if (!renderedGeneration || !pdfDocument || !canvas) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const engine = await import('./documentsPdfPreviewEngine');
        if (cancelled) return;
        const cssWidth = containerRef.current?.clientWidth || 600;
        await engine.renderPdfPageToCanvas(
          pdfDocument,
          pageIndex + 1,
          canvas,
          cssWidth,
          (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
        );
      } catch (renderError) {
        if (!cancelled) console.error('Unable to draw the PDF preview page', renderError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [renderedGeneration, pageIndex]);

  const stepPage = delta => setPageIndex(previous => Math.min(Math.max(previous + delta, 0), Math.max(pageCount - 1, 0)));

  const handleTouchStart = event => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = event => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || pageCount < 2) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) stepPage(deltaX < 0 ? 1 : -1);
  };

  return (
    <PreviewBlock ref={containerRef}>
      <PreviewHead>
        <PreviewTitle>PDF preview</PreviewTitle>
        <PreviewHeadControls>
          {updating ? <UpdatingBadge>Оновлення…</UpdatingBadge> : null}
          <ChromeButton
            type="button"
            onClick={() => setExpanded(previous => !previous)}
            title={expanded ? 'Collapse the PDF preview' : 'Expand the PDF preview'}
          >
            {expanded ? <FaChevronUp /> : <FaChevronDown />}
          </ChromeButton>
        </PreviewHeadControls>
      </PreviewHead>
      {expanded ? (
        <>
          {error ? <PreviewHint>{error}</PreviewHint> : null}
          {!error && !pageCount ? (
            <PreviewHint>{visible ? 'Прев\'ю генерується…' : 'Прев\'ю згенерується, щойно блок буде видно.'}</PreviewHint>
          ) : null}
          <PageViewport
            style={pageCount ? undefined : { display: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <canvas ref={canvasRef} aria-label="Прев'ю сторінки PDF" />
          </PageViewport>
          {pageCount > 1 ? (
            <CarouselRow>
              <ChromeButton type="button" onClick={() => stepPage(-1)} disabled={pageIndex === 0} title="Попередня сторінка">
                <FaChevronLeft />
              </ChromeButton>
              <PageCounter>{`${pageIndex + 1} / ${pageCount}`}</PageCounter>
              <ChromeButton type="button" onClick={() => stepPage(1)} disabled={pageIndex === pageCount - 1} title="Наступна сторінка">
                <FaChevronRight />
              </ChromeButton>
            </CarouselRow>
          ) : null}
        </>
      ) : null}
    </PreviewBlock>
  );
};

export default DocumentsPdfPreview;
