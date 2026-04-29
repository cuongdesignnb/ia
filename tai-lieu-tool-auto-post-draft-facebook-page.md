# Tài liệu kỹ thuật: Tool Auto Post & Draft Facebook Page

> Mục tiêu: xây dựng hệ thống cho phép người dùng kết nối Facebook Page, tạo bài nháp, đăng ngay hoặc lên lịch đăng bài tự động lên Facebook Page.

---

## 1. Phạm vi chức năng

### 1.1. Chức năng cần có

Hệ thống nên chia thành các nhóm chức năng sau:

| Nhóm chức năng | Mô tả |
|---|---|
| Kết nối Facebook Page | Người dùng đăng nhập Facebook, cấp quyền, hệ thống lấy danh sách Page có thể quản lý |
| Quản lý Page đã kết nối | Lưu Page ID, tên Page, token Page, quyền/tác vụ của user trên Page |
| Tạo bài viết | Nhập nội dung, link, ảnh, video nếu có |
| Lưu nháp | Lưu bài viết trong database của hệ thống, chưa gọi API Facebook |
| Đăng ngay | Gọi Facebook Graph API để đăng bài lên Page |
| Lên lịch đăng | Có thể dùng lịch nội bộ của hệ thống hoặc scheduled post của Facebook |
| Theo dõi trạng thái | `draft`, `scheduled`, `publishing`, `published`, `failed`, `cancelled` |
| Lưu log lỗi | Lưu response lỗi từ Facebook để debug |
| Gia hạn / kiểm tra token | Kiểm tra token còn hợp lệ, yêu cầu kết nối lại nếu token lỗi |

---

## 2. Nguyên tắc quan trọng

### 2.1. Không nên dùng Facebook làm nơi lưu draft chính

Với tool của mình, nên thiết kế như sau:

```text
Draft = lưu trong database của hệ thống
Published/Scheduled = khi cần mới gọi Facebook API
```

Lý do:

- Dễ sửa nội dung nháp.
- Dễ phân quyền nội bộ.
- Dễ làm duyệt bài trước khi đăng.
- Dễ lưu lịch sử chỉnh sửa.
- Không phụ thuộc giao diện draft của Facebook.
- Chủ động retry khi API lỗi.

### 2.2. Không dùng token lấy tay cho production

Graph API Explorer chỉ nên dùng để test.

Production phải dùng flow:

```text
Người dùng bấm "Kết nối Facebook"
→ Facebook Login for Business
→ User cấp quyền Page
→ Hệ thống lấy User Access Token
→ Đổi sang Long-lived User Token
→ Gọi /me/accounts để lấy Page Access Token
→ Lưu Page Access Token đã mã hóa
```

---

## 3. Facebook App cần cấu hình

### 3.1. Use case đúng

Khi tạo App trên Meta Developers, nên chọn use case:

```text
Manage everything on your Page
```

hoặc nhóm tương đương liên quan đến:

```text
Pages API
Facebook Login for Business
Manage Page
```

Không nên chỉ chọn `Facebook Login` thường, vì khi đó thường chỉ thấy các quyền user như:

```text
public_profile
email
user_birthday
user_friends
```

Các quyền này không đủ để lấy Page Access Token hoặc đăng bài lên Page.

### 3.2. Quyền cần xin

Tối thiểu cho tool auto post Page:

```text
pages_show_list
pages_read_engagement
pages_manage_posts
pages_manage_metadata
```

Có thể cần thêm nếu dùng flow Business:

```text
business_management
```

Chỉ xin thêm các quyền dưới đây khi thật sự cần:

| Quyền | Khi nào cần |
|---|---|
| `pages_manage_engagement` | Quản lý comment, reply, hide, delete comment |
| `pages_messaging` | Làm inbox/messenger Page |
| `pages_read_user_content` | Đọc nội dung do user đăng lên Page |
| `read_insights` | Xem thống kê, insight |

Nguyên tắc: xin quyền càng ít càng dễ được App Review.

---

## 4. Luồng kết nối Facebook Page

### 4.1. Tổng quan flow

```text
User
→ Bấm "Kết nối Facebook Page"
→ Redirect sang Facebook OAuth
→ User đăng nhập và cấp quyền
→ Facebook redirect về callback URL
→ Backend nhận code/token
→ Đổi token ngắn hạn sang token dài hạn
→ Gọi /me/accounts
→ Hiển thị danh sách Page
→ User chọn Page
→ Lưu Page Token vào database
```

