# Facebook Auto Post Creator — Task Tracker

## Phase 1: Foundation ✅
- [x] Project setup (Vite + React)
- [x] Docker Compose for MySQL
- [x] Express backend skeleton
- [x] Database schema + seeding
- [x] Design system CSS (dark premium)
- [x] Frontend layout + routing

## Phase 2: AI Integration ✅
- [x] OpenAI caption generation service
- [x] OpenAI/Gemini image generation service
- [x] Style system with prompt templates
- [x] AI routes

## Phase 3: Post Management ✅
- [x] Post creation wizard UI
- [x] Style selector component
- [x] Caption editor
- [x] Image preview + upload
- [x] Schedule picker
- [x] Post preview (mock Facebook)
- [x] CRUD operations

## Phase 4: Facebook Integration ✅
- [x] Facebook Graph API connection
- [x] Photo upload + publish
- [x] Scheduling with cron
- [x] Status tracking

## Phase 5: Dashboard & Polish ✅
- [x] Dashboard with stats
- [x] Scheduled posts list
- [x] Post history
- [x] Settings page
- [x] Animations & transitions
- [x] Responsive design
- [x] Tiếng Việt có dấu toàn hệ thống

## Phase 6: Authentication & Settings UI ✅
- [x] Admin authentication (login/logout)
- [x] Session management (token-based)
- [x] Cài đặt API keys từ giao diện (AI + Facebook)
- [x] Hiển thị trạng thái key (masked)
- [x] Kiểm tra kết nối AI (test button)
- [x] Đổi mật khẩu admin
- [x] Services đọc key từ DB, fallback .env

## Phase 7: Multi-Page Facebook ✅
- [x] FbPage model (page_id, access_token, avatar, color)
- [x] Post.fb_page_id — mỗi bài thuộc 1 page duy nhất
- [x] CRUD Facebook Pages (add + auto verify, update, delete, sync)
- [x] Trang "Quản lý Pages" với card grid
- [x] Page Switcher trong sidebar (chuyển workspace)
- [x] Dashboard scope theo active page
- [x] PostList scope + cột "Page" khi xem tất cả
- [x] CreatePost — page selector bước Xem trước
- [x] Scheduler multi-page (mỗi post dùng credentials page riêng)
- [x] Facebook preview hiển thị avatar/tên page thật
- [x] PageContext — state management toàn app
