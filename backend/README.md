# 10th West Moto - Backend API

Backend REST API for the 10th West Moto E-Commerce System.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Authentication:** JWT (JSON Web Tokens)
- **Validation:** Express-validator
- **Password Hashing:** bcryptjs

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

3. Create schema in Supabase:
```bash
# Run backend/supabase-setup.sql in Supabase SQL Editor
```

4. Optional: run Node migrations/seeds against Supabase:
```bash
npm run migrate
node src/database/migrate-auth.js
node src/database/seed.js
node src/database/seed-sprint6.js
```

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

## Default Users (After Seeding)

**Admin:**
- Email: admin@10thwest.com
- Password: admin123

**Cashier:**
- Email: cashier@10thwest.com
- Password: cashier123

**Customer:**
- Email: customer@10thwest.com
- Password: customer123

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
│   │   ├── migrate.js           # Database schema
│   │   └── seed.js              # Seed data
│   └── server.js                # Main server file
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
