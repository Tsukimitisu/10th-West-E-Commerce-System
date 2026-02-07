# Quick Setup Script for Backend
# Run this from the backend directory

Write-Host "================================" -ForegroundColor Cyan
Write-Host "10TH WEST MOTO - Backend Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Creating .env file from example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ .env file created" -ForegroundColor Green
    Write-Host "⚠️  Please edit backend/.env and update your PostgreSQL credentials!" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Dependencies already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "1. Edit backend/.env with your PostgreSQL credentials"
Write-Host "2. Create database: createdb tenthwest_moto"
Write-Host "   Or in PostgreSQL: CREATE DATABASE tenthwest_moto;"
Write-Host "3. Run migration: npm run migrate"
Write-Host "4. Seed data: node src/database/seed.js"
Write-Host "5. Start server: npm run dev"
Write-Host ""
Write-Host "See SETUP_GUIDE.md for detailed instructions" -ForegroundColor Yellow
