pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const DEFAULT_FILE = "assets/docs/agenda.pdf";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const params = new URLSearchParams(window.location.search);
const fileParam = params.get("file") || DEFAULT_FILE;

// Resolve relative URL correctly
const pdfUrl = new URL(fileParam, window.location.href).href;

const canvas = document.getElementById("pdf-canvas");
const context = canvas.getContext("2d");

const viewerCard = document.getElementById("viewer-card");
const statusEl = document.getElementById("status");
const fileNameEl = document.getElementById("file-name");
const pageNumberEl = document.getElementById("page-number");
const totalPagesEl = document.getElementById("total-pages");
const zoomLabelEl = document.getElementById("zoom-label");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const zoomOutButton = document.getElementById("zoom-out");
const zoomInButton = document.getElementById("zoom-in");
const resetZoomButton = document.getElementById("reset-zoom");
const downloadLink = document.getElementById("download-pdf");

let pdfDoc = null;
let currentPage = 1;
let zoomLevel = 1;
let isRendering = false;
let pendingPage = null;
let resizeTimer = null;

function getFileName(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "document.pdf");
  } catch {
    return "document.pdf";
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.dataset.state = isError ? "error" : "info";
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.dataset.state = "";
}

function updateControls() {
  const noPdf = !pdfDoc;

  prevButton.disabled = noPdf || currentPage <= 1 || isRendering;
  nextButton.disabled = noPdf || currentPage >= (pdfDoc?.numPages || 0) ||
    isRendering;
  zoomOutButton.disabled = noPdf || zoomLevel <= MIN_ZOOM || isRendering;
  zoomInButton.disabled = noPdf || zoomLevel >= MAX_ZOOM || isRendering;
  resetZoomButton.disabled = noPdf || isRendering;

  pageNumberEl.textContent = String(currentPage);
  totalPagesEl.textContent = pdfDoc ? String(pdfDoc.numPages) : "0";
  zoomLabelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
}

function getScaleForPage(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(viewerCard.clientWidth - 32, 320);
  const fitWidthScale = availableWidth / baseViewport.width;
  return fitWidthScale * zoomLevel;
}

async function renderPage(pageNumber) {
  if (!pdfDoc) {
    return;
  }

  isRendering = true;
  updateControls();
  setStatus("Rendering page...");

  try {
    const page = await pdfDoc.getPage(pageNumber);
    const scale = getScaleForPage(page);
    const viewport = page.getViewport({ scale });

    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const renderContext = {
      canvasContext: context,
      viewport,
      transform:
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
    };

    await page.render(renderContext).promise;

    currentPage = pageNumber;
    clearStatus();
  } catch (error) {
    console.error("Render error:", error);
    setStatus(`Could not render this PDF page: ${error.message}`, true);
  } finally {
    isRendering = false;
    updateControls();

    if (pendingPage !== null) {
      const nextPageToRender = pendingPage;
      pendingPage = null;
      renderPage(nextPageToRender);
    }
  }
}

function queueRenderPage(pageNumber) {
  if (isRendering) {
    pendingPage = pageNumber;
    return;
  }

  renderPage(pageNumber);
}

async function loadPdf() {
  try {
    setStatus("Loading PDF...");
    fileNameEl.textContent = getFileName(pdfUrl);
    document.title = `${getFileName(pdfUrl)} - PDF Viewer`;
    downloadLink.href = pdfUrl;

    console.log("Trying to load PDF from:", pdfUrl);

    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      withCredentials: false,
    });

    pdfDoc = await loadingTask.promise;

    updateControls();
    await renderPage(currentPage);
  } catch (error) {
    console.error("Load error:", error);
    setStatus(`Could not load the PDF file: ${error.message}`, true);
  }
}

prevButton.addEventListener("click", () => {
  if (currentPage > 1) {
    queueRenderPage(currentPage - 1);
  }
});

nextButton.addEventListener("click", () => {
  if (pdfDoc && currentPage < pdfDoc.numPages) {
    queueRenderPage(currentPage + 1);
  }
});

zoomOutButton.addEventListener("click", () => {
  zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);
  queueRenderPage(currentPage);
});

zoomInButton.addEventListener("click", () => {
  zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
  queueRenderPage(currentPage);
});

resetZoomButton.addEventListener("click", () => {
  zoomLevel = 1;
  queueRenderPage(currentPage);
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    if (pdfDoc) {
      queueRenderPage(currentPage);
    }
  }, 150);
});

updateControls();
loadPdf();