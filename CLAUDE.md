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
  lỗi mạng khung chính (`did-fail-load`) → trang mất mạng kèm `?n=<số lần liên tiếp>`; trang mất mạng hiện mà không phải do app mở (`did-navigate`, người dùng bấm Tải lại) → thử softe.ai đúng một lần; softe.ai vào được (`did-navigate` tới softe.ai, **không phải** `did-finish-load`: trang lỗi của Chromium cũng phát nó) → hết chuỗi mất mạng.
  **`main.js` không có hẹn giờ nào ngoài kiểm tra cập nhật** (không hẹn giờ cứng khi mở softe.ai, không vòng thử lại): việc tự thử lại lùi dần (10 giây, 20, 40... tối đa 5 phút, chỉ khi máy báo có mạng) nằm trong trang (`retry.js`, số khớp `shell.retryDelay`).
- **Không có Mochi** ở biểu tượng app (vẫn là hoa của logo), menu, hộp thoại cập nhật, trình cài đặt. Công tắc tắt Mochi của máy chủ không tới hai trang này: chỉ gỡ bằng bản app mới.
- **Softe Code trên máy tính** (từ 1.1.0, chủ dự án yêu cầu 15/11/2026): đường dẫn `softe://` là dữ liệu KHÔNG đáng tin (trang web nào cũng gửi được). Chỉ **năm** dạng
  (`src/deeplink.js::parseDeepLink`: `softe://code`, `softe://code/<UUID chữ thường>`, `softe://code/github?…` với đúng sáu tham số và cách kiểm của softe-fe
  `src/lib/code-link.ts::appReturnUrl`, và từ 1.2.0 hai dạng đăng nhập Google / Apple: `softe://welcome/persona?social=<mã 20-100 ký tự>` và
  `softe://welcome?error=access_denied|server_error[&error_description=<chữ thường và _>]`; do trang `/welcome/desktop` của softe-fe tạo ra (`src/lib/desktop-sign-in.ts`; test của web đối chiếu thẳng với `src/deeplink.js` khi hai repo nằm cạnh nhau); địa chỉ mở ra luôn dựng lại từ
  `cfg.site`, không bao giờ lấy từ đường dẫn; thêm dạng mới thì thêm test (`test/deeplink.test.js`).
  macOS: `open-url` nghe ngay từ đầu (trước `ready`); Windows / Linux: dòng lệnh lúc mở (`process.argv`) và `second-instance`. Lần mở thứ hai không mở cửa sổ (whenReady thoát sớm).
- **Một chỗ tải softe.ai** vẫn là `openSite` (`loadURL(nextPage())`): trang để dành `next` (đường dẫn, menu "Đi tới" Cmd/Ctrl + 1/2/3, lối tắt Dock / danh sách nhảy) nếu đúng
  là softe.ai, không thì trang chủ; `next` chỉ hết khi một trang softe.ai thật sự vào được (`did-navigate`), nên mất mạng rồi thử lại vẫn mở đúng trang đó. Cửa sổ còn ở màn
  chờ thì chỉ để dành (`go`). Giữ ngôn ngữ đang xem (`withLanguage`: `/en/...`).
- **Gọi người dùng** (`src/attention.js`): chỉ đọc tiêu đề trang, khớp softe-fe `src/lib/code-title.ts::tabTitle` ("❓ Cần bạn", "⏸ Tạm dừng", "⚠ Lỗi", cả tiếng Anh; test so với tệp
  của web khi có repo bên cạnh); một lần cho mỗi lần chuyển, chỉ khi cửa sổ không được xem; Windows `flashFrame`, Mac `dock.bounce('informational')`. Đúng MỘT bộ nghe
  `page-title-updated` và nó không tải gì. Không IPC, không preload, không quyền thông báo.
- Web nhận ra app bằng `softe-desktop/<x.y.z>` cuối User-Agent (`app.userAgentFallback`, giữ nguyên dạng này); từ 1.1.0 nhận được `softe://code/...`, từ 1.2.0 cả `softe://welcome/...` (đăng nhập
  Google / Apple: web chỉ đi đường này với bản từ 1.2.0, `softe-fe src/lib/desktop-app.ts`). `protocols` của electron-builder khai `softe` cho bản cài.
- **Đồng bộ với web và app điện thoại** (từ 1.2.0, chủ dự án yêu cầu 15/11/2026: "hiển thị và tính năng đồng bộ nhau"):
  - **Link ra ngoài** chỉ `http`, `https`, `mailto`, `tel` (`config.externalOk`: độ dài, không khoảng trắng / ký tự điều khiển; `mailto` chỉ `subject`, `body`, `cc`, `bcc`, người nhận không có `:`, `\`, `<`, `>`, `"`);
    mọi chỗ mở ra ngoài đi qua `external()` trong `main.js` (cửa sổ chính, cửa sổ con và cửa sổ con của nó: `guard()`; menu chuột phải). Không thêm kiểu link mới ở đây mà không có test.
  - **Chữ của app** (menu, hộp cập nhật, lối tắt, menu chuột phải) nằm ở `src/texts.js` (vi + en, cùng khóa; test giữ), ngôn ngữ theo TRANG ĐANG XEM (`texts.languageOf`: `/en/...` của softe.ai là tiếng Anh; trang riêng của app và
    lúc chưa biết gì theo máy). Đổi ngôn ngữ thì dựng lại menu và lối tắt (`refreshLanguage`, chỉ khi đổi). Không thêm chữ về mua bán, giá, credit, khuyến mãi. Chữ Sửa / Xem / Cửa sổ / Sao chép / Dán là vai trò của Electron (tự dịch theo máy): không viết lại.
  - **Menu chuột phải** (`src/context.js`) chỉ dựa vào thông tin lần bấm (`params`), không đọc nội dung trang, không IPC, không preload.
  - **Đăng nhập Google / Apple** chạy ở trình duyệt của máy (web gọi `socialStartUrl(..., 'desktop')`, `will-navigate` đưa địa chỉ ra ngoài). Xong việc máy chủ đưa trình duyệt về **một trang của softe.ai** (`/welcome/desktop?social=<mã>`),
    trang đó mở `softe://welcome/...` (và có nút bấm, vì trình duyệt hay chặn hoặc hỏi lại khi trang tự mở app): máy chủ không bao giờ đưa mã thẳng ra `softe://`. App không giữ bí mật nào: bí mật (`verifier`) nằm trong
    bộ nhớ trang của cửa sổ app (như web), nên mã gửi nhầm tới app khác hay do người lạ gửi tới không đổi được gì. Không thêm cách nhận mã nào khác, không mở trang đăng nhập của Google / Apple trong cửa sổ app (Google chặn cửa sổ nhúng).

- **Trình dựng phim của Studio phim** (từ 1.3.0, chủ dự án yêu cầu 16/11/2026: dùng được cả web, điện thoại và máy tính; `softe-be/docs/studio-phim-dung-phim.md`): chạy hoàn toàn trong cửa sổ web `/studio/film/editor`
  (xem trước, xuất video bằng MediaRecorder; Electron có sẵn H.264 / AAC nên xuất được MP4), app không thêm logic nào. Hai việc của app: (1) menu Sửa dùng vai trò `editMenu` nhưng
  **Hoàn tác / Làm lại không giữ phím tắt** (`EDIT_SUBMENU`, `registerAccelerator: false`): nếu giữ thì Ctrl/Cmd + Z không bao giờ tới trang và timeline không hoàn tác được; (2) menu "Đi tới" có "Dựng phim" (Cmd/Ctrl + 4).
  Test: `test/desktop-links.test.js`, `test/deeplink.test.js`.

- **Quyền của web** chỉ cấp cho softe.ai và chỉ ba thứ: micro (nói chuyện, thu giọng), sao chép (nút "Sao chép"), toàn màn hình (xem trước của trình dựng phim): `config.allowedPermission`, dùng cho cả xin quyền và kiểm quyền. Thông báo, vị trí, đọc clipboard: từ chối (web không dùng). Thêm quyền thì thêm test (`test/permissions.test.js`).
- **Cảnh báo "chưa lưu" của trang** (`beforeunload`: trình dựng phim, trang kết quả, trang xây website đại lý): Electron không hiện gì và âm thầm chặn việc đóng cửa sổ, tải lại, chuyển trang. Mọi cửa sổ (chính và con) nghe `will-prevent-unload` và hỏi "Rời đi / Ở lại" (`askLeave`, mặc định "Ở lại"). Test: `test/leave.test.js`.

## Lệnh
`npm install`, `npm start`, `npm test` (`node --test`; chạy thật `main.js` với Electron giả ở `test/main-harness.js`, không cần cài Electron).
