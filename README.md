# IA — Tạo bài đăng Facebook tự động với AI

Công cụ tạo nội dung bài đăng Facebook tự động sử dụng AI (OpenAI / Google Gemini), hỗ trợ lên lịch đăng bài và quản lý phong cách viết.

## Tính năng

- **Tạo caption AI**: Sử dụng Gemini hoặc GPT để tạo nội dung tự động
- **Nhiều phong cách**: Chuyên nghiệp, Hài hước, Khuyến mãi, Kể chuyện, Tối giản
- **Tải ảnh lên**: Upload ảnh trực tiếp hoặc dán link
- **Xem trước Facebook**: Xem trước giao diện bài đăng giống Facebook
- **Lên lịch đăng**: Hẹn giờ đăng bài tự động
- **Đăng Facebook**: Kết nối trực tiếp Facebook Graph API

## Cài đặt

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Khởi động MySQL

```bash
docker compose up -d
```

### 3. Cấu hình môi trường

Sửa file `.env` và điền các API key:

- `GOOGLE_AI_API_KEY` — Lấy từ [Google AI Studio](https://aistudio.google.com/)
- `OPENAI_API_KEY` — Lấy từ [OpenAI Platform](https://platform.openai.com/)
- `FB_PAGE_ID` và `FB_ACCESS_TOKEN` — Lấy từ [Facebook Developer Console](https://developers.facebook.com/)

### 4. Chạy ứng dụng

```bash
npm run dev
```

Truy cập: http://localhost:5173

## Công nghệ

| Phần     | Công nghệ                        |
|----------|-----------------------------------|
| Frontend | React 19, Vite, React Router      |
| Backend  | Express.js, Sequelize, MySQL      |
| AI       | Google Gemini, OpenAI GPT/DALL-E  |
| Lên lịch | node-cron                         |
| Facebook | Graph API                         |
