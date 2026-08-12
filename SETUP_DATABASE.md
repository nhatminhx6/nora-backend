# Nora local database setup

Tài liệu này dùng để dựng một máy development khác với cùng schema và bộ dữ liệu mẫu hiện tại.

## Kết quả sau khi setup

- PostgreSQL và Redis chạy bằng Docker.
- Toàn bộ Prisma migrations được áp dụng, bao gồm recurrence và finance.
- Tài khoản development:
  - Email: `minhmera@gmail.com`
  - Password: `12345678`
- Feed mẫu, công việc mẫu và 36 giao dịch tài chính được seed.
- API chạy tại `http://localhost:3008/v1`.

## Yêu cầu

- Docker Desktop đang chạy.
- Node.js 20 trở lên.
- npm.

## Setup lần đầu

Chạy tất cả lệnh từ đúng thư mục backend:

```bash
cd /path/to/nora-assistant/nora-backend
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
```

Không chạy các lệnh `docker compose` hoặc `npm` từ thư mục home. Nếu terminal báo
`no configuration file provided` hoặc không tìm thấy `package.json`, kiểm tra lại
terminal đang đứng trong thư mục `nora-backend`.

## Chạy backend

```bash
npm run start:api
```

Các process tùy chọn chạy ở terminal riêng:

```bash
npm run start:worker
npm run start:scheduler
```

Sau khi pull code có migration mới, chạy lại:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
```

Seed có thể chạy lại. Dữ liệu seed chính được upsert; 36 giao dịch tài chính có
marker seed sẽ được tạo lại để không tích lũy bản trùng.

## Kiểm tra setup

```bash
docker compose ps
npm run prisma:validate
npm run test:postman
curl http://localhost:3008/v1/health
```

Kiểm tra tài khoản và số giao dịch đã seed:

```bash
docker compose exec -T postgres psql -U nora -d nora -c \
  "SELECT u.email, COUNT(t.id) AS finance_transactions FROM users u LEFT JOIN finance_transactions t ON t.user_id = u.id WHERE u.email = 'minhmera@gmail.com' GROUP BY u.email;"
```

Kết quả mong đợi là `minhmera@gmail.com` có `36` giao dịch tài chính.

## Reset toàn bộ local database

Lệnh dưới đây xóa toàn bộ PostgreSQL và Redis data của project trên máy hiện tại:

```bash
docker compose down -v
docker compose up -d postgres redis
npm run prisma:migrate:deploy
npm run prisma:seed
```

Chỉ dùng phần reset khi chắc chắn không cần giữ dữ liệu local.

## Lưu ý cấu hình

- `.env` không được commit. Mỗi máy tạo `.env` từ `.env.example`.
- Nếu đổi `POSTGRES_PASSWORD`, phải đổi đồng thời password trong `DATABASE_URL`.
- iOS app local đang trỏ tới `http://localhost:3008/v1`.
- Sau khi backend có module/API mới, phải restart process API cũ để Nest tải code mới.