### 4.2. Endpoint lấy danh sách Page

Sau khi có User Access Token hợp lệ, gọi:

```http
GET https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,tasks&access_token=USER_ACCESS_TOKEN
```

Kết quả mẫu:

```json
{
  "data": [
    {
      "id": "PAGE_ID",
      "name": "Tên Fanpage",
      "access_token": "PAGE_ACCESS_TOKEN",
      "tasks": [
        "CREATE_CONTENT",
        "MANAGE",
        "MODERATE"
      ]
    }
  ]
}
```

Cần lưu:

```text
page_id
page_name
page_access_token
tasks
connected_by_user_id
connected_at
```

---

## 5. Token

### 5.1. Các loại token

| Loại token | Dùng để làm gì |
|---|---|
| Short-lived User Token | Token ngắn hạn sau khi user login |
| Long-lived User Token | Token dài hạn sau khi exchange |
| Page Access Token | Token dùng để thao tác với Page |

### 5.2. Đổi User Token sang Long-lived User Token

```http
GET https://graph.facebook.com/v25.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=APP_ID
  &client_secret=APP_SECRET
  &fb_exchange_token=SHORT_LIVED_USER_TOKEN
```

Kết quả mẫu:

```json
{
  "access_token": "LONG_LIVED_USER_ACCESS_TOKEN",
  "token_type": "bearer",
  "expires_in": 5183944
}
```

Sau đó dùng `LONG_LIVED_USER_ACCESS_TOKEN` gọi lại:

```http
GET https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,tasks&access_token=LONG_LIVED_USER_ACCESS_TOKEN
```

Token trong field `access_token` của từng Page là **Page Access Token** nên lưu vào hệ thống.

### 5.3. Bảo mật token

Bắt buộc:

- Mã hóa token trong database.
- Không log token ra file log.
- Không gửi token về frontend nếu không cần.
- Không chụp ảnh màn hình có token.
- Nếu token đã lộ, phải generate token mới.
- App Secret chỉ để ở backend, không đưa vào JavaScript frontend.

---

## 6. Thiết kế database đề xuất

### 6.1. Bảng `facebook_accounts`

Lưu thông tin tài khoản Facebook đã kết nối.

```sql
CREATE TABLE facebook_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    fb_user_id VARCHAR(100) NULL,
    name VARCHAR(255) NULL,
    access_token TEXT NULL,
    token_expires_at DATETIME NULL,
    connected_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
```

### 6.2. Bảng `facebook_pages`

Lưu Page đã kết nối.

```sql
CREATE TABLE facebook_pages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    facebook_account_id BIGINT UNSIGNED NULL,
    page_id VARCHAR(100) NOT NULL,
    page_name VARCHAR(255) NOT NULL,
    page_access_token TEXT NOT NULL,
    tasks JSON NULL,
    is_active TINYINT(1) DEFAULT 1,
    connected_at DATETIME NULL,
    last_token_check_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_user_page (user_id, page_id)
);
```

### 6.3. Bảng `social_posts`

Lưu bài viết nháp, bài đã đăng, bài lên lịch.

```sql
CREATE TABLE social_posts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    facebook_page_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NULL,
    content TEXT NOT NULL,
    link_url VARCHAR(500) NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    scheduled_at DATETIME NULL,
    published_at DATETIME NULL,
    fb_post_id VARCHAR(255) NULL,
    error_message TEXT NULL,
    retry_count INT DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    approved_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
```

Trạng thái gợi ý:

```text
draft
pending_review
approved
scheduled
publishing
published
failed
cancelled
```

### 6.4. Bảng `social_post_media`

Lưu ảnh/video gắn với bài viết.

```sql
CREATE TABLE social_post_media (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    social_post_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    file_path VARCHAR(500) NULL,
    public_url VARCHAR(500) NULL,
    fb_media_id VARCHAR(255) NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);
```

---

## 7. API đăng bài Facebook Page

### 7.1. Đăng bài text/link

```http
POST https://graph.facebook.com/v25.0/{PAGE_ID}/feed
Content-Type: application/x-www-form-urlencoded
```

Body:

```text
message=Nội dung bài viết
link=https://example.com
access_token=PAGE_ACCESS_TOKEN
```

