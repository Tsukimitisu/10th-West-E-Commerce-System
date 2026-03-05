import pool from '../config/database.js';
import { emitProductCreated, emitProductUpdated, emitProductDeleted } from '../socket.js';
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
    
    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    // Filter by category
    if (category) {
      params.push(category);
      query += ` AND p.category_id = $${params.length}`;
    }

    // Search by name or part number
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${params.length} OR p.part_number ILIKE $${params.length})`;
    }

    query += ' ORDER BY p.id DESC';

    const result = await pool.query(query, params);
    
    res.json(result.rows.map(product => ({
      ...product,
      price: parseFloat(product.price),
      buying_price: parseFloat(product.buying_price),
      sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
      stock_quantity: parseInt(product.stock_quantity)
    })));
  } catch (error) {
    console.error('Get products error:', error);
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

    await fs.mkdir(uploadsDir, { recursive: true });

    const ext = MIME_EXTENSION_MAP[contentType] || 'bin';
    const filename = `product-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}.${ext}`;
    const filepath = path.join(uploadsDir, filename);

    await fs.writeFile(filepath, req.body);

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/products/${filename}`;

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
