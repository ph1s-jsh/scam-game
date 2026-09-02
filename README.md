# Phòng 203

Phòng 203 là MVP game mô phỏng đời sống số giúp người trẻ luyện phản xạ xác minh danh tính trước các tình huống giả mạo trực tuyến. Người chơi trò chuyện tự do, đối chiếu thông tin qua nhiều kênh, đưa ra quyết định và nhận debrief dựa trên quá trình xử lý.

## Phạm vi MVP

- Một chapter “Minh đổi số”, thời lượng khoảng 8 phút.
- Bốn kênh hội thoại: Minh số mới, Dũng phòng 204, nhóm lớp A3 và cô Hạnh chủ trọ.
- Các hành động xác minh qua số cũ, nhóm lớp và người thứ ba.
- Ba kết quả: xác minh an toàn, chuyển tiền mô phỏng và kết luận quá sớm.
- Debrief theo bốn năng lực: xác minh danh tính, đánh giá bằng chứng, chống thúc ép và hiệu chỉnh niềm tin.
- Hội thoại cốt lõi có lớp luật an toàn; câu hỏi mở có thể chuyển cho Gemini khi được cấu hình.

## Chạy cục bộ

Yêu cầu Node.js 22.13 trở lên.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Mở `http://localhost:3000`.

## Kết nối Gemini

Điền `GEMINI_API_KEY` trong `.env.local`. API key chỉ được đọc tại route phía máy chủ và không được gửi xuống trình duyệt. Nếu chưa có key, game vẫn hoàn thành được bằng conversational fallback đã giới hạn theo World State.

## Nguyên tắc an toàn

- Tất cả nhân vật, số tiền và giao dịch là mô phỏng.
- Không tạo link phishing, số tài khoản hoặc thông tin cá nhân thật.
- NPC giả danh chỉ nhận tập dữ kiện được phép biết.
- Model không quyết định kết quả; Game Engine ghi nhận hành động và chấm điểm.