Response thành công:

```json
{
  "id": "PAGE_ID_POST_ID"
}
```

### 7.2. Đăng bài hẹn giờ bằng Facebook scheduled post

```http
POST https://graph.facebook.com/v25.0/{PAGE_ID}/feed
Content-Type: application/x-www-form-urlencoded
```

Body:

```text
message=Nội dung bài viết hẹn giờ
published=false
scheduled_publish_time=1770000000
unpublished_content_type=SCHEDULED
access_token=PAGE_ACCESS_TOKEN
```

Lưu ý:

- `scheduled_publish_time` là Unix timestamp.
- Nên kiểm tra giới hạn thời gian hẹn lịch theo quy định hiện tại của Meta.
- Nếu hệ thống cần chủ động retry, có thể tự lưu lịch trong database và dùng queue/cron để đăng đúng giờ thay vì dùng scheduled post của Facebook.

### 7.3. Lưu nháp trong hệ thống

Khi user bấm “Lưu nháp”:

```text
Không gọi Facebook API
Chỉ lưu vào social_posts với status = draft
```

Ví dụ:

```sql
INSERT INTO social_posts (
    user_id,
    facebook_page_id,
    content,
    status,
    created_at,
    updated_at
) VALUES (
    1,
    10,
    'Nội dung bài viết nháp',
    'draft',
    NOW(),
    NOW()
);
```

### 7.4. Tạo draft trực tiếp trên Facebook

Không khuyến khích làm luồng chính.

Nếu cần test, có thể thử:

```http
POST https://graph.facebook.com/v25.0/{PAGE_ID}/feed
```

Body:

```text
message=Nội dung bài nháp
published=false
unpublished_content_type=DRAFT
access_token=PAGE_ACCESS_TOKEN
```

Tuy nhiên nên ưu tiên draft nội bộ để dễ kiểm soát.

---

## 8. Đăng bài có ảnh

### 8.1. Một ảnh

```http
POST https://graph.facebook.com/v25.0/{PAGE_ID}/photos
```

Body:

```text
url=https://domain.com/image.jpg
caption=Nội dung caption
published=true
access_token=PAGE_ACCESS_TOKEN
```

### 8.2. Nhiều ảnh

Bước 1: Upload từng ảnh ở trạng thái chưa publish.

```http
POST https://graph.facebook.com/v25.0/{PAGE_ID}/photos
```

Body:

```text
url=https://domain.com/image-1.jpg
published=false
temporary=true
access_token=PAGE_ACCESS_TOKEN
```

Response:

```json
{
  "id": "PHOTO_ID_1"
}
```

Bước 2: Tạo bài feed kèm ảnh.

```http
POST https://graph.facebook.com/v25.0/{PAGE_ID}/feed
```

Body dạng form:

```text
message=Bài viết nhiều ảnh
attached_media[0]={"media_fbid":"PHOTO_ID_1"}
attached_media[1]={"media_fbid":"PHOTO_ID_2"}
access_token=PAGE_ACCESS_TOKEN
```

---

## 9. Laravel: service mẫu

### 9.1. FacebookPageService

```php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FacebookPageService
{
    protected string $graphVersion = 'v25.0';

    public function publishTextPost(string $pageId, string $pageToken, string $message, ?string $link = null): array
    {
        $payload = [
            'message' => $message,
            'access_token' => $pageToken,
        ];

        if ($link) {
            $payload['link'] = $link;
        }

        $response = Http::asForm()->post(
            "https://graph.facebook.com/{$this->graphVersion}/{$pageId}/feed",
            $payload
        );

        if ($response->failed()) {
            Log::warning('Facebook publish failed', [
                'page_id' => $pageId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new \RuntimeException($response->body());
        }

        return $response->json();
    }

    public function scheduleTextPost(string $pageId, string $pageToken, string $message, int $scheduledTimestamp): array
    {
        $response = Http::asForm()->post(
            "https://graph.facebook.com/{$this->graphVersion}/{$pageId}/feed",
            [
                'message' => $message,
                'published' => 'false',
                'scheduled_publish_time' => $scheduledTimestamp,
                'unpublished_content_type' => 'SCHEDULED',
                'access_token' => $pageToken,
            ]
        );

        if ($response->failed()) {
            Log::warning('Facebook schedule failed', [
                'page_id' => $pageId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            throw new \RuntimeException($response->body());
        }

        return $response->json();
    }

    public function uploadUnpublishedPhoto(string $pageId, string $pageToken, string $imageUrl): string
    {
        $response = Http::asForm()->post(
            "https://graph.facebook.com/{$this->graphVersion}/{$pageId}/photos",
            [
                'url' => $imageUrl,
                'published' => 'false',
                'temporary' => 'true',
                'access_token' => $pageToken,
            ]
        );

        if ($response->failed()) {
            throw new \RuntimeException($response->body());
        }

        return $response->json('id');
    }
}
```

