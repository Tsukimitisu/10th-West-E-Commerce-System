import pool from '../config/database.js';

const seedMotorcycleCategories = async () => {
  const client = await pool.connect();

  try {
    console.log('🏍️ Seeding motorcycle categories...');

    const categories = [
      { name: 'AEROX' },
      { name: 'NMAX' },
      { name: 'M3 Honda Beat' },
      { name: 'Honda Click' },
      { name: 'Mio' },
      { name: 'Sniper' },
      { name: 'Wave' },
      { name: 'TMX' },
      { name: 'XRM' },
      { name: 'Raider' },
      { name: 'Mio Soul' },
      { name: 'PCX' },
      { name: 'ADV' },
      { name: 'CBR' },
      { name: 'Universal Parts' }
    ];

    for (const category of categories) {
      await client.query(
        `INSERT INTO categories (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [category.name]
      );
    }

    console.log(`✅ Seeded ${categories.length} motorcycle categories`);
    console.log('Categories added:', categories.map(c => c.name).join(', '));
  } catch (error) {
    console.error('❌ Failed to seed categories:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run seeding
seedMotorcycleCategories()
  .then(() => {
    console.log('✨ Category seeding complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
