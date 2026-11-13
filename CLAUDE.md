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

## Lệnh
`npm install`, `npm start`, `npm test` (`node --test`).
