import pool from '../config/database.js';

const seedMotorcycleCategories = async () => {
  const client = await pool.connect();

  try {
    console.log('Seeding motorcycle categories...');

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

    await client.query('BEGIN');

    const uniqueCategoryNames = [...new Set(categories.map((category) => category.name.trim()))];

    for (const categoryName of uniqueCategoryNames) {
      await client.query(
        `INSERT INTO categories (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [categoryName]
      );
    }

    await client.query('COMMIT');

    console.log(`Seeded ${uniqueCategoryNames.length} motorcycle categories`);
    console.log('Categories added:', uniqueCategoryNames.join(', '));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }
    console.error('Failed to seed categories:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run seeding
seedMotorcycleCategories()
  .then(() => {
    console.log('Category seeding complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
