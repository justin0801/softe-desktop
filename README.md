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

## Màn chờ và trang mất mạng (Mochi)
App có hai trang riêng, là tệp tĩnh trong `src/pages/`, có Mochi (bạn đồng hành nhỏ của softe.ai, không phải logo, không phải trợ lý AI):
- **Màn chờ** (`splash.html`): hiện ngay lúc mở app, trước khi softe.ai về. Mochi đang tải và dòng "Đang mở Softe…". Trang web thật vào là màn chờ biến mất.
  Màn chờ tải xong lần nào là app gọi softe.ai lần đó, nên bấm Tải lại (F5, Ctrl/Cmd+R) lúc còn chờ cũng không bị kẹt.
- **Trang mất mạng** (`offline.vi.html`, `offline.en.html`): hiện khi không kết nối được softe.ai. Mochi, câu thân thiện, nút "Thử lại".
  Tự thử lại khi máy báo có mạng trở lại. Nếu máy báo đã có mạng mà vẫn chưa vào được softe.ai thì trang tự thử lại sau 10 giây, rồi 20, 40... tối đa 5 phút
  (số lần mất mạng liên tiếp đi vào trang bằng `?n=`, hết khi softe.ai vào được). Bấm Tải lại (F5, Ctrl/Cmd+R, menu Xem) ở trang này cũng là thử lại, mỗi lần bấm đúng một lượt.
  Lỗi của máy chủ (5xx) là trang của softe.ai nên không đụng tới.
- Ngôn ngữ theo máy: bắt đầu bằng "vi" thì tiếng Việt, còn lại tiếng Anh. Hình động chạy 20 giây rồi đổi sang ảnh đứng yên; máy bật giảm chuyển động thì chỉ có ảnh đứng yên.
- Hình Mochi (`src/mochi/`) do công cụ của `softe-be` chép: `python3 tools/sync_mascot.py desktop ../softe-desktop` (thêm `--check` để kiểm tra). Không chép tay, không sửa tay.
- **Công tắc tắt Mochi của máy chủ KHÔNG tới được hai trang này.** Chúng là tệp tĩnh trong app, và lúc mất mạng thì không hỏi được máy chủ.
  Muốn gỡ Mochi khỏi chúng phải ra **bản app mới**. Mochi trong cửa sổ web (chat, trang chủ...) vẫn theo công tắc của web.
- Mã: `src/shell.js` (phần thuần), `src/main.js` (nối dây, không hẹn giờ nào ngoài kiểm tra cập nhật), `src/pages/retry.js` (hẹn giờ thử lại nằm trong trang). Test: `test/shell.test.js` (có bài chạy thử `main.js` với Electron giả). Luật đầy đủ: `softe-be/docs/linh-vat-mochi.md` mục 3.2b.

## Phát hành một bản mới
1. Sửa `version` trong `package.json` (ví dụ `1.1.0`), gộp vào `main`.
2. Gắn thẻ: `git tag v1.1.0 && git push origin v1.1.0`. GitHub Actions dựng `.dmg` (Mac Intel + Apple Silicon) và `.exe` (Windows).
3. Vào kết quả chạy: tải file ở mục Artifacts, đưa lên nơi chứa file công khai (VD `downloads.softe.ai`).
   Mục Summary có **SHA-256 và dung lượng** của từng file.
4. Vào trang quản trị softe.ai (`PUT /admin/desktop-app`): nhập số phiên bản, link, SHA-256, dung lượng. Từ lúc này trang tải về hiện bản mới
   và app cũ tự báo cập nhật (hỏi mỗi 4 giờ và khi mở app).

## Bảo mật
- `contextIsolation`, `sandbox`, không `nodeIntegration`; trang web không đụng được vào máy.
- Chỉ `https://softe.ai` (và `www`) mở trong cửa sổ app; link khác mở bằng trình duyệt của máy.
- Địa chỉ máy chủ cố định khi đã đóng gói (không đổi được bằng biến môi trường).
- Tự cập nhật: **không cài file nếu thiếu hoặc sai SHA-256**, link phải là https.
- Chỉ cấp quyền micro (nút nói chuyện); mọi quyền khác bị từ chối.
- Không có khóa bí mật trong repo. Khóa ký số để trong GitHub Secrets.

## Việc còn lại (cần công ty / chủ dự án)
- **Ký số** (đã cài sẵn khung, chỉ cần điền khóa): Windows cần chứng chỉ ký mã; Mac cần tài khoản Apple Developer (chứng chỉ "Developer ID Application" + notarization).
  Chưa ký thì vẫn dựng được, nhưng Windows hiện SmartScreen, Mac chặn mở lần đầu. Có chứng chỉ thì điền GitHub Secrets (tên ở đầu bước dựng trong `.github/workflows/build.yml`):
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. Không commit chứng chỉ vào repo.
- **Cập nhật trên Mac**: app tải file `.dmg`, kiểm mã, rồi mở ra để khách kéo vào Applications (cập nhật thầm lặng cần bản đã ký).
- Biểu tượng: `build/icon.png` (logo hoa năm cánh của softe.ai trên nền tối, 1024×1024).
- **Cần thử trên máy thật**: đăng nhập Google / Apple trong cửa sổ app (Google chặn một số cửa sổ nhúng; đăng nhập bằng email vẫn dùng được),
  và thanh toán MegaPay (mở ở trình duyệt, xong quay lại app bấm tải lại).
