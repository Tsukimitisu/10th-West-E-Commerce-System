# 🚀 Supabase Setup Guide for 10th West Moto

This guide will help you and your collaborators set up the project using **Supabase** instead of local PostgreSQL.

## Why Supabase?

- ✅ No local PostgreSQL installation needed
- ✅ Free tier with generous limits
- ✅ Easy collaboration (same database for all team members)
- ✅ Automatic backups
- ✅ Built-in dashboard for managing data

---

## 📋 Setup Steps

### 1. Create a Supabase Account

1. Go to https://supabase.com
2. Click **"Start your project"**
3. Sign up with GitHub (recommended) or email
4. Verify your email if required

### 2. Create a New Project

1. Click **"New Project"**
2. Fill in:
   - **Name:** `10th-west-moto` (or any name)
   - **Database Password:** Choose a strong password (save this!)
   - **Region:** Choose closest to your location
   - **Pricing Plan:** Free (sufficient for development)
3. Click **"Create new project"**
4. Wait 1-2 minutes for provisioning

### 3. Get Your Connection String

1. In your Supabase project dashboard, go to:
   - **Settings** (gear icon on left sidebar)
   - **Database** section
2. Scroll to **Connection String**
3. Select **URI** tab
4. Copy the connection string (looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxx.supabase.co:5432/postgres
   ```
5. **Replace `[YOUR-PASSWORD]`** with your actual database password from Step 2

### 4. Configure Your Project

1. Open `backend/.env` file
2. Paste your connection string:
   ```env
   DATABASE_URL=postgresql://postgres:your_password@db.xxxxxx.supabase.co:5432/postgres
   ```
3. Comment out or remove the old local DB settings:
   ```env
   # DB_HOST=localhost
   # DB_PORT=2305
   # DB_NAME=tenthwest_moto
   # DB_USER=postgres
   # DB_PASSWORD=postgres123
   ```

### 5. Run Database Migrations

```bash
cd backend
npm run migrate
```

This creates all the necessary tables in Supabase.

### 6. (Optional) Seed Sample Data

```bash
node src/database/seed.js
```

This adds categories, products, and test users.

### 7. Start the Application

From the project root:
```bash
npm run dev
```

---

## 👥 For Your Collaborators

When your friend clones the repo, they just need to:

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd backend
   npm install
   cd ..
   ```
3. Ask you for the Supabase connection string
4. Create `backend/.env` file and paste the connection string:
   ```env
   DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres
   ```
5. Copy other settings from `.env.example` (Stripe, email, etc.)
6. Run the app:
   ```bash
   npm run dev
   ```

**No PostgreSQL installation needed!** 🎉

---

## 🔐 Security Best Practices

### Never Commit `.env` Files
The `.env` file is already in `.gitignore` and should NEVER be committed to GitHub.

### Share Credentials Securely
Share the Supabase connection string with collaborators through:
- Encrypted messaging (Signal, WhatsApp)
- Password managers (1Password, Bitwarden)
- Never in public channels or GitHub issues

### Use Row Level Security (RLS) for Production
When deploying to production:
1. Go to **Authentication** > **Policies** in Supabase
2. Enable RLS on all tables
3. Create appropriate policies for your app

---

## 🎛️ Managing Your Database

### Viewing Data
1. Go to **Table Editor** in Supabase dashboard
2. Browse and edit data directly

### Running SQL Queries
1. Go to **SQL Editor** in Supabase dashboard
2. Write and execute SQL queries

### Backups
Supabase automatically backs up your database on the free tier.

---

## 🔄 Switching Back to Local PostgreSQL (Optional)

If you want to use local PostgreSQL again:

1. Comment out `DATABASE_URL` in `backend/.env`:
   ```env
   # DATABASE_URL=postgresql://...
   ```
2. Uncomment local settings:
   ```env
   DB_HOST=localhost
   DB_PORT=2305
   DB_NAME=tenthwest_moto
   DB_USER=postgres
   DB_PASSWORD=postgres123
   ```

The app will automatically detect and use local PostgreSQL.

---

## 🆘 Troubleshooting

### Connection Error
- Check if `DATABASE_URL` is correct
- Ensure you replaced `[YOUR-PASSWORD]` with actual password
- Verify your IP isn't blocked (Supabase allows all IPs by default)

### Migration Fails
- Check if tables already exist in Supabase Table Editor
- Try running migrations again (they use `IF NOT EXISTS`)

### Seed Data Not Showing
- Check Table Editor in Supabase dashboard
- Verify migrations ran successfully first

---

## 📞 Need Help?

- **Supabase Docs:** https://supabase.com/docs
- **Community:** https://github.com/supabase/supabase/discussions
- **Support:** support@supabase.io

---

## 🎉 You're All Set!

Both you and your collaborators can now work on the same database without installing PostgreSQL locally.
