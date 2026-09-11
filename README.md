# Scam Game — Ba màn hình

Game mô phỏng điện thoại bằng tiếng Việt về nhận diện lừa đảo trực tuyến. Chọn Bà Hạnh, An hoặc Bảo; khám phá tin nhắn, hồ sơ liên hệ, trang mô phỏng và ngân hàng. Hai nhân vật còn lại xuất hiện trong mỗi tuyến truyện.

## Công nghệ

TypeScript, React 19, Vinext/Vite, Tailwind CSS. Gemini qua Firebase AI Logic ở trình duyệt với GoogleAIBackend và App Check. Game engine quản lý diễn biến, giao dịch mô phỏng và kết quả; AI viết lời thoại theo phạm vi nhân vật. Tiến trình lưu riêng trên trình duyệt.

## Chạy trên máy

Cài Node.js 22.13 trở lên (khuyến nghị Node.js 24):

```bash
git clone https://github.com/ph1s-jsh/scam-game.git
cd scam-game
npm ci
npm run dev
```

Mở địa chỉ localhost do lệnh in ra, thường là http://localhost:3000.

```bash
npm run build
```

Bản build nhắm tới Cloudflare Workers, không phải HTML tĩnh để đưa trực tiếp lên GitHub Pages. Upload mã nguồn không tự triển khai website hoặc chuyển tài khoản Firebase.

## Firebase riêng của người sử dụng

Cấu hình web Firebase trong `lib/firebase-ai.ts` thuộc bản gốc, không đảm bảo cho phép origin của người khác. Để dùng độc lập:

1. Tạo Firebase project và đăng ký Web App của bạn.
2. Thiết lập Gemini Developer API trong Firebase AI Logic. Code dùng `GoogleAIBackend`, không dùng Vertex AI.
3. Thay `firebaseConfig` trong `lib/firebase-ai.ts` bằng cấu hình Web App của bạn.
4. Đăng ký App Check với reCAPTCHA Enterprise. Thay site key truyền cho `ReCaptchaEnterpriseProvider` và cấu hình domain website của bạn.
5. Cập nhật `FIREBASE_APP_CHECK_CONSOLE_URL` sang project/app của bạn. Khi chạy localhost, đăng ký debug token mà giao diện hỗ trợ kết nối cung cấp trong App Check của project đó. Không commit debug token.
6. Kiểm tra API restrictions và website restrictions của web API key cho Firebase AI Logic, Firebase App Check và origin của bạn.
7. Kiểm tra model trong `getGenerativeModel` có sẵn và còn quota trên project. Repo không cung cấp quota hay tài khoản AI dùng chung.

Firebase web config không phải khóa quản trị. Không commit service-account JSON, private key, GitHub token, mật khẩu hoặc debug token. Các file môi trường và bản build được loại khỏi Git.

Tài liệu: [Firebase AI Logic](https://firebase.google.com/docs/ai-logic), [App Check](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [Debug provider](https://firebase.google.com/docs/app-check/web/debug-provider).

## Cấu trúc

- `game/scenarios.ts`: nhân vật, sự kiện, hóa đơn và dữ kiện.
- `game/engine.ts`: trạng thái và hành động.
- `game/npc-agents.ts`: danh tính, phạm vi trí nhớ.
- `game/npc-director.ts`, `game/npc-scene.ts`: giới hạn hội thoại và hành động.
- `lib/firebase-ai.ts`, `lib/npc-prompt.ts`: kết nối model, hướng dẫn hội thoại.
- `components/game/phone-game.tsx`: giao diện điện thoại.
- `.openai/hosting.json`: liên kết Sites của bản gốc; không dùng project ID này để triển khai vào tài khoản riêng.

## Trạng thái

Bản phát triển đang hoàn thiện, bao gồm thay đổi hội thoại mới nhất. AI lỗi sẽ hiện thông báo thử lại thay vì chèn lời thoại mẫu. Các tình huống ngôn ngữ tự do vẫn cần kiểm thử thêm; đây không phải bản đã xử lý mọi trường hợp.

Mọi tiền, tài khoản và giao dịch trong trải nghiệm là mô phỏng. Không nhập mật khẩu, OTP hay thông tin tài chính thật.
