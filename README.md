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

## Softe Code trên máy tính (từ bản 1.1.0)
- **Menu "Đi tới"** (giữa Xem và Cửa sổ): Softe Code (Cmd/Ctrl + 1), Trò chuyện (Cmd/Ctrl + 2), Tổng quan (Cmd/Ctrl + 3). Đang xem trang tiếng Anh (`/en/...`)
  thì mở bản tiếng Anh. Bấm lúc còn màn chờ thì trang được mở ngay khi màn chờ xong. (Cmd/Ctrl + K để dành cho bảng lệnh của Softe Code trên web.)
- **Lối tắt "Mở Softe Code"**: chuột phải biểu tượng ở Dock (Mac) hoặc ở thanh tác vụ (Windows, danh sách nhảy).
- **Đường dẫn `softe://`** mở app. Chỉ nhận đúng ba dạng (`src/deeplink.js`), mọi thứ khác bị bỏ:
  - `softe://code` → trang Softe Code;
  - `softe://code/<mã phiên>` → một phiên;
  - `softe://code/github?code=…&state=…` → trang nối GitHub (`/code/github/callback`). Cửa sổ app chỉ mở softe.ai, nên đăng nhập GitHub diễn ra ở **trình duyệt của máy**;
    xong việc, trang của softe.ai trong trình duyệt gửi kết quả về app bằng đường dẫn này, và app hoàn tất trong cửa sổ đã đăng nhập.
  Địa chỉ mở ra luôn được dựng lại từ địa chỉ softe.ai của app. Mất mạng lúc đó thì "Thử lại" vẫn mở đúng trang ấy.
- **Gọi bạn khi Softe Code cần bạn**: cửa sổ app đang ở phía sau mà một phiên đợi bạn duyệt / trả lời, hết ngân sách hay bị lỗi
  thì biểu tượng trên thanh tác vụ nháy (Windows) hoặc biểu tượng Dock nảy một lần (Mac). App chỉ đọc tiêu đề của trang (`src/attention.js`), không xin quyền gì thêm.
- **Web nhận ra app máy tính** bằng chuỗi `softe-desktop/<phiên bản>` ở cuối User-Agent (ví dụ `… Electron/33.2.1 Safari/537.36 softe-desktop/1.1.0`).
  Từ 1.1.0 app nhận được `softe://`, nên web chỉ nối GitHub kiểu "trình duyệt → app" với bản từ 1.1.0 trở lên.
- **Thử một đường dẫn** (cần bản đã cài, hoặc `npm start` trên Windows: app tự đăng ký khi mở; trên Mac bản chạy từ mã nguồn không khai `softe://`, hãy dùng bản đã dựng):
  ```bash
  open 'softe://code'                       # Mac
  start softe://code                        # Windows (cmd); đường dẫn có & thì: start "" "softe://code/github?code=x&state=y"
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
- Đường dẫn `softe://` là dữ liệu không đáng tin: chỉ ba dạng, tham số GitHub kiểm như trang web, không bao giờ mở địa chỉ nào ngoài softe.ai.
- Không có khóa bí mật trong repo. Khóa ký số để trong GitHub Secrets.

## Việc còn lại (cần công ty / chủ dự án)
- **Ký số** (đã cài sẵn khung, chỉ cần điền khóa): Windows cần chứng chỉ ký mã; Mac cần tài khoản Apple Developer (chứng chỉ "Developer ID Application" + notarization).
  Chưa ký thì vẫn dựng được, nhưng Windows hiện SmartScreen, Mac chặn mở lần đầu. Có chứng chỉ thì điền GitHub Secrets (tên ở đầu bước dựng trong `.github/workflows/build.yml`):
  `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. Không commit chứng chỉ vào repo.
- **Cập nhật trên Mac**: app tải file `.dmg`, kiểm mã, rồi mở ra để khách kéo vào Applications (cập nhật thầm lặng cần bản đã ký).
- Biểu tượng: `build/icon.png` (logo hoa năm cánh của softe.ai trên nền tối, 1024×1024).
- **Cần thử trên máy thật**: đăng nhập Google / Apple trong cửa sổ app (Google chặn một số cửa sổ nhúng; đăng nhập bằng email vẫn dùng được),
  và thanh toán MegaPay (mở ở trình duyệt, xong quay lại app bấm tải lại).