---

## 10. Laravel: Job đăng bài

```php
<?php

namespace App\Jobs;

use App\Models\SocialPost;
use App\Services\FacebookPageService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class PublishFacebookPostJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $postId)
    {
    }

    public function handle(FacebookPageService $facebook): void
    {
        $post = SocialPost::with('facebookPage')->findOrFail($this->postId);

        if (!in_array($post->status, ['approved', 'scheduled', 'failed'], true)) {
            return;
        }

        $post->update([
            'status' => 'publishing',
            'error_message' => null,
        ]);

        try {
            $page = $post->facebookPage;
            $pageToken = decrypt($page->page_access_token);

            $result = $facebook->publishTextPost(
                pageId: $page->page_id,
                pageToken: $pageToken,
                message: $post->content,
                link: $post->link_url
            );

            $post->update([
                'status' => 'published',
                'fb_post_id' => $result['id'] ?? null,
                'published_at' => now(),
            ]);
        } catch (\Throwable $e) {
            $post->increment('retry_count');

            $post->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
```

---

## 11. Luồng xử lý bài viết

### 11.1. Lưu nháp

```text
User nhập nội dung
→ Bấm Lưu nháp
→ social_posts.status = draft
```

### 11.2. Gửi duyệt

```text
Draft
→ User bấm Gửi duyệt
→ social_posts.status = pending_review
```

### 11.3. Duyệt bài

```text
pending_review
→ Admin duyệt
→ social_posts.status = approved
```

### 11.4. Đăng ngay

```text
approved
→ Dispatch PublishFacebookPostJob
→ publishing
→ published hoặc failed
```

### 11.5. Lên lịch bằng hệ thống nội bộ

```text
approved
→ User chọn giờ đăng
→ social_posts.status = scheduled
→ scheduled_at = thời gian đăng
→ Scheduler mỗi phút quét bài đến giờ
→ Dispatch PublishFacebookPostJob
```

Laravel scheduler mẫu:

```php
$schedule->call(function () {
    \App\Models\SocialPost::query()
        ->where('status', 'scheduled')
        ->where('scheduled_at', '<=', now())
        ->limit(50)
        ->get()
        ->each(function ($post) {
            \App\Jobs\PublishFacebookPostJob::dispatch($post->id);
        });
})->everyMinute();
```

---

## 12. Kiểm tra quyền trước khi đăng

Trước khi cho user chọn Page, nên kiểm tra `tasks` của Page.

Cần có task liên quan tạo nội dung, thường là:

```text
CREATE_CONTENT
MANAGE
```

Nếu Page không có quyền tạo nội dung, không cho kết nối hoặc hiển thị cảnh báo:

```text
Tài khoản Facebook của bạn chưa có quyền tạo nội dung trên Page này.
Vui lòng kiểm tra quyền quản trị Page trong Meta Business Suite.
```

---

## 13. Xử lý lỗi thường gặp

### 13.1. `Invalid OAuth 2.0 Access Token`

Nguyên nhân:

- Token hết hạn.
- Token bị thu hồi.
- User đổi mật khẩu Facebook.
- User gỡ app.
- User mất quyền Page.

Cách xử lý:

```text
Đánh dấu Page cần kết nối lại
Hiển thị nút "Kết nối lại Facebook"
Không retry vô hạn
```

### 13.2. `Permissions error`

Nguyên nhân:

- Thiếu quyền `pages_manage_posts`.
- App chưa được App Review.
- User chưa tick chọn Page khi cấp quyền.
- User không có task tạo nội dung trên Page.

Cách xử lý:

```text
Kiểm tra /me/permissions
Kiểm tra /me/accounts?fields=id,name,tasks
Yêu cầu user kết nối lại Page
```

### 13.3. `/me/accounts` trả về `data: []`

