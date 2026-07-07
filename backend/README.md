# 10th West Moto - Backend API

Backend REST API for the 10th West Moto E-Commerce System.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Authentication:** HttpOnly server-side sessions
- **Validation:** Express-validator
- **Password Hashing:** bcryptjs
- **Media Storage:** Cloudinary (all uploads: product images/videos, avatars, review media)

## Prerequisites

- Node.js (v16 or higher)
- Supabase project
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and update with your Supabase credentials:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
JWT_SECRET=your-super-secret-jwt-key
```

Production additionally requires `SESSION_SECRET`, `SESSION_STORE`,
`FRONTEND_ORIGIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `CSRF_SECRET`, and
`TWO_FACTOR_ENCRYPTION_KEY`. Optional payment, shipping, tracking, email, OAuth,
and Cloudinary values should stay empty until real provider credentials are
configured. See `../docs/PRODUCTION_ENVIRONMENT.md`.

3. Run database migrations (up):
```bash
npm run migrate
```

Do not run either `supabase-setup.sql` file or the legacy scripts under
`src/database/migrate*.js`. Knex migrations are the only schema authority; see
`../docs/DATABASE_MIGRATIONS.md`.

4. Roll back the latest migration batch (down):
```bash
npm run migrate:down
```

5. Optional: run seed scripts:
```bash
set ALLOW_DEVELOPMENT_SEED=true
# Set all SEED_*_PASSWORD values to unique passwords of at least 12 characters.
node src/database/seed.js
node src/database/seed-sprint6.js
```

Seed accounts are refused outside development/test. To disable and rotate any
legacy seeded accounts, run `npm run security:disable-seeded-accounts` with
`CONFIRM_SECURE_SEEDED_ACCOUNTS=true`.

### Development/test login fixtures

Use the fixture script only for local QA and automated E2E login checks. It is
blocked in `NODE_ENV=production`, requires `ENABLE_TEST_FIXTURES=true`, and
only upserts the `@test.local` accounts below.

```bash
ENABLE_TEST_FIXTURES=true TEST_FIXTURE_PASSWORD='LocalTestPass123!' npm run seed:test-fixtures
```

Accounts created or reset by the script:

```text
customer@test.local      customer
cashier@test.local       cashier
staff-noperms@test.local store_staff with explicit permission denials
staff@test.local         store_staff with role permissions
owner@test.local         owner
superadmin@test.local    super_admin
```

If `TEST_FIXTURE_PASSWORD` is omitted, the script generates a strong local
password and writes it to `backend/.test-credentials.local`, which is ignored by
git and must not be copied into production.

## Running the Server

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The API will run on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile (protected)

### Products
- `GET /api/products` - Get all products (with search & filter)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category (admin only)
- `PUT /api/categories/:id` - Update category (admin only)
- `DELETE /api/categories/:id` - Delete category (admin only)

## Development Seed Users

Development seed users use only the explicit `SEED_*_PASSWORD` values supplied
by the developer. No default passwords are stored in this repository.

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Database connection
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── productController.js # Product CRUD
│   │   └── categoryController.js# Category CRUD
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   └── validator.js         # Input validation
│   ├── routes/
│   │   ├── auth.js              # Auth routes
│   │   ├── products.js          # Product routes
│   │   └── categories.js        # Category routes
│   ├── database/
│   │   └── seed.js              # Seed data
│   └── server.js                # Main server file
├── migrations/                   # Knex up/down migrations
├── knexfile.cjs                  # Knex migration config
├── .env                          # Environment variables
├── .env.example                  # Example env file
├── package.json
└── README.md
```

## Database Schema

### Users Table
- id, name, email, password_hash, role, phone, avatar, store_credit
- Roles: customer, admin, cashier

### Products Table
- id, part_number, name, description, price, buying_price, image
- category_id, stock_quantity, box_number, low_stock_threshold
- brand, sku, barcode, sale_price, is_on_sale

### Categories Table
- id, name

### Orders Table
- id, user_id, total_amount, status, shipping_address
- source (online/pos), payment_method, cashier_id

### Order Items Table
- id, order_id, product_id, product_name, product_price, quantity

### Addresses Table
- id, user_id, recipient_name, phone, street, city, state, postal_code

## Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Role-based access control (RBAC)
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- CORS configuration

## Error Handling

All endpoints return consistent JSON responses:
```json
{
  "message": "Error description",
  "errors": [] // Optional validation errors
}
```

## License

ISC
