# Phòng 203

Phòng 203 là MVP game mô phỏng đời sống số giúp người trẻ luyện phản xạ xác minh danh tính trước các tình huống giả mạo trực tuyến. Người chơi trò chuyện tự do, đối chiếu thông tin qua nhiều kênh, đưa ra quyết định và nhận debrief dựa trên quá trình xử lý.

## Phạm vi MVP

- Một chapter “Minh đổi số”, thời lượng khoảng 8 phút.
- Bốn kênh hội thoại: Minh số mới, Dũng phòng 204, nhóm lớp A3 và cô Hạnh chủ trọ.
- Các hành động xác minh qua số cũ, nhóm lớp và người thứ ba.
- Ba kết quả: xác minh an toàn, chuyển tiền mô phỏng và kết luận quá sớm.
- Debrief theo bốn năng lực: xác minh danh tính, đánh giá bằng chứng, chống thúc ép và hiệu chỉnh niềm tin.
- Gemini điều khiển lời thoại, ghi nhận tín hiệu hành vi và quyết định thời điểm chuyển giai đoạn; Game Engine giữ các mốc bắt buộc để chapter luôn hoàn thành được.

## Chạy cục bộ

Yêu cầu Node.js 22.13 trở lên.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Kết nối Gemini

Game gọi Gemini Developer API qua Firebase AI Logic SDK trên trình duyệt; không dùng route máy chủ, Vertex AI hoặc `GEMINI_API_KEY`. Firebase web app cần được đăng ký với App Check bằng reCAPTCHA Enterprise. API key của web app phải giới hạn theo website và cho phép cả `Firebase AI Logic API` lẫn `Firebase App Check API`. Mỗi lượt gửi tối đa 10 tin nhắn gần nhất; phản hồi Gemini dùng JSON Schema gồm lời thoại, tín hiệu hành vi và trạng thái chuyển giai đoạn. Nếu AI chưa kết nối, game hiển thị rõ trạng thái rồi mới dùng kịch bản mẫu để chapter vẫn chơi được.

## Nguyên tắc an toàn

- Tất cả nhân vật, số tiền và giao dịch là mô phỏng.
- Không tạo link phishing, số tài khoản hoặc thông tin cá nhân thật.
- NPC giả danh chỉ nhận tập dữ kiện được phép biết.
- Model điều khiển hội thoại nhưng không được tự thực hiện giao dịch; Game Engine ghi nhận hành động và chấm điểm.
