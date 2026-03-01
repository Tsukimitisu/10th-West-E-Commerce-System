import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

const seedData = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...');

    // Check if data already exists
    const userCheck = await client.query('SELECT COUNT(*) FROM users');
    const existingCount = parseInt(userCheck.rows[0].count);
    const force = process.argv.includes('--force') || process.env.FORCE_SEED === 'true';

    if (existingCount > 0 && !force) {
      console.log('⚠️  Database already contains data. Skipping seed. Use --force to reseed (destructive).');
      return;
    }

    if (existingCount > 0 && force) {
      console.log('⚠️  Force seeding enabled. Truncating seeded tables (this is destructive) ...');
      await client.query(`TRUNCATE users, categories, products, orders, order_items, cart_items, carts, addresses CASCADE;`);
    }

    // Seed Users (4 roles only)
    const hashedSuperAdminPassword = await bcrypt.hash('Admin@123', 10);
    const hashedOwnerPassword = await bcrypt.hash('Admin@123', 10);
    const hashedStaffPassword = await bcrypt.hash('Staff@123', 10);
    const hashedCustomerPassword = await bcrypt.hash('Customer@123', 10);

    await client.query(`
      INSERT INTO users (name, email, password_hash, role, phone) VALUES
      ('Super Admin', 'superadmin@10thwest.com', $1, 'super_admin', '555-0001'),
      ('Store Owner', 'owner@10thwest.com', $2, 'owner', '555-0002'),
      ('Store Staff', 'staff@10thwest.com', $3, 'store_staff', '555-0003'),
      ('Moto Rider', 'customer@10thwest.com', $4, 'customer', '555-0101');
    `, [hashedSuperAdminPassword, hashedOwnerPassword, hashedStaffPassword, hashedCustomerPassword]);
    console.log('✅ Users seeded');

    // Seed Categories
    await client.query(`
      INSERT INTO categories (name) VALUES
      ('NMAX V1'),
      ('NMAX V2'),
      ('AEROX V1'),
      ('AEROX V2'),
      ('M3 MIO'),
      ('CLICK 150'),
      ('CLICK 125'),
      ('BEAT V2'),
      ('Universal Parts');
    `);
    console.log('✅ Categories seeded');

    // Seed Products
    await client.query(`
      INSERT INTO products (
        part_number, name, description, price, buying_price, 
        image, category_id, stock_quantity, box_number, 
        low_stock_threshold, brand, sku, barcode
      ) VALUES
      ('2DP-H2129-00', 'Battery Cover', 'Original Yamaha Battery Cover for NMAX V1.', 
       150.00, 104.00, 'https://images.unsplash.com/photo-1558564175-99645903c7bb?auto=format&fit=crop&q=80&w=400', 
       1, 2, '2F STAIRS', 2, 'Yamaha', 'SKU-001', '123456789012'),
      
      ('2DP-F8351-00-P1', 'Body Cowling Pearl White (46)', 'Side body cowling in Pearl White finish.', 
       800.00, 448.00, 'https://images.unsplash.com/photo-1598616345941-86560965a3d7?auto=format&fit=crop&q=80&w=400', 
       1, 4, '46', 3, 'Yamaha', 'SKU-002', '123456789013'),
      
      ('2DP-F8351-00-P5', 'Body Cowling Matte Red (37)', 'Side body cowling in Matte Red finish.', 
       600.00, 560.00, 'https://images.unsplash.com/photo-1578844251758-2f71da645217?auto=format&fit=crop&q=80&w=400', 
       1, 7, '37', 3, 'Yamaha', 'SKU-003', '123456789014'),
      
      ('2DP-E4412-00', 'Cap Cleaner Case Outer', 'Outer casing for air cleaner.', 
       500.00, 343.00, 'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=400', 
       1, 5, '2F STAIRS', 2, 'Yamaha', 'SKU-004', '123456789015'),
      
      ('2DP-F2865-00-P7', 'Cover Front Matte Black (43)', 'Front cover panel matte black.', 
       700.00, 509.00, 'https://images.unsplash.com/photo-1622185135505-2d795043906a?auto=format&fit=crop&q=80&w=400', 
       1, 6, '43', 3, 'Yamaha', 'SKU-005', '123456789016'),
      
      ('UNIV-OIL-1040', 'Motul 7100 4T 10W-40', '100% synthetic 4-stroke lubricant.', 
       650.00, 450.00, 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&q=80&w=400', 
       9, 45, 'SHELF A1', 10, 'Motul', 'SKU-006', '123456789017');
    `);
    console.log('✅ Products seeded');

    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run seed
seedData()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
