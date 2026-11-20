# softe-desktop

App **Softe cho Mac và Windows**: một cửa sổ riêng mở https://softe.ai, có biểu tượng, menu và tự cập nhật.
Không có logic nghiệp vụ ở đây: đăng nhập, chat, thanh toán đều là trang web. Backend: repo `softe-be`, `docs/ung-dung-may-tinh.md`.

## Chạy thử trên máy lập trình
```bash
npm install
npm start                                  # mở softe.ai
SOFTE_URL=https://staging.softe.ai SOFTE_API=https://staging-api.softe.ai/v1 npm start   # thử trên staging (chỉ bản chưa đóng gói)
npm test
```

## Phát hành một bản mới
1. Sửa `version` trong `package.json` (ví dụ `1.1.0`), gộp vào `main`.
2. Gắn thẻ: `git tag v1.1.0 && git push origin v1.1.0`. GitHub Actions dựng `.dmg` (Mac Intel + Apple Silicon) và `.exe` (Windows).
3. Vào kết quả chạy: tải file ở mục Artifacts, đưa lên nơi chứa file công khai (VD `downloads.softe.ai`).
   Mục Summary có **SHA-256 và dung lượng** của từng file.
4. Vào trang quản trị softe.ai (`PUT /admin/desktop-app`): nhập số phiên bản, link, SHA-256, dung lượng. Từ lúc này trang tải về hiện bản mới
   và app cũ tự báo cập nhật (hỏi mỗi 4 giờ và khi mở app).

## Tính năng giống bản web
- **Đăng nhập Google / Apple** (từ 1.2.0): Google và Apple không cho đăng nhập trong cửa sổ nhúng, nên mở ở trình duyệt của máy, xong trình duyệt gọi lại app bằng link `softe://` và app hoàn tất đăng nhập trong cửa sổ của nó (`src/deeplink.js`).
- **Nối GitHub cho Softe Code** (từ 1.1.0): cùng cách, link `softe://code/github?...`.
- **Link `softe://`**: chỉ nhận đúng 3 dạng, đúng tham số và giới hạn như web gửi; link lạ bị bỏ. Chỉ mở trang softe.ai trong cửa sổ app.
- **Softe Code gọi bạn**: tiêu đề tab có ❓ ⚠ ⏸ mà cửa sổ không ở phía trước thì biểu tượng nhấp nháy (Windows) hoặc nảy (Mac) (`src/attention.js`).
- Thanh toán MegaPay mở ở trình duyệt của máy (web lo phần chờ và tự cập nhật gói khi quay lại).
- Menu chuột phải (sao chép, dán, lưu ảnh…), sao chép-dán, toàn màn hình, thông báo, Quay lại / Tiến tới, tải file xong thì mở thư mục chứa file.
- Màn chờ và trang mất mạng có Mochi (`src/pages`, hình ở `src/mochi`, chép bằng `tools/sync_mascot.py desktop` của repo `softe-be`; không sửa tay).
- Mọi tính năng khác (chat, Studio, tệp, gói…) là trang web chạy trong cửa sổ, nên có ngay khi web cập nhật.
- **Dựng phim** (từ 1.3.0): chạy trong cửa sổ web. Menu Sửa không giữ phím Hoàn tác / Làm lại (để Cmd/Ctrl+Z tới trình dựng); menu "Đi tới" có Trò chuyện, Tạo, Tệp, Dựng phim (Cmd/Ctrl + 1 đến 4) (`src/menu.js`). Xuất MP4 dùng H.264/AAC có sẵn của Electron; thu giọng dùng quyền micro.
- Hàng loạt video (batch): chưa đụng tới, do phiên khác phụ trách.

## Bảo mật
- `contextIsolation`, `sandbox`, không `nodeIntegration`; trang web không đụng được vào máy.
- Chỉ `https://softe.ai` (và `www`) mở trong cửa sổ app; link khác mở bằng trình duyệt của máy.
- Địa chỉ máy chủ cố định khi đã đóng gói (không đổi được bằng biến môi trường).
- Tự cập nhật: **không cài file nếu thiếu hoặc sai SHA-256**, link phải là https.
- Chỉ cấp cho softe.ai: micro/camera, sao chép-dán, toàn màn hình, thông báo; mọi quyền khác bị từ chối.
- Không có khóa bí mật trong repo. Khóa ký số để trong GitHub Secrets.

## Việc còn lại (cần công ty / chủ dự án)
- **Ký số** (đã cài sẵn khung, chỉ cần điền khóa): Windows cần chứng chỉ ký mã; Mac cần tài khoản Apple Developer (chứng chỉ "Developer ID Application" + notarization).
  Chưa ký thì vẫn dựng được, nhưng Windows hiện SmartScreen, Mac chặn mở lần đầu. Có chứng chỉ thì điền GitHub Secrets (tên ở đầu bước dựng trong `.github/workflows/build.yml`):
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. Không commit chứng chỉ vào repo.
- **Cập nhật trên Mac**: app tải file `.dmg`, kiểm mã, rồi mở ra để khách kéo vào Applications (cập nhật thầm lặng cần bản đã ký).
- Biểu tượng: `build/icon.png` (logo hoa năm cánh của softe.ai trên nền tối, 1024×1024).
- **Cần thử trên máy thật** (chưa thử): đăng nhập Google / Apple và nối GitHub (trình duyệt gọi lại app bằng `softe://`, cần bản đã cài, không chạy từ `npm start` trên Windows nếu chưa đăng ký),
  thanh toán MegaPay, nhấp nháy khi Softe Code cần bạn.
