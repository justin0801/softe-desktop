// Chạy TRONG cửa sổ ẩn bị nhốt (không mạng, không tệp, không Node). Nhận byte của một tệp PDF từ app, trả về chữ hoặc lý do lỗi, rồi app hủy cả cửa sổ.
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const lib = globalThis.softeLocalLib;

globalThis.softeWorker.onJob(async (job) => {
  let result;
  try {
    const bytes = new Uint8Array(job.bytes);
    result = await lib['pdf-text'].extractPdfText(pdfjs, bytes, { deadline: Date.now() + job.budgetMs });
  } catch {
    result = { ok: false, reason: 'failed' };
  }
  globalThis.softeWorker.done(job.id, result);
});
globalThis.softeWorker.ready();
