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
const ALLOWED_PRODUCT_STATUSES = new Set(['available', 'hidden', 'out_of_stock']);
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

const toNullableProductStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return ALLOWED_PRODUCT_STATUSES.has(normalized) ? normalized : null;
};

const tokenizeSearchTerms = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim();

  if (!normalized) return [];

  const seen = new Set();
  const terms = [];
  normalized.split(/\s+/).forEach((term) => {
    if (!term || term.length < 2 || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });

  return terms.slice(0, 8);
};

const normalizeSearchPhrase = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[#,/|]+/g, ' ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const parseResultLimit = (value, fallback = null, max = 80) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  return Math.min(parsed, max);
};

// Get all products
export const getProducts = async (req, res) => {
  try {
    const { category, search, limit: limitParam } = req.query;
    const searchTerms = tokenizeSearchTerms(search);
    const searchPhrase = normalizeSearchPhrase(search);
    const resultLimit = parseResultLimit(limitParam, null, 80);
    
    let selectClause = `
      SELECT p.*, c.name as category_name,
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status IN ('paid', 'completed')
      ), 0) as total_sold,
      COALESCE((
        SELECT ROUND(AVG(r.rating)::numeric, 1)
        FROM reviews r
        WHERE r.product_id = p.id
          AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      ), p.rating, 0) as review_rating,
      COALESCE((
        SELECT COUNT(*)
        FROM reviews r
        WHERE r.product_id = p.id
          AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
      ), 0) as review_count
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

    // Search by name and keyword/tag-style terms (e.g. "helmet, #modular")
    if (searchTerms.length > 0) {
      let relevanceScores = [];

      searchTerms.forEach((term) => {
        params.push(`%${term}%`);
        const containsIdx = params.length;
        params.push(`${term}%`);
        const prefixIdx = params.length;
        params.push(term);
        const exactIdx = params.length;
        
        whereClause += ` AND (
          p.name ILIKE $${containsIdx} OR 
          p.part_number ILIKE $${containsIdx} OR 
          p.description ILIKE $${containsIdx} OR 
          p.brand ILIKE $${containsIdx} OR 
          p.sku ILIKE $${containsIdx} OR 
          c.name ILIKE $${containsIdx}
        )`;

        relevanceScores.push(`
          (CASE WHEN LOWER(p.name) = $${exactIdx} THEN 160 ELSE 0 END) +
          (CASE WHEN LOWER(p.name) LIKE $${prefixIdx} THEN 65 ELSE 0 END) +
          (CASE WHEN p.name ILIKE $${containsIdx} THEN 35 ELSE 0 END) +
          (CASE WHEN p.part_number ILIKE $${containsIdx} THEN 28 ELSE 0 END) +
          (CASE WHEN p.sku ILIKE $${containsIdx} THEN 22 ELSE 0 END) +
          (CASE WHEN p.brand ILIKE $${containsIdx} THEN 16 ELSE 0 END) +
          (CASE WHEN c.name ILIKE $${containsIdx} THEN 12 ELSE 0 END) +
          (CASE WHEN p.description ILIKE $${containsIdx} THEN 7 ELSE 0 END)
        `);
      });

      if (searchPhrase) {
        params.push(`%${searchPhrase}%`);
        const phraseContainsIdx = params.length;
        params.push(`${searchPhrase}%`);
        const phrasePrefixIdx = params.length;
        relevanceScores.push(`
          (CASE WHEN LOWER(p.name) LIKE $${phrasePrefixIdx} THEN 120 ELSE 0 END) +
          (CASE WHEN LOWER(p.name) LIKE $${phraseContainsIdx} THEN 70 ELSE 0 END) +
          (CASE WHEN LOWER(p.description) LIKE $${phraseContainsIdx} THEN 24 ELSE 0 END)
        `);
      }

      selectClause += `, (${relevanceScores.join(' + ')}) as relevance_score`;
      orderByClause = 'ORDER BY relevance_score DESC, p.id DESC';
    } else {
      orderByClause = 'ORDER BY p.id DESC';
    }

    if (resultLimit) {
      params.push(resultLimit);
      orderByClause += ` LIMIT $${params.length}`;
    }

    const query = `${selectClause} ${fromClause} ${whereClause} ${orderByClause}`;
    const result = await pool.query(query, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      rating: parseFloat(product.review_rating ?? product.rating ?? 0),
      review_count: parseInt(product.review_count ?? 0, 10),
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

    const parsedLimit = Number.parseInt(String(limit), 10);
    const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 8;

    const params = [safeLimit];
    let whereClause = `WHERE o.status = 'completed'`;

    if (days && days !== 'all') {
      const parsedDays = Number.parseInt(String(days), 10);
      if (Number.isFinite(parsedDays) && parsedDays > 0) {
        params.push(parsedDays);
        whereClause += ` AND o.created_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`;
      }
    }

    // We MUST manually list columns instead of p.* because PostgreSQL strict GROUP BY
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.brand, p.part_number, p.image, p.description, 
        p.price, p.sale_price, p.is_on_sale, p.stock_quantity, p.rating, p.created_at,
        c.name as category_name,
        COALESCE((
          SELECT ROUND(AVG(r.rating)::numeric, 1)
          FROM reviews r
          WHERE r.product_id = p.id
            AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
        ), p.rating, 0) as review_rating,
        COALESCE((
          SELECT COUNT(*)
          FROM reviews r
          WHERE r.product_id = p.id
            AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
        ), 0) as review_count,
        SUM(oi.quantity) as total_sold
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      GROUP BY p.id, c.name
      ORDER BY total_sold DESC, p.id DESC
      LIMIT $1
    `, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      rating: parseFloat(product.review_rating ?? product.rating ?? 0),
      review_count: parseInt(product.review_count ?? 0, 10),
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
      `SELECT p.*, c.name as category_name,
              COALESCE((
                SELECT ROUND(AVG(r.rating)::numeric, 1)
                FROM reviews r
                WHERE r.product_id = p.id
                  AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
              ), p.rating, 0) as review_rating,
              COALESCE((
                SELECT COUNT(*)
                FROM reviews r
                WHERE r.product_id = p.id
                  AND COALESCE(r.review_status, CASE WHEN r.is_approved THEN 'approved' ELSE 'pending' END) = 'approved'
              ), 0) as review_count
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
      rating: parseFloat(product.review_rating ?? product.rating ?? 0),
      review_count: parseInt(product.review_count ?? 0, 10),
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
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status
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
    const cleanStatus = toNullableProductStatus(status);

    const result = await pool.query(
      `INSERT INTO products (
        part_number, name, description, price, buying_price, 
        image, category_id, stock_quantity, box_number, 
        low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, false), COALESCE($16, 'available'))
      RETURNING *`,
      [
        cleanPartNumber, name, description, price, buying_price,
        cleanImage, cleanCategoryId, cleanStockQuantity ?? 0, cleanBoxNumber,
        cleanLowStockThreshold ?? 5, cleanBrand, cleanSku, cleanBarcode, cleanSalePrice, cleanIsOnSale, cleanStatus
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
    low_stock_threshold, brand, sku, barcode, sale_price, is_on_sale, status
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
    const cleanStatus = toNullableProductStatus(status);

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
        status = COALESCE($16, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *`,
      [
        cleanPartNumber, name, description, price, buying_price,
        cleanImage, cleanCategoryId, cleanStockQuantity, cleanBoxNumber,
        cleanLowStockThreshold, cleanBrand, cleanSku, cleanBarcode, cleanSalePrice, cleanIsOnSale, cleanStatus, id
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