Nguyên nhân:

- Thiếu `pages_show_list`.
- User không quản lý Page nào.
- Khi login, user chưa chọn Page.
- Page nằm trong Business nhưng user chưa được cấp quyền.

Cách xử lý:

```text
Cho user logout/reconnect
Yêu cầu chọn đúng Page trong popup Facebook
Kiểm tra quyền Page trong Business Suite
```

### 13.4. Đăng ảnh lỗi

Nguyên nhân:

- URL ảnh không public.
- Ảnh quá lớn.
- Server ảnh chặn Facebook crawler.
- SSL lỗi.

Cách xử lý:

```text
Ảnh phải có URL public HTTPS
Không yêu cầu login mới xem được
Kiểm tra Content-Type đúng image/jpeg, image/png...
```

---

## 14. App Review và Production

Nếu tool chỉ dùng nội bộ cho Page của bạn:

```text
Có thể test bằng tài khoản Admin/Developer/Tester của App
```

Nếu tool dùng cho khách hàng hoặc nhiều user bên ngoài:

```text
Cần Publish app
Cần Business Verification
Cần App Review cho các quyền Page
Có thể cần Data Use Checkup định kỳ
```

Khi gửi App Review, cần chuẩn bị:

- Video demo flow kết nối Facebook Page.
- Mô tả rõ vì sao cần từng quyền.
- Link chính sách quyền riêng tư.
- Link điều khoản sử dụng.
- Tài khoản test cho reviewer.
- Mô tả chức năng auto post/draft/schedule.
- Chứng minh user chủ động chọn Page và chủ động đăng bài.

---

## 15. Checklist triển khai

### Cấu hình Meta App

- [ ] Tạo app với use case `Manage everything on your Page`.
- [ ] Bật Facebook Login for Business.
- [ ] Cấu hình OAuth Redirect URI.
- [ ] Thêm quyền Page cần thiết.
- [ ] Test bằng Graph API Explorer.
- [ ] Không dùng token đã lộ trên ảnh chụp.

### Backend

- [ ] Tạo API connect Facebook.
- [ ] Tạo callback OAuth.
- [ ] Exchange token dài hạn.
- [ ] Gọi `/me/accounts`.
- [ ] Lưu Page token đã mã hóa.
- [ ] Tạo CRUD bài viết.
- [ ] Tạo trạng thái draft/scheduled/published/failed.
- [ ] Tạo job đăng bài.
- [ ] Tạo scheduler quét bài đến giờ.
- [ ] Lưu log lỗi.

### Frontend

- [ ] Nút kết nối Facebook.
- [ ] Màn hình chọn Page.
- [ ] Màn hình danh sách Page đã kết nối.
- [ ] Form tạo bài viết.
- [ ] Nút lưu nháp.
- [ ] Nút đăng ngay.
- [ ] Nút lên lịch.
- [ ] Hiển thị trạng thái bài.
- [ ] Hiển thị lỗi khi token/Page mất quyền.

### Bảo mật

- [ ] Mã hóa token.
- [ ] Không log token.
- [ ] Không trả token về frontend.
- [ ] Có chức năng disconnect Page.
- [ ] Có chức năng reconnect Page.
- [ ] Có kiểm tra quyền trước khi publish.

---

## 16. Kết luận hướng làm chuẩn

Nên làm theo kiến trúc:

```text
Draft lưu nội bộ
Schedule quản lý bằng database + queue
Đăng bài dùng Page Access Token
Token lấy qua Facebook Login for Business
Page lấy qua /me/accounts
Production cần App Review + Business Verification nếu dùng cho khách hàng
```

Flow chuẩn:

```text
Connect Facebook
→ Lấy Page
→ Lưu token mã hóa
→ Tạo draft
→ Duyệt bài
→ Đăng ngay / lên lịch
→ Queue gọi Facebook API
→ Lưu fb_post_id và trạng thái
```

---

## 17. Nguồn tham khảo chính thức

- Meta Pages API: https://developers.facebook.com/docs/pages-api/
- Manage a Page: https://developers.facebook.com/docs/pages-api/manage-pages/
- Getting Started with Pages API: https://developers.facebook.com/docs/pages-api/getting-started/
- User Accounts endpoint: https://developers.facebook.com/docs/graph-api/reference/user/accounts
- Long-lived Access Tokens: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
