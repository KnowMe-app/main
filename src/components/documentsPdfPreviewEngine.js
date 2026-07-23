// pdf.js glue for the Documents page's PDF-true preview (batch 2026-07-23 B §4): takes the real
// exported-PDF bytes and rasterizes single pages onto a canvas. Kept in its own module - imported
// only dynamically, from the preview component's effects - because pdfjs-dist is an ESM-heavy
// package whose worker URL needs `import.meta`, which must never be parsed by the jest/babel test
// pipeline (the preview never generates under jsdom anyway - see the IntersectionObserver gate in
// DocumentsPdfPreview).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

// The worker must be spawned through webpack's own `new Worker(new URL(...))` compilation, not
// referenced as a plain `new URL(...)` asset (batch 2026-07-23 C §4). The asset route let
// react-scripts' babel pass rewrite the worker file while still emitting it as a raw standalone
// file, leaving `import ... from "/абсолютний/шлях/node_modules/@babel/runtime/..."` build-machine
// paths inside it - the browser then 404s those imports, the module worker never starts, and
// pdf.js's fake-worker fallback dynamically imports the same broken file and fails too ("Setting
// up fake worker failed"), killing every preview on the deployed site. Compiling it as a real
// worker chunk bundles those helpers in, and the chunk URL resolves against the deployed public
// path (the GitHub Pages /main/ sub-path) like any other chunk.
const ensurePdfWorker = () => {
  if (GlobalWorkerOptions.workerPort) return;
  GlobalWorkerOptions.workerPort = new Worker(
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' },
  );
};

export const loadPdfDocument = async data => {
  ensurePdfWorker();
  return getDocument({ data }).promise;
};

// Renders one page at the container's CSS width × devicePixelRatio (spec §4.1), so the preview is
// the exported page's own rasterization at native screen density - not an HTML approximation.
export const renderPdfPageToCanvas = async (pdfDocument, pageNumber, canvas, cssWidth, devicePixelRatio = 1) => {
  const page = await pdfDocument.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = (cssWidth / baseViewport.width) * devicePixelRatio;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
};
