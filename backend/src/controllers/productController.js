import pool from '../config/database.js';
import { emitProductCreated, emitProductUpdated, emitProductDeleted } from '../socket.js';
import supabaseClient from '../services/supabaseClient.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'products');

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const toNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

// Get all products
export const getProducts = async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let selectClause = `
      SELECT p.*, c.name as category_name,
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status IN ('paid', 'completed')
      ), 0) as total_sold
    `;
    let fromClause = 'FROM products p LEFT JOIN categories c ON p.category_id = c.id';
    let whereClause = 'WHERE 1=1';
    let orderByClause = '';
    const params = [];

    // Filter by category
    if (category) {
      params.push(category);
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    // Search by name, description, brand, sku, part number or category
    if (search) {
      const words = search.trim().split(/\s+/).filter(w => w.length > 0);
      let relevanceScores = [];

      words.forEach(word => {
        params.push(`%${word}%`);
        const idx = params.length;
        
        whereClause += ` AND (
          p.name ILIKE $${idx} OR 
          p.part_number ILIKE $${idx} OR 
          p.description ILIKE $${idx} OR 
          p.brand ILIKE $${idx} OR 
          p.sku ILIKE $${idx} OR 
          c.name ILIKE $${idx}
        )`;

        relevanceScores.push(`
          (CASE WHEN p.name ILIKE $${idx} THEN 10 ELSE 0 END) +
          (CASE WHEN p.part_number ILIKE $${idx} THEN 8 ELSE 0 END) +
          (CASE WHEN p.brand ILIKE $${idx} THEN 5 ELSE 0 END) +
          (CASE WHEN c.name ILIKE $${idx} THEN 3 ELSE 0 END) +
          (CASE WHEN p.description ILIKE $${idx} THEN 1 ELSE 0 END)
        `);
      });

      // Exact match boost
      params.push(`%${search.trim()}%`);
      const exactIdx = params.length;
      relevanceScores.push(`(CASE WHEN p.name ILIKE $${exactIdx} THEN 15 ELSE 0 END)`);

      selectClause += `, (${relevanceScores.join(' + ')}) as relevance_score`;
      orderByClause = 'ORDER BY relevance_score DESC, p.id DESC';
    } else {
      orderByClause = 'ORDER BY p.id DESC';
    }

    const query = `${selectClause} ${fromClause} ${whereClause} ${orderByClause}`;
    const result = await pool.query(query, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      price: parseFloat(product.price),
      buying_price: parseFloat(product.buying_price),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      stock_quantity: parseInt(product.stock_quantity),
      total_sold: parseInt(product.total_sold)
    })));
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get top selling products
export const getTopSellers = async (req, res) => {
  try {
    const { days, limit = 8 } = req.query;
    
    let dateFilter = '';
    const params = [];
    params.push(parseInt(limit));
    
    if (days && days !== 'all') {
      const parsedDays = parseInt(days);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        params.push(parsedDays);
        dateFilter = `AND o.created_at >= NOW() - INTERVAL '${parsedDays} days'`;
      }
    }

    // We MUST manually list columns instead of p.* because PostgreSQL strict GROUP BY
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, p.part_number, p.image, p.description, 
        p.price, p.sale_price, p.is_on_sale, p.stock_quantity, p.rating, p.created_at,
        c.name as category_name,
        COALESCE(SUM(oi.quantity), 0) as total_sold
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('paid', 'completed') ${dateFilter}
      LEFT JOIN categories c ON p.category_id = c.id
      GROUP BY p.id, c.name
      ORDER BY total_sold DESC, p.id DESC
      LIMIT $1
    `, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      price: parseFloat(product.price),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      stock_quantity: parseInt(product.stock_quantity),
      total_sold: parseInt(product.total_sold)
    })));
  } catch (error) {
    console.error('Get top sellers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single product by ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT p.*, c.name as category_name 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = result.rows[0];
    res.json({
      ...product,
      price: parseFloat(product.price),
      buying_price: parseFloat(product.buying_price),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      stock_quantity: parseInt(product.stock_quantity)
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new product (Admin only)
export const createProduct = async (req, res) => {
  const {
    part_number, name, description, price, buying_price,
    image, category_id, stock_quantity, box_number,
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale
  } = req.body;

  try {
    const cleanPartNumber = toNullableString(part_number);
    const cleanSku = toNullableString(sku);
    const cleanBarcode = toNullableString(barcode);
    const cleanImage = toNullableString(image);
    const cleanBrand = toNullableString(brand);
    const cleanBoxNumber = toNullableString(box_number);
    const cleanCategoryId = toNullableNumber(category_id);
    const cleanStockQuantity = toNullableNumber(stock_quantity);
    const cleanLowStockThreshold = toNullableNumber(low_stock_threshold);
    const cleanSalePrice = toNullableNumber(sale_price);
    const cleanIsOnSale = typeof is_on_sale === 'boolean' ? is_on_sale : null;

    const result = await pool.query(
      `INSERT INTO products (
        part_number, name, description, price, buying_price, 
        image, category_id, stock_quantity, box_number, 
        low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, false))
      RETURNING *`,
      [
        cleanPartNumber, name, description, price, buying_price,
        cleanImage, cleanCategoryId, cleanStockQuantity ?? 0, cleanBoxNumber,
        cleanLowStockThreshold ?? 5, cleanBrand, cleanSku, cleanBarcode, cleanSalePrice, cleanIsOnSale
      ]
    );

    const newProduct = result.rows[0];
    emitProductCreated(newProduct);

    res.status(201).json({
      message: 'Product created successfully',
      product: newProduct
    });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'Product with this part number, SKU, or barcode already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Update product (Admin only)
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const {
    part_number, name, description, price, buying_price,
    image, category_id, stock_quantity, box_number,
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale
  } = req.body;

  try {
    const cleanPartNumber = toNullableString(part_number);
    const cleanSku = toNullableString(sku);
    const cleanBarcode = toNullableString(barcode);
    const cleanImage = toNullableString(image);
    const cleanBrand = toNullableString(brand);
    const cleanBoxNumber = toNullableString(box_number);
    const cleanCategoryId = toNullableNumber(category_id);
    const cleanStockQuantity = toNullableNumber(stock_quantity);
    const cleanLowStockThreshold = toNullableNumber(low_stock_threshold);
    const cleanSalePrice = toNullableNumber(sale_price);
    const cleanIsOnSale = typeof is_on_sale === 'boolean' ? is_on_sale : null;

    const result = await pool.query(
      `UPDATE products SET
        part_number = COALESCE($1, part_number),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        buying_price = COALESCE($5, buying_price),
        image = COALESCE($6, image),
        category_id = COALESCE($7, category_id),
        stock_quantity = COALESCE($8, stock_quantity),
        box_number = COALESCE($9, box_number),
        low_stock_threshold = COALESCE($10, low_stock_threshold),
        brand = COALESCE($11, brand),
        sku = COALESCE($12, sku),
        barcode = COALESCE($13, barcode),
        sale_price = COALESCE($14, sale_price),
        is_on_sale = COALESCE($15, is_on_sale),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING *`,
      [
        cleanPartNumber, name, description, price, buying_price,
        cleanImage, cleanCategoryId, cleanStockQuantity, cleanBoxNumber,
        cleanLowStockThreshold, cleanBrand, cleanSku, cleanBarcode, cleanSalePrice, cleanIsOnSale, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const updatedProduct = result.rows[0];
    emitProductUpdated(updatedProduct);

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload product image
export const uploadProductImage = async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
      return res.status(400).json({ message: 'Unsupported file type. Use JPG, PNG, WEBP, or GIF.' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    const ext = MIME_EXTENSION_MAP[contentType] || 'bin';
    const filename = `product-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}.${ext}`;
    
    let imageUrl;

    // Try Supabase first if available
    const { SUPABASE_URL } = process.env;
    if (SUPABASE_URL) {
      const { data, error } = await supabaseClient.storage
        .from('products')
        .upload(filename, req.body, {
          contentType: contentType,
          upsert: false
        });

      if (!error) {
        // Get public URL
        const { data: publicUrlData } = supabaseClient.storage
          .from('products')
          .getPublicUrl(filename);
        imageUrl = publicUrlData.publicUrl;
      } else {
        console.warn('Supabase storage upload failed, falling back to local FS:', error.message);
      }
    }

    if (!imageUrl) {
      await fs.mkdir(uploadsDir, { recursive: true });
      const filepath = path.join(uploadsDir, filename);
      await fs.writeFile(filepath, req.body);
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/products/${filename}`;
    }

    res.status(201).json({
      message: 'Image uploaded successfully',
      imageUrl
    });
  } catch (error) {
    console.error('Upload product image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete product (Admin only)
export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    emitProductDeleted(id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
