// Chạy TRONG cửa sổ ẩn bị nhốt (không mạng, không tệp, không Node). Nhận byte của một tệp PDF từ app, trả về chữ hoặc lý do lỗi, rồi app hủy cả cửa sổ.
// Thứ tự: lớp chữ của PDF trước (nhanh); PDF ảnh quét thì OCR ngay trên máy (tối đa `ocrPages` trang), dài hơn thì để máy chủ làm.
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import Tesseract from './vendor/tesseract/tesseract.esm.min.js';

const { createWorker } = Tesseract;

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const lib = globalThis.softeLocalLib;
const { LIMITS, textLooksOk, ocrScale } = lib.limits;
const { cleanText } = lib.sanitize;

async function ocrPdf(bytes, deadline) {
  const doc = await pdfjs.getDocument({
    data: bytes.slice(), isEvalSupported: false, enableXfa: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false,
    disableAutoFetch: true, disableStream: true, maxImageSize: LIMITS.ocrMaxPixels, verbosity: 0,
  }).promise;
  let worker = null;
  try {
    const pages = doc.numPages;
    if (!Number.isInteger(pages) || pages < 1) return { ok: false, reason: 'failed' };
    if (pages > LIMITS.ocrPages) return { ok: false, reason: 'needs_ocr' }; // dài: máy chủ OCR
    worker = await createWorker(['vie', 'eng'], 1, {
      workerPath: new URL('./vendor/tesseract/worker.min.js', import.meta.url).href,
      corePath: new URL('./vendor/tesseract/tesseract-core-simd-lstm.wasm.js', import.meta.url).href,
      langPath: new URL('./vendor/tesseract/lang', import.meta.url).href,
      workerBlobURL: false, gzip: true, cacheMethod: 'none', logger: () => {},
    });
    console.debug('ocr: bo doc san sang'); // chỉ mốc tiến trình, không bao giờ nội dung
    const parts = [];
    for (let i = 1; i <= pages; i += 1) {
      if (Date.now() > deadline) return { ok: false, reason: 'timeout' };
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: ocrScale(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      console.debug(`ocr: ve xong trang ${i} (${canvas.width}x${canvas.height})`);
      const { data } = await worker.recognize(canvas);
      console.debug(`ocr: doc xong trang ${i}`);
      parts.push(typeof data.text === 'string' ? data.text : '');
      canvas.width = 0; canvas.height = 0; page.cleanup();
    }
    const { text, truncated } = cleanText(parts.join('\n\n'));
    if (!textLooksOk(text, pages)) return { ok: false, reason: 'needs_ocr' };
    return { ok: true, text, pages, truncated };
  } finally {
    try { if (worker) await worker.terminate(); } catch { /* bỏ qua */ }
    try { await doc.destroy(); } catch { /* bỏ qua */ }
  }
}

globalThis.softeWorker.onJob(async (job) => {
  let result;
  try {
    const bytes = new Uint8Array(job.bytes);
    const deadline = Date.now() + job.budgetMs;
    result = await lib['pdf-text'].extractPdfText(pdfjs, bytes, { deadline });
    if (!result.ok && result.reason === 'needs_ocr') result = await ocrPdf(bytes, deadline);
  } catch {
    result = { ok: false, reason: 'failed' };
  }
  globalThis.softeWorker.done(job.id, result);
});
globalThis.softeWorker.ready();
