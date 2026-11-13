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

## Bảo mật
- `contextIsolation`, `sandbox`, không `nodeIntegration`; trang web không đụng được vào máy.
- Chỉ `https://softe.ai` (và `www`) mở trong cửa sổ app; link khác mở bằng trình duyệt của máy.
- Địa chỉ máy chủ cố định khi đã đóng gói (không đổi được bằng biến môi trường).
- Tự cập nhật: **không cài file nếu thiếu hoặc sai SHA-256**, link phải là https.
- Chỉ cấp quyền micro (nút nói chuyện); mọi quyền khác bị từ chối.
- Không có khóa bí mật trong repo. Khóa ký số để trong GitHub Secrets.

## Việc còn lại (cần công ty / chủ dự án)
- **Biểu tượng**: đặt `build/icon.png` (1024×1024). Chưa có thì app dùng biểu tượng mặc định của Electron.
- **Ký số**: Windows cần chứng chỉ ký mã; Mac cần tài khoản Apple Developer + notarization. Chưa ký thì Windows hiện SmartScreen, Mac chặn mở lần đầu
  (khách bấm chuột phải > Mở). Có chứng chỉ thì điền Secrets ở `.github/workflows/build.yml`.
- **Cập nhật trên Mac**: app tải file `.dmg`, kiểm mã, rồi mở ra để khách kéo vào Applications (cập nhật thầm lặng cần bản đã ký).
- **Cần thử trên máy thật**: đăng nhập Google / Apple trong cửa sổ app (Google chặn một số cửa sổ nhúng; đăng nhập bằng email vẫn dùng được),
  và thanh toán MegaPay (mở ở trình duyệt, xong quay lại app bấm tải lại).
