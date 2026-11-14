# softe-desktop

App bọc web (Electron) của softe.ai cho Mac và Windows. Backend: `softe-be` (`docs/ung-dung-may-tinh.md`, API `/v1/app/desktop/*`).
**Chủ dự án không phải lập trình viên**: báo cáo và mô tả Pull Request bằng tiếng Việt, câu ngắn, dễ hiểu.

## Quy tắc không được phá vỡ
- Không commit khóa bí mật hay chứng chỉ ký (`.p12`, `.pfx`) — chỉ GitHub Secrets.
- Không đặt logic nghiệp vụ, giá, thanh toán trong app: chỉ cửa sổ mở softe.ai. App không bán gì, không có khuyến mãi riêng.
- Giữ `contextIsolation`, `sandbox`, không `nodeIntegration`; chỉ `softe.ai` mở trong cửa sổ (`src/config.js::allowedHost`).
- Tự cập nhật **không bao giờ cài file thiếu hoặc sai SHA-256** (`src/updater.js`). Đổi phần này phải có test.
- Header `X-Softe-Client`: `desktop-mac` / `desktop-win` (backend không coi là bản store).
- Pull Request nhắm vào `main`; không tự gộp.
- **Mochi chỉ ở hai trang của app** (`src/pages/`: màn chờ, trang mất mạng; luật: `softe-be/docs/linh-vat-mochi.md` mục 3.2b). Mochi là `<img alt="" aria-hidden="true">`:
  không bấm được (không onclick / tabindex, không nằm trong `<a>` / `<button>`; "Thử lại" là nút riêng), tối đa MỘT Mochi cử động mỗi trang, sau 20 giây đổi sang ảnh đứng yên (`calm.js`).
  Chữ có đủ tiếng Việt và tiếng Anh, câu ngắn, không chữ Trung, không tên nhà cung cấp AI, không từ về mua bán / credit / gói / khuyến mãi, không nói Mochi là trợ lý AI.
- **Hình Mochi do công cụ chép** (`python3 tools/sync_mascot.py desktop ../softe-desktop` ở `softe-be`: `src/mochi/*.svg` + `MOCHI_KIT.json`): không chép tay, không sửa tay (test băm lại từng tệp).
- **Hai trang cục bộ có CSP nghiêm** (`default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'`): không tải gì từ mạng, không `http(s)://`, không mã nội tuyến. "Thử lại" là `#retry` trong trang
  (main nghe `did-navigate-in-page`, `shell.isRetry`); không thêm API, IPC hay `preload` cho trang. `preload.js`, `allowedHost`, `will-navigate`, `X-Softe-Client`, `updater.js` giữ nguyên. Phần thuần ở `src/shell.js`, test `test/shell.test.js`.
- **Cách main nối dây hai trang** (đừng thêm bộ nghe thứ hai cho cùng một sự kiện: dễ thành vòng lặp thử lại): màn chờ tải xong (`did-finish-load`, địa chỉ màn chờ) → `loadURL(softe.ai)`, mỗi lần, kể cả sau khi người dùng bấm Tải lại;
  lỗi mạng khung chính (`did-fail-load`) → trang mất mạng kèm `?n=<số lần liên tiếp>`; trang mất mạng hiện mà không phải do app mở (`did-navigate`, người dùng bấm Tải lại) → thử softe.ai đúng một lần.
  **`main.js` không có hẹn giờ nào ngoài kiểm tra cập nhật** (không hẹn giờ cứng khi mở softe.ai, không vòng thử lại): việc tự thử lại lùi dần (10 giây, 20, 40... tối đa 5 phút, chỉ khi máy báo có mạng) nằm trong trang (`retry.js`, số khớp `shell.retryDelay`).
- **Không có Mochi** ở biểu tượng app (vẫn là hoa của logo), menu, hộp thoại cập nhật, trình cài đặt. Công tắc tắt Mochi của máy chủ không tới hai trang này: chỉ gỡ bằng bản app mới.

## Lệnh
`npm install`, `npm start`, `npm test` (`node --test`).
