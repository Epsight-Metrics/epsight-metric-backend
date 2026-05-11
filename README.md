# EPSight Metrics API

Quality Control Inspection System dengan real-time monitoring dan analytics.

## Features

✅ **Security Best Practices**
- JWT Access Token (15 menit) + Refresh Token (7 hari, httpOnly cookie)
- Refresh token rotation pada setiap request
- Role-based Access Control (RBAC)
- Helmet.js untuk HTTP headers security
- CORS configuration
- Rate limiting (login, API, CV endpoints)
- Input validation dengan express-validator
- Password hashing dengan bcrypt (12 rounds)
- SQL injection protection dengan Prisma

✅ **Database**
- PostgreSQL dengan Prisma ORM
- Relational data model (User, Part, Session, Batch, Inspection, RefreshToken)
- Proper indexes untuk performance
- Activity logging untuk audit trail

✅ **Real-time Features**
- Server-Sent Events (SSE) untuk notifikasi NG
- Live inspection updates
- Multi-client broadcast support

✅ **Export & Reporting**
- CSV export
- PDF export dengan tabel
- Filtering & pagination

✅ **Production Ready**
- Graceful shutdown
- Health check endpoint
- Request logging
- Error handling dengan proper status codes
- Singleton PrismaClient (no memory leaks)

## Installation

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Seed initial data
npm run db:seed

# Start server
npm start
```

## Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/db"
JWT_SECRET="your-secret-key-min-64-chars"
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login, returns access token + set refresh token cookie (rate limited: 5 attempts/15min)
- `POST /api/auth/refresh` - Rotate refresh token, returns new access token
- `POST /api/auth/logout` - Invalidate refresh token + clear cookie

### Operator (OPERATOR_QC, ENGINEER, QUALITY_MANAGER, ADMIN)
- `POST /api/operator/session/start` - Start work session
- `POST /api/operator/session/stop` - Stop work session
- `GET /api/operator/session` - Get current session & recent inspections
- `POST /api/operator/inspect` - Manual inspection entry
- `POST /api/operator/inspect/cv` - CV inspection (no auth, rate limited: 10/sec)
- `GET /api/operator/parts` - List all parts

### QC Manager (QUALITY_MANAGER, ADMIN)
- `GET /api/qcmanager/kpi` - Today's KPI metrics
- `GET /api/qcmanager/trends?period=day|week|month` - Trend analysis
- `GET /api/qcmanager/inspections` - List inspections with filters
- `GET /api/qcmanager/alert-summary` - NG alert summary
- `GET /api/qcmanager/export?format=csv|pdf` - Export data

### Admin (ADMIN)
- `GET /api/admin/users` - List users with filters
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete/deactivate user
- `GET /api/admin/logs` - Activity logs

### Audit (AUDIT, QUALITY_MANAGER, ADMIN)
- `GET /api/audit/inspections` - List all inspections
- `GET /api/audit/inspections/:id` - Get inspection detail
- `GET /api/audit/export?format=csv|pdf` - Export audit evidence

### Real-time
- `GET /api/notifications/stream` - SSE stream (authenticated)

### Health
- `GET /health` - Health check with database status

## Authentication Flow

```
1. POST /api/auth/login
   → Response: { accessToken, user }
   → Cookie: refreshToken (httpOnly, 7 hari)

2. Setiap request API:
   → Header: Authorization: Bearer <accessToken>

3. Access token expired (401):
   → POST /api/auth/refresh (cookie dikirim otomatis)
   → Response: { accessToken } baru
   → Cookie: refreshToken baru (rotasi)

4. POST /api/auth/logout
   → Hapus refresh token dari DB + clear cookie
```

## Rate Limits

- Login: 5 attempts per 15 minutes
- API: 100 requests per minute
- CV Inspection: 10 requests per second

## Security Headers (Helmet.js)

- Content-Security-Policy
- X-DNS-Prefetch-Control
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security
- X-Download-Options
- X-Permitted-Cross-Domain-Policies

## Error Codes

- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate entry)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `503` - Service Unavailable (database down)

## Database Schema

```
User (id, username, password, name, role, isActive)
  ├─ Session (sessionId, operatorId, startedAt, endedAt)
  │   └─ InspectionBatch (batchNumber, sessionId, partId, totalQuantity)
  │       └─ Inspection (timestamp, partId, operatorId, sessionId, batchId, ...)
  ├─ ActivityLog (userId, action, detail, createdAt)
  └─ RefreshToken (token, userId, expiresAt, createdAt)

Part (id, partCode, partName, vendorName)
  └─ Inspection (...)
```

## Best Practices Implemented

1. ✅ Singleton PrismaClient (no memory leaks)
2. ✅ Input validation on all endpoints
3. ✅ Rate limiting untuk prevent abuse
4. ✅ Proper error handling dengan specific status codes
5. ✅ CORS & Helmet untuk security
6. ✅ Request logging
7. ✅ Graceful shutdown
8. ✅ Health check endpoint
9. ✅ Password hashing dengan bcrypt (12 rounds)
10. ✅ Short-lived access token (15m) + long-lived refresh token (7d)
11. ✅ Refresh token rotation (token lama dihapus setiap refresh)
12. ✅ Refresh token di httpOnly cookie (aman dari XSS)
13. ✅ Role-based access control
14. ✅ SQL injection protection
15. ✅ Activity logging untuk audit
16. ✅ Pagination pada list endpoints
17. ✅ Database indexes untuk performance

## Development

```bash
# Development mode
npm run dev

# Database studio
npm run db:studio

# Create migration
npm run db:migrate
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET` (64+ characters)
3. Configure `CORS_ORIGIN` dengan domain spesifik
4. Enable HTTPS (wajib agar cookie `secure` flag berfungsi)
5. Setup database backups
6. Monitor logs
7. Setup process manager (PM2)

```bash
# PM2 example
pm2 start src/index.js --name epsight-api
pm2 startup
pm2 save
```
