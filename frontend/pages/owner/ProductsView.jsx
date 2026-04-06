import React, { useEffect, useRef, useState } from 'react';
import { getProducts, getCategories, getSubcategories, createProduct, updateProduct, deleteProduct, uploadProductImage, uploadProductVideo, addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory } from '../../services/api';
import { Plus, Pencil, Trash2, Search, Package, Eye, EyeOff, Copy, Download, Upload, Filter, MoreVertical, Image as ImageIcon, AlertTriangle, Layers, GripVertical, ChevronDown, Check, Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';
import Modal from '../../components/owner/Modal';
import VariantsModal from '../../components/owner/VariantsModal';
import { useSocketEvent } from '../../context/SocketContext';

const PRODUCT_FORM_STEPS = [
  { key: 'media', label: 'Media Upload', hint: 'Add product photos and optional video' },
  { key: 'info', label: 'Product Info', hint: 'Core details and category' },
  { key: 'pricing', label: 'Pricing & Stock', hint: 'Prices and inventory' },
  { key: 'variants', label: 'Variants', hint: 'Configure variant strategy' },
  { key: 'shipping', label: 'Shipping', hint: 'Fulfillment details' },
  { key: 'status', label: 'Status', hint: 'Visibility and sale state' },
];

const PRODUCT_MEDIA_MIN_FILES = 1;
const PRODUCT_MEDIA_MAX_FILES = 9;
const PRODUCT_MEDIA_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PRODUCT_MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const PRODUCT_MEDIA_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const PRODUCT_VIDEO_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const PRODUCT_VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,video/ogg,video/x-m4v';
const PRODUCT_VIDEO_ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
  'video/x-m4v',
]);
const SKU_MODE_AUTO = 'auto';
const SKU_MODE_MANUAL = 'manual';
const ALLOWED_SHIPPING_OPTIONS = new Set(['standard', 'express']);

const createProductMediaId = () => `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeSkuToken = (value, fallback = 'SKU') => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 22);

  return normalized || fallback;
};

const buildAutoSkuPreview = ({ partNumber, name }) => {
  const base = normalizeSkuToken(partNumber, '') || normalizeSkuToken(name, 'SKU');
  return `${base}-XXXXX`;
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const containsHtml = (value = '') => /<[a-z][\s\S]*>/i.test(String(value));

const normalizeDescriptionHtml = (value = '') => {
  const cleaned = String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .trim();

  if (!cleaned || cleaned === '<br>') return '';
  return cleaned;
};

const toDescriptionEditorHtml = (value = '') => {
  const cleaned = normalizeDescriptionHtml(value);
  if (!cleaned) return '';
  if (containsHtml(cleaned)) return cleaned;

  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const reorderMediaItemsById = (items, sourceId, targetId) => {
  if (!Array.isArray(items) || !sourceId || !targetId || sourceId === targetId) return items;

  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;

  const reordered = [...items];
  const [movedItem] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, movedItem);
  return reordered;
};

const hasDraggedFiles = (event) => Array.from(event?.dataTransfer?.types || []).includes('Files');

const normalizeProductMediaUrls = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item?.url || item?.image || ''))
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeProductMediaUrls(parsed);
      }
    } catch {
      // Parse as comma/newline delimited text when not JSON.
    }

    return trimmed
      .split(/[\n,|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const parseBulkPricingValue = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeBulkPricingDraft = (value) => {
  const parsed = parseBulkPricingValue(value);

  return parsed
    .map((tier) => {
      const minQty = Number(tier?.min_qty ?? tier?.minQty);
      const unitPrice = Number(tier?.unit_price ?? tier?.unitPrice);

      if (!Number.isInteger(minQty) || minQty < 2) return null;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;

      return {
        min_qty: String(minQty),
        unit_price: unitPrice.toFixed(2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));
};

const validateBulkPricingTiers = (tiers, regularPrice) => {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return { value: [] };
  }

  const normalized = [];
  const seenMinQty = new Set();

  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index] || {};
    const minQty = Number(tier.min_qty);
    const unitPrice = Number(tier.unit_price);

    if (!Number.isInteger(minQty) || minQty < 2) {
      return { error: `Bulk pricing row ${index + 1}: minimum quantity must be a whole number of 2 or more.` };
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { error: `Bulk pricing row ${index + 1}: unit price must be greater than 0.` };
    }

    if (seenMinQty.has(minQty)) {
      return { error: `Bulk pricing row ${index + 1}: duplicate minimum quantity ${minQty}.` };
    }

    if (Number.isFinite(regularPrice) && unitPrice >= regularPrice) {
      return { error: `Bulk pricing row ${index + 1}: unit price must be lower than the regular price.` };
    }

    seenMinQty.add(minQty);
    normalized.push({ min_qty: minQty, unit_price: unitPrice });
  }

  normalized.sort((a, b) => a.min_qty - b.min_qty);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].unit_price > normalized[index - 1].unit_price) {
      return { error: 'Bulk pricing unit price should stay the same or decrease for higher quantities.' };
    }
  }

  return { value: normalized };
};

const resolveExistingProductMediaItems = (product) => {
  const collected = [
    ...normalizeProductMediaUrls(product?.image_urls),
    ...normalizeProductMediaUrls(product?.gallery_images),
    ...normalizeProductMediaUrls(product?.image),
  ];

  const deduped = Array.from(new Set(collected.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, PRODUCT_MEDIA_MAX_FILES);

  return deduped.map((url) => ({
    id: createProductMediaId(),
    source: 'existing',
    previewUrl: url,
    url,
  }));
};

const resolveExistingProductVideoItem = (product) => {
  const videoUrl = String(product?.video_url || '').trim();
  if (!videoUrl) return null;

  return {
    id: createProductMediaId(),
    source: 'existing',
    previewUrl: videoUrl,
    url: videoUrl,
  };
};

const revokeLocalMediaPreview = (mediaItem) => {
  if (mediaItem?.source === 'local' && String(mediaItem?.previewUrl || '').startsWith('blob:')) {
    URL.revokeObjectURL(mediaItem.previewUrl);
  }
};

const revokeLocalVideoPreview = (videoItem) => {
  if (videoItem?.source === 'local' && String(videoItem?.previewUrl || '').startsWith('blob:')) {
    URL.revokeObjectURL(videoItem.previewUrl);
  }
};

const resolveShippingOptionDraft = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_SHIPPING_OPTIONS.has(normalized) ? normalized : 'standard';
};

const resolveShippingDimensionsDraft = (value) => {
  if (!value) {
    return {
      shipping_length_cm: '',
      shipping_width_cm: '',
      shipping_height_cm: '',
    };
  }

  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      shipping_length_cm: '',
      shipping_width_cm: '',
      shipping_height_cm: '',
    };
  }

  const normalizeDimension = (rawValue) => {
    if (rawValue === undefined || rawValue === null || rawValue === '') return '';
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return '';
    return String(parsedValue);
  };

  return {
    shipping_length_cm: normalizeDimension(parsed.length_cm ?? parsed.length),
    shipping_width_cm: normalizeDimension(parsed.width_cm ?? parsed.width),
    shipping_height_cm: normalizeDimension(parsed.height_cm ?? parsed.height),
  };
};

const createProductFormState = (overrides = {}) => ({
  partNumber: '',
  name: '',
  description: '',
  price: '',
  buyingPrice: '',
  category_id: '',
  subcategory_id: '',
  image: '',
  image_urls: [],
  video_url: '',
  stock_quantity: '0',
  boxNumber: '',
  low_stock_threshold: '5',
  sale_price: '',
  is_on_sale: false,
  bulk_pricing: [],
  sku: '',
  sku_mode: SKU_MODE_AUTO,
  barcode: '',
  brand: '',
  status: 'available',
  variant_notes: '',
  shipping_option: 'standard',
  shipping_weight_kg: '',
  shipping_length_cm: '',
  shipping_width_cm: '',
  shipping_height_cm: '',
  ...overrides,
});

const InputField = ({ label, required, children }) => (
  <div><label className="block text-xs font-medium text-gray-300 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>{children}</div>
);

const inputClass = "w-full px-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400";

const ProductsView = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [variantsModalOpen, setVariantsModalOpen] = useState(false);
  const [selectedProductVariants, setSelectedProductVariants] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [productMediaItems, setProductMediaItems] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const [productVideoItem, setProductVideoItem] = useState(null);
  const [videoError, setVideoError] = useState('');
  const [isMediaDragOver, setIsMediaDragOver] = useState(false);
  const [draggingMediaId, setDraggingMediaId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formStep, setFormStep] = useState(0);
  const [infoFieldErrors, setInfoFieldErrors] = useState({});
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [descriptionEditorInitialHtml, setDescriptionEditorInitialHtml] = useState('');
  const [descriptionEditorSeed, setDescriptionEditorSeed] = useState(0);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [editingSubcategoryId, setEditingSubcategoryId] = useState(null);
  const [editingSubcategoryName, setEditingSubcategoryName] = useState('');
  const [form, setForm] = useState(createProductFormState());
  const productMediaItemsRef = useRef([]);
  const productVideoItemRef = useRef(null);
  const galleryUploadInputRef = useRef(null);
  const cameraUploadInputRef = useRef(null);
  const videoUploadInputRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const descriptionEditorRef = useRef(null);

  const fetch = async () => {
    try {
      const [p, c, s] = await Promise.all([getProducts(), getCategories(), getSubcategories()]);
      setProducts(p); setCategories(c); setSubcategories(s || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  // Real-time: refresh on product/inventory changes
  useSocketEvent('product:created', fetch);
  useSocketEvent('product:updated', fetch);
  useSocketEvent('product:deleted', fetch);
  useSocketEvent('inventory:updated', fetch);

  useEffect(() => {
    productMediaItemsRef.current = productMediaItems;
  }, [productMediaItems]);

  useEffect(() => {
    productVideoItemRef.current = productVideoItem;
  }, [productVideoItem]);

  useEffect(() => {
    return () => {
      productMediaItemsRef.current.forEach(revokeLocalMediaPreview);
      revokeLocalVideoPreview(productVideoItemRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const resetProductMediaItems = (nextItems = []) => {
    productMediaItemsRef.current.forEach(revokeLocalMediaPreview);
    setProductMediaItems(nextItems);
    setMediaError('');
    setIsMediaDragOver(false);
    setDraggingMediaId(null);
  };

  const resetProductVideoItem = (nextItem = null) => {
    revokeLocalVideoPreview(productVideoItemRef.current);
    setProductVideoItem(nextItem);
    setVideoError('');
  };

  const getCategoryNameById = (categoryId) => {
    const selectedCategory = categories.find((category) => String(category.id) === String(categoryId || ''));
    return selectedCategory?.name || '';
  };

  const getInfoFieldErrors = (draftForm = form) => {
    const errors = {};

    if (!String(draftForm.name || '').trim()) {
      errors.name = 'Product name is required.';
    }

    if (!String(draftForm.category_id || '').trim()) {
      errors.category_id = 'Category is required.';
    }

    return errors;
  };

  const updateInlineInfoError = (fieldName, hasError, message) => {
    setInfoFieldErrors((prev) => {
      const next = { ...prev };
      if (hasError) next[fieldName] = message;
      else delete next[fieldName];
      return next;
    });
  };

  const syncDescriptionFromEditor = () => {
    const nextHtml = normalizeDescriptionHtml(descriptionEditorRef.current?.innerHTML || '');
    setForm((prev) => ({ ...prev, description: nextHtml }));
  };

  const executeDescriptionCommand = (command) => {
    if (!descriptionEditorRef.current) return;

    descriptionEditorRef.current.focus();
    document.execCommand(command, false);
    syncDescriptionFromEditor();
  };

  const handleDescriptionPaste = (event) => {
    event.preventDefault();
    const plainText = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, plainText);
    syncDescriptionFromEditor();
  };

  const handleCategorySearchChange = (event) => {
    const nextValue = event.target.value;
    setCategorySearchQuery(nextValue);
    setIsCategoryDropdownOpen(true);
    setForm((prev) => ({
      ...prev,
      category_id: '',
      subcategory_id: '',
    }));

    if (!nextValue.trim()) {
      updateInlineInfoError('category_id', true, 'Category is required.');
      return;
    }

    updateInlineInfoError('category_id', false, 'Category is required.');
  };

  const selectCategory = (category) => {
    setForm((prev) => ({
      ...prev,
      category_id: String(category.id),
      subcategory_id: '',
    }));
    setCategorySearchQuery(category.name);
    setIsCategoryDropdownOpen(false);
    updateInlineInfoError('category_id', false, 'Category is required.');
  };

  const openAdd = () => {
    const defaultCategoryId = categories[0]?.id?.toString() || '';
    const defaultCategoryName = categories[0]?.name || '';
    setEditing(null);
    resetProductMediaItems([]);
    resetProductVideoItem(null);
    setFormError('');
    setInfoFieldErrors({});
    setCategorySearchQuery(defaultCategoryName);
    setIsCategoryDropdownOpen(false);
    setDescriptionEditorInitialHtml('');
    setDescriptionEditorSeed((prev) => prev + 1);
    setFormStep(0);
    setForm(createProductFormState({ category_id: defaultCategoryId }));
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    resetProductMediaItems(resolveExistingProductMediaItems(p));
    resetProductVideoItem(resolveExistingProductVideoItem(p));
    setFormError('');
    setInfoFieldErrors({});
    setCategorySearchQuery(getCategoryNameById(p.category_id));
    setIsCategoryDropdownOpen(false);
    setDescriptionEditorInitialHtml(toDescriptionEditorHtml(p.description || ''));
    setDescriptionEditorSeed((prev) => prev + 1);
    setFormStep(0);
    const normalizedBulkPricing = normalizeBulkPricingDraft(p.bulk_pricing);
    const shippingDimensionsDraft = resolveShippingDimensionsDraft(p.shipping_dimensions);
    setForm(createProductFormState({
      partNumber: p.partNumber || '',
      name: p.name,
      description: p.description || '',
      price: p.price.toString(),
      buyingPrice: p.buyingPrice?.toString() || '',
      category_id: p.category_id?.toString() || '',
      subcategory_id: p.subcategory_id?.toString() || '',
      image: p.image || '',
      stock_quantity: p.stock_quantity.toString(),
      boxNumber: p.boxNumber || '',
      low_stock_threshold: p.low_stock_threshold.toString(),
      sale_price: p.sale_price?.toString() || '',
      is_on_sale: p.is_on_sale || false,
      sku: p.sku || '',
      sku_mode: p.sku ? SKU_MODE_MANUAL : SKU_MODE_AUTO,
      barcode: p.barcode || '',
      brand: p.brand || '',
      status: p.status || (p.stock_quantity === 0 ? 'out_of_stock' : 'available'),
      shipping_option: resolveShippingOptionDraft(p.shipping_option),
      shipping_weight_kg: p.shipping_weight_kg !== undefined && p.shipping_weight_kg !== null ? String(p.shipping_weight_kg) : '',
      shipping_length_cm: shippingDimensionsDraft.shipping_length_cm,
      shipping_width_cm: shippingDimensionsDraft.shipping_width_cm,
      shipping_height_cm: shippingDimensionsDraft.shipping_height_cm,
      image_urls: normalizeProductMediaUrls(p.image_urls),
      video_url: p.video_url || '',
      bulk_pricing: normalizedBulkPricing,
    }));
    setModalOpen(true);
  };

  const handleDuplicate = (p) => {
    setEditing(null);
    resetProductMediaItems(resolveExistingProductMediaItems(p));
    resetProductVideoItem(resolveExistingProductVideoItem(p));
    setFormError('');
    setInfoFieldErrors({});
    setCategorySearchQuery(getCategoryNameById(p.category_id));
    setIsCategoryDropdownOpen(false);
    setDescriptionEditorInitialHtml(toDescriptionEditorHtml(p.description || ''));
    setDescriptionEditorSeed((prev) => prev + 1);
    setFormStep(0);
    const normalizedBulkPricing = normalizeBulkPricingDraft(p.bulk_pricing);
    const shippingDimensionsDraft = resolveShippingDimensionsDraft(p.shipping_dimensions);
    setForm(createProductFormState({
      partNumber: '',
      name: `${p.name} (Copy)`,
      description: p.description || '',
      price: p.price.toString(),
      buyingPrice: p.buyingPrice?.toString() || '',
      category_id: p.category_id?.toString() || '',
      subcategory_id: p.subcategory_id?.toString() || '',
      image: p.image || '',
      stock_quantity: '0',
      boxNumber: p.boxNumber || '',
      low_stock_threshold: p.low_stock_threshold.toString(),
      sale_price: p.sale_price?.toString() || '',
      is_on_sale: false,
      sku: '',
      sku_mode: SKU_MODE_AUTO,
      barcode: '',
      brand: p.brand || '',
      status: p.status || 'available',
      shipping_option: resolveShippingOptionDraft(p.shipping_option),
      shipping_weight_kg: p.shipping_weight_kg !== undefined && p.shipping_weight_kg !== null ? String(p.shipping_weight_kg) : '',
      shipping_length_cm: shippingDimensionsDraft.shipping_length_cm,
      shipping_width_cm: shippingDimensionsDraft.shipping_width_cm,
      shipping_height_cm: shippingDimensionsDraft.shipping_height_cm,
      image_urls: normalizeProductMediaUrls(p.image_urls),
      video_url: p.video_url || '',
      bulk_pricing: normalizedBulkPricing,
    }));
    setModalOpen(true);
  };

  const getStepValidationError = (stepIndex) => {
    if (stepIndex === 0) {
      if (productMediaItems.length < PRODUCT_MEDIA_MIN_FILES) {
        return 'Upload at least one product image.';
      }
      if (productMediaItems.length > PRODUCT_MEDIA_MAX_FILES) {
        return `You can upload up to ${PRODUCT_MEDIA_MAX_FILES} images.`;
      }
    }

    if (stepIndex === 1) {
      const infoErrors = getInfoFieldErrors(form);
      if (Object.keys(infoErrors).length > 0) {
        return infoErrors.name || infoErrors.category_id;
      }
    }

    if (stepIndex === 2) {
      const price = Number(form.price);
      const stockQty = Number(form.stock_quantity);
      const lowStockThreshold = Number(form.low_stock_threshold);
      const hasBuyingPrice = String(form.buyingPrice || '').trim() !== '';
      const buyingPrice = hasBuyingPrice ? Number(form.buyingPrice) : null;

      if (!Number.isFinite(price) || price <= 0) return 'Price must be greater than 0.';
      if (hasBuyingPrice && (!Number.isFinite(buyingPrice) || buyingPrice < 0)) return 'Buying price must be 0 or higher.';
      if (!Number.isInteger(stockQty) || stockQty < 0) return 'Stock must be a whole number 0 or higher.';
      if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return 'Low stock alert must be a whole number 0 or higher.';

      if (form.sku_mode === SKU_MODE_MANUAL && !String(form.sku || '').trim()) {
        return 'Manual SKU is required when SKU mode is set to manual.';
      }

      const bulkValidation = validateBulkPricingTiers(form.bulk_pricing, price);
      if (bulkValidation.error) {
        return bulkValidation.error;
      }
    }

    if (stepIndex === 4) {
      if (!ALLOWED_SHIPPING_OPTIONS.has(String(form.shipping_option || '').toLowerCase())) {
        return 'Shipping option must be either Standard or Express.';
      }

      const shippingWeight = Number(form.shipping_weight_kg);
      if (!Number.isFinite(shippingWeight) || shippingWeight <= 0) {
        return 'Shipping weight is required and must be greater than 0.';
      }

      const lengthRaw = String(form.shipping_length_cm || '').trim();
      const widthRaw = String(form.shipping_width_cm || '').trim();
      const heightRaw = String(form.shipping_height_cm || '').trim();
      const hasAnyDimension = [lengthRaw, widthRaw, heightRaw].some(Boolean);

      if (hasAnyDimension && [lengthRaw, widthRaw, heightRaw].some((value) => !value)) {
        return 'Provide complete dimensions (length, width, height) or leave all blank.';
      }

      if (hasAnyDimension) {
        const dimensions = [
          ['Length', Number(lengthRaw)],
          ['Width', Number(widthRaw)],
          ['Height', Number(heightRaw)],
        ];

        for (const [label, value] of dimensions) {
          if (!Number.isFinite(value) || value <= 0) {
            return `${label} must be greater than 0.`;
          }
        }
      }
    }

    if (stepIndex === 5) {
      if (!['available', 'hidden', 'out_of_stock'].includes(String(form.status || ''))) {
        return 'Select a valid product status.';
      }

      if (form.is_on_sale) {
        const regularPrice = Number(form.price);
        const salePrice = Number(form.sale_price);
        if (!Number.isFinite(salePrice) || salePrice <= 0) {
          return 'Sale price must be greater than 0 when sale is enabled.';
        }
        if (Number.isFinite(regularPrice) && salePrice >= regularPrice) {
          return 'Sale price should be lower than the regular price.';
        }
      }
    }

    return '';
  };

  const goToStep = (nextStep) => {
    if (nextStep < 0 || nextStep >= PRODUCT_FORM_STEPS.length) return;

    if (nextStep > formStep) {
      for (let stepIndex = formStep; stepIndex < nextStep; stepIndex += 1) {
        const stepError = getStepValidationError(stepIndex);
        if (stepError) {
          if (stepIndex === 1) {
            setInfoFieldErrors(getInfoFieldErrors(form));
          }
          setFormError(stepError);
          setFormStep(stepIndex);
          return;
        }
      }
    }

    setFormError('');
    setFormStep(nextStep);
  };

  const validateAllSteps = () => {
    for (let stepIndex = 0; stepIndex < PRODUCT_FORM_STEPS.length; stepIndex += 1) {
      const stepError = getStepValidationError(stepIndex);
      if (stepError) {
        if (stepIndex === 1) {
          setInfoFieldErrors(getInfoFieldErrors(form));
        }
        setFormError(stepError);
        setFormStep(stepIndex);
        return false;
      }
    }

    return true;
  };

  const handleProductMediaFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const nextMediaItems = [];
    const validationErrors = [];
    let mediaCount = productMediaItemsRef.current.length;

    files.forEach((file) => {
      if (mediaCount >= PRODUCT_MEDIA_MAX_FILES) {
        validationErrors.push(`You can upload up to ${PRODUCT_MEDIA_MAX_FILES} images only.`);
        return;
      }

      const mimeType = String(file?.type || '').toLowerCase();
      if (!PRODUCT_MEDIA_ALLOWED_TYPES.has(mimeType)) {
        validationErrors.push(`${file.name || 'File'} is not a supported image type.`);
        return;
      }

      if (Number(file?.size || 0) > PRODUCT_MEDIA_MAX_SIZE_BYTES) {
        validationErrors.push(`${file.name || 'File'} exceeds the 5MB size limit.`);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      nextMediaItems.push({
        id: createProductMediaId(),
        source: 'local',
        file,
        previewUrl,
      });
      mediaCount += 1;
    });

    if (nextMediaItems.length > 0) {
      setProductMediaItems((prev) => [...prev, ...nextMediaItems]);
      setMediaError('');
    }

    if (validationErrors.length > 0) {
      setMediaError(validationErrors[0]);
    }
  };

  const handleGalleryUploadChange = (event) => {
    handleProductMediaFiles(event.target.files);
    event.target.value = '';
  };

  const handleCameraUploadChange = (event) => {
    handleProductMediaFiles(event.target.files);
    event.target.value = '';
  };

  const handleVideoUploadChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const mimeType = String(file.type || '').toLowerCase();
    if (!PRODUCT_VIDEO_ALLOWED_TYPES.has(mimeType)) {
      setVideoError('Unsupported video type. Use MP4, WEBM, MOV, OGG, or M4V.');
      return;
    }

    if (Number(file.size || 0) > PRODUCT_VIDEO_MAX_SIZE_BYTES) {
      setVideoError('Video exceeds the 20MB size limit.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setProductVideoItem((prev) => {
      revokeLocalVideoPreview(prev);
      return {
        id: createProductMediaId(),
        source: 'local',
        file,
        previewUrl,
        url: null,
      };
    });
    setVideoError('');
  };

  const handleMediaDrop = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsMediaDragOver(false);
    handleProductMediaFiles(event.dataTransfer?.files);
  };

  const handleMediaItemDragStart = (event, mediaItemId) => {
    setDraggingMediaId(mediaItemId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', mediaItemId);
    }
  };

  const handleMediaItemDragOver = (event, targetMediaId) => {
    event.preventDefault();
    if (!draggingMediaId || draggingMediaId === targetMediaId) return;

    event.dataTransfer.dropEffect = 'move';
    setProductMediaItems((prev) => reorderMediaItemsById(prev, draggingMediaId, targetMediaId));
  };

  const handleMediaItemDrop = (event, targetMediaId) => {
    event.preventDefault();
    if (!draggingMediaId || draggingMediaId === targetMediaId) return;

    setProductMediaItems((prev) => reorderMediaItemsById(prev, draggingMediaId, targetMediaId));
  };

  const handleMediaItemDragEnd = () => {
    setDraggingMediaId(null);
  };

  const removeProductMediaItem = (mediaItemId) => {
    setProductMediaItems((prev) => {
      const target = prev.find((item) => item.id === mediaItemId);
      if (target) {
        revokeLocalMediaPreview(target);
      }
      return prev.filter((item) => item.id !== mediaItemId);
    });
    setMediaError('');
  };

  const removeProductVideoItem = () => {
    resetProductVideoItem(null);
  };

  const setSkuMode = (nextMode) => {
    if (nextMode !== SKU_MODE_AUTO && nextMode !== SKU_MODE_MANUAL) return;

    setForm((prev) => {
      if (nextMode === SKU_MODE_AUTO) {
        return { ...prev, sku_mode: SKU_MODE_AUTO, sku: '' };
      }

      return { ...prev, sku_mode: SKU_MODE_MANUAL };
    });
  };

  const addBulkPricingTier = () => {
    setForm((prev) => ({
      ...prev,
      bulk_pricing: [...(prev.bulk_pricing || []), { min_qty: '', unit_price: '' }],
    }));
  };

  const updateBulkPricingTier = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      bulk_pricing: (prev.bulk_pricing || []).map((tier, tierIndex) => (
        tierIndex === index ? { ...tier, [field]: value } : tier
      )),
    }));
  };

  const removeBulkPricingTier = (index) => {
    setForm((prev) => ({
      ...prev,
      bulk_pricing: (prev.bulk_pricing || []).filter((_, tierIndex) => tierIndex !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAllSteps()) return;

    try {
      setSubmitting(true);
      setFormError('');

      const uploadedMediaUrls = [];
      for (const mediaItem of productMediaItems) {
        if (mediaItem.source === 'existing' && mediaItem.url) {
          uploadedMediaUrls.push(String(mediaItem.url).trim());
          continue;
        }

        if (mediaItem.source === 'local' && mediaItem.file) {
          try {
            const uploadedUrl = await uploadProductImage(mediaItem.file);
            uploadedMediaUrls.push(String(uploadedUrl || '').trim());
          } catch (uploadError) {
            throw new Error(`Failed to upload ${mediaItem.file.name || 'an image'}. ${uploadError?.message || 'Please try again.'}`);
          }
        }
      }

      const normalizedMediaUrls = Array.from(new Set(uploadedMediaUrls.filter(Boolean))).slice(0, PRODUCT_MEDIA_MAX_FILES);
      if (normalizedMediaUrls.length < PRODUCT_MEDIA_MIN_FILES) {
        throw new Error('Upload at least one product image before saving.');
      }

      let uploadedVideoUrl = null;
      if (productVideoItem?.source === 'existing' && productVideoItem.url) {
        uploadedVideoUrl = String(productVideoItem.url).trim();
      }

      if (productVideoItem?.source === 'local' && productVideoItem.file) {
        try {
          const nextVideoUrl = await uploadProductVideo(productVideoItem.file);
          uploadedVideoUrl = String(nextVideoUrl || '').trim();
        } catch (uploadError) {
          throw new Error(`Failed to upload ${productVideoItem.file.name || 'the video'}. ${uploadError?.message || 'Please try again.'}`);
        }
      }

      const finalImage = normalizedMediaUrls[0];
      const regularPrice = Number(form.price);
      const bulkPricingValidation = validateBulkPricingTiers(form.bulk_pricing, regularPrice);
      if (bulkPricingValidation.error) {
        throw new Error(bulkPricingValidation.error);
      }

      const manualSku = String(form.sku || '').trim();
      const shouldAutoGenerateSku = form.sku_mode === SKU_MODE_AUTO || !manualSku;
      const hasBuyingPrice = String(form.buyingPrice || '').trim() !== '';
      const hasSalePrice = String(form.sale_price || '').trim() !== '';
      const shippingOption = resolveShippingOptionDraft(form.shipping_option);
      const shippingWeightKg = Number(form.shipping_weight_kg);
      if (!Number.isFinite(shippingWeightKg) || shippingWeightKg <= 0) {
        throw new Error('Shipping weight is required and must be greater than 0.');
      }

      const shippingLengthRaw = String(form.shipping_length_cm || '').trim();
      const shippingWidthRaw = String(form.shipping_width_cm || '').trim();
      const shippingHeightRaw = String(form.shipping_height_cm || '').trim();
      const hasAnyShippingDimension = [shippingLengthRaw, shippingWidthRaw, shippingHeightRaw].some(Boolean);

      if (hasAnyShippingDimension && [shippingLengthRaw, shippingWidthRaw, shippingHeightRaw].some((value) => !value)) {
        throw new Error('Provide complete dimensions (length, width, height) or leave all blank.');
      }

      let shippingDimensionsPayload = null;
      if (hasAnyShippingDimension) {
        const lengthCm = Number(shippingLengthRaw);
        const widthCm = Number(shippingWidthRaw);
        const heightCm = Number(shippingHeightRaw);

        if (!Number.isFinite(lengthCm) || lengthCm <= 0) {
          throw new Error('Length must be greater than 0.');
        }
        if (!Number.isFinite(widthCm) || widthCm <= 0) {
          throw new Error('Width must be greater than 0.');
        }
        if (!Number.isFinite(heightCm) || heightCm <= 0) {
          throw new Error('Height must be greater than 0.');
        }

        shippingDimensionsPayload = {
          length_cm: Number(lengthCm.toFixed(2)),
          width_cm: Number(widthCm.toFixed(2)),
          height_cm: Number(heightCm.toFixed(2)),
          unit: 'cm',
        };
      }

      const payload = {
        partNumber: form.partNumber,
        name: form.name,
        description: form.description,
        price: regularPrice,
        buyingPrice: hasBuyingPrice ? Number(form.buyingPrice) : undefined,
        category_id: parseInt(form.category_id, 10),
        subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id, 10) : null,
        image: finalImage,
        image_urls: normalizedMediaUrls,
        video_url: uploadedVideoUrl || null,
        stock_quantity: parseInt(form.stock_quantity, 10),
        shipping_option: shippingOption,
        shipping_weight_kg: shippingWeightKg,
        shipping_dimensions: shippingDimensionsPayload,
        boxNumber: form.boxNumber,
        low_stock_threshold: form.low_stock_threshold === '' ? undefined : parseInt(form.low_stock_threshold, 10),
        sale_price: form.is_on_sale && hasSalePrice ? Number(form.sale_price) : null,
        is_on_sale: form.is_on_sale,
        status: form.status,
        sku: shouldAutoGenerateSku ? undefined : manualSku,
        auto_generate_sku: shouldAutoGenerateSku,
        bulk_pricing: bulkPricingValidation.value,
        barcode: form.partNumber || form.barcode,
        brand: form.brand
      };

      if (editing) await updateProduct(editing.id, payload);
      else await createProduct(payload);
      fetch();
      setTimeout(() => closeProductModal(), 100);
    } catch (e) {
      setFormError(e.message || 'Failed to save product');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (p) => {
    setDeleteTarget(p);
  };

  const closeProductModal = () => {
    setModalOpen(false);
    resetProductMediaItems([]);
    resetProductVideoItem(null);
    setFormError('');
    setInfoFieldErrors({});
    setCategorySearchQuery('');
    setIsCategoryDropdownOpen(false);
    setDescriptionEditorInitialHtml('');
    setDescriptionEditorSeed((prev) => prev + 1);
    setMediaError('');
    setVideoError('');
    setIsMediaDragOver(false);
    setDraggingMediaId(null);
  };

  const openCategoryModal = () => {
    setCategoryError('');
    setNewCategoryName('');
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setCategoryModalOpen(true);
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      setCategoryError('Category name is required');
      return;
    }

    try {
      setCategorySubmitting(true);
      setCategoryError('');
      const created = await addCategory(name);
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(prev => ({ ...prev, category_id: created.id.toString() }));
      setCategorySearchQuery(created.name);
      setIsCategoryDropdownOpen(false);
      updateInlineInfoError('category_id', false, 'Category is required.');
      setNewCategoryName('');
    } catch (e) {
      setCategoryError(e.message || 'Failed to create category');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const startEditCategory = (category) => {
    setCategoryError('');
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setCategoryError('');
  };

  const handleUpdateCategory = async (categoryId) => {
    const name = editingCategoryName.trim();
    if (!name) {
      setCategoryError('Category name is required');
      return;
    }

    try {
      setCategorySubmitting(true);
      setCategoryError('');
      const updated = await updateCategory(categoryId, name);
      setCategories(prev => prev.map(c => (c.id === categoryId ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingCategoryId(null);
      setEditingCategoryName('');
    } catch (e) {
      setCategoryError(e.message || 'Failed to update category');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    try {
      setCategorySubmitting(true);
      setCategoryError('');
      await deleteCategory(category.id);
      setCategories(prev => prev.filter(c => c.id !== category.id));
      setForm(prev => ({ ...prev, category_id: prev.category_id === category.id.toString() ? '' : prev.category_id }));
      if (form.category_id === category.id.toString()) {
        setCategorySearchQuery('');
        updateInlineInfoError('category_id', true, 'Category is required.');
      }
      setFilterCat(prev => (prev === category.id.toString() ? '' : prev));
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setEditingCategoryName('');
      }
    } catch (e) {
      setCategoryError(e.message || 'Failed to delete category. It may still be used by products.');
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleCreateSubcategory = async (e) => {
    e.preventDefault();
    const name = newSubcategoryName.trim();
    if (!name || !form.category_id) return;
    try {
      setCategorySubmitting(true); setCategoryError('');
      const created = await addSubcategory({ name, category_id: parseInt(form.category_id, 10) });
      setSubcategories(prev => [...prev, created].sort((a,b) => a.name.localeCompare(b.name)));
      setForm(prev => ({ ...prev, subcategory_id: created.id.toString() }));
      setNewSubcategoryName('');
    } catch (e) { setCategoryError(e.message || 'Failed to create subcategory'); }
    finally { setCategorySubmitting(false); }
  };

  const handleUpdateSubcategory = async (id) => {
    const name = editingSubcategoryName.trim();
    if (!name) return;
    try {
      setCategorySubmitting(true); setCategoryError('');
      const updated = await updateSubcategory(id, name);
      setSubcategories(prev => prev.map(s => s.id === id ? updated : s).sort((a,b) => a.name.localeCompare(b.name)));
      setEditingSubcategoryId(null); setEditingSubcategoryName('');
    } catch (e) { setCategoryError(e.message || 'Failed to update subcategory'); }
    finally { setCategorySubmitting(false); }
  };

  const handleDeleteSubcategory = async (subcat) => {
    if (!window.confirm(`Delete subcategory "${subcat.name}"?`)) return;
    try {
      setCategorySubmitting(true); setCategoryError('');
      await deleteSubcategory(subcat.id);
      setSubcategories(prev => prev.filter(s => s.id !== subcat.id));
      setForm(prev => ({ ...prev, subcategory_id: prev.subcategory_id === subcat.id.toString() ? '' : prev.subcategory_id }));
    } catch (e) { setCategoryError(e.message || 'Failed to delete subcategory'); }
    finally { setCategorySubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteProduct(deleteTarget.id); fetch(); } catch (e) { console.error(e); }
    setDeleteTarget(null);
  };

  const filtered = products.filter(p => {
    const term = search.toLowerCase();
    const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.partNumber?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term);
    const matchesCat = !filterCat || p.category_id.toString() === filterCat;
    const matchesStock = !filterStock || (filterStock === 'low' && p.stock_quantity <= p.low_stock_threshold) || (filterStock === 'out' && p.stock_quantity === 0) || (filterStock === 'in' && p.stock_quantity > 0);
    return matchesSearch && matchesCat && matchesStock;
  });

  const filteredCategoryOptions = categories.filter((category) => (
    category.name.toLowerCase().includes(categorySearchQuery.trim().toLowerCase())
  ));



  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-white">Products</h1>
          <p className="text-sm text-gray-400">{products.length} total products</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search products, SKU, barcode..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="px-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className="px-3 py-2 border border-white/10 bg-[#202430] text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20">
          <option value="">All Stock</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-white/10 border-t-red-500 rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#202430]/80 border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300 hidden md:table-cell">SKU / Barcode</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Category</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300">Price</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-300">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-300 w-24">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map(p => {
                  const cat = categories.find(c => c.id === p.category_id);
                  const subcat = subcategories.find(s => s.id === p.subcategory_id);
                  const normalizedStatus = String(p.status || '').toLowerCase();
                  const displayStatus = normalizedStatus === 'hidden'
                    ? 'Hidden'
                    : normalizedStatus === 'out_of_stock' || p.stock_quantity === 0
                      ? 'Out of Stock'
                      : p.stock_quantity <= p.low_stock_threshold
                        ? 'Low Stock'
                        : 'Available';
                  const displayStatusClass = normalizedStatus === 'hidden'
                    ? 'bg-slate-500/20 text-slate-300'
                    : normalizedStatus === 'out_of_stock' || p.stock_quantity === 0
                      ? 'bg-red-500/20 text-red-400'
                      : p.stock_quantity <= p.low_stock_threshold
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-green-500/20 text-green-400';
                  return (
                    <tr key={p.id} className="hover:bg-[#202430]/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#202430] rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                            {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={16} className="m-auto text-gray-400 mt-2.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white text-sm truncate max-w-[200px]">{p.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{p.partNumber || 'â€”'}</p>
                          </div>
                          {p.is_on_sale && <span className="ml-1 px-1.5 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded">SALE</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs font-mono text-gray-500">{p.sku || 'â€”'}</p>
                        <p className="text-[10px] font-mono text-gray-400">{p.barcode || 'â€”'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-300 block">{cat?.name || '—'}</span>
                        {subcat && <span className="text-[10px] text-gray-400 block">{subcat.name}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.is_on_sale ? (
                          <div><span className="text-xs text-gray-400 line-through">₱{p.price}</span><br /><span className="text-red-500 font-medium">₱{p.sale_price}</span></div>
                        ) : <span className="font-medium text-white">₱{p.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-sm ${p.stock_quantity === 0 ? 'text-red-400' : p.stock_quantity <= p.low_stock_threshold ? 'text-amber-400' : 'text-white'}`}>
                          {p.stock_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${displayStatusClass}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedProductVariants(p); setVariantsModalOpen(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-green-400 transition-colors" title="Manage Variants"><Layers size={14} /></button>
                          <button onClick={() => openEdit(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-blue-400 transition-colors" title="Edit"><Pencil size={14} /></button>
                          <button onClick={() => handleDuplicate(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-purple-400 transition-colors" title="Duplicate"><Copy size={14} /></button>
                          <button onClick={() => handleDelete(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#202430] text-gray-500 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={closeProductModal} title={editing ? 'Edit Product' : 'Add Product'} size="2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-300">
                  Step {formStep + 1} of {PRODUCT_FORM_STEPS.length}
                </p>
                <p className="text-[11px] text-gray-500">
                  {PRODUCT_FORM_STEPS[formStep]?.hint}
                </p>
              </div>
              <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2">
                  {PRODUCT_FORM_STEPS.map((step, index) => (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => goToStep(index)}
                      className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                        index === formStep
                          ? 'border-red-400/50 bg-red-500/10'
                          : index < formStep
                            ? 'border-emerald-400/40 bg-emerald-500/10'
                            : 'border-white/10 bg-[#202430]/50 hover:bg-[#202430]'
                      }`}
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                        index === formStep
                          ? 'bg-red-500 text-white'
                          : index < formStep
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white/10 text-gray-300'
                      }`}>
                        {index + 1}
                      </span>
                      <span className="text-xs font-medium text-gray-200 whitespace-nowrap">{step.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div key={PRODUCT_FORM_STEPS[formStep]?.key} className="space-y-4 rounded-xl border border-white/10 bg-[#171a22] p-4 sm:p-5 animate-fade-in">
              <h4 className="text-sm font-semibold text-white">{PRODUCT_FORM_STEPS[formStep]?.label}</h4>

              {formStep === 0 && (
                <div className="space-y-4">
                  <div
                    onDragOver={(event) => {
                      if (!hasDraggedFiles(event)) return;
                      event.preventDefault();
                      setIsMediaDragOver(true);
                    }}
                    onDragLeave={(event) => {
                      if (!hasDraggedFiles(event)) return;
                      event.preventDefault();
                      setIsMediaDragOver(false);
                    }}
                    onDrop={handleMediaDrop}
                    className={`rounded-2xl border-2 border-dashed p-5 transition-colors ${
                      isMediaDragOver
                        ? 'border-red-400 bg-red-500/10'
                        : 'border-white/15 bg-[#202430]/40'
                    }`}
                  >
                    <input
                      ref={galleryUploadInputRef}
                      type="file"
                      accept={PRODUCT_MEDIA_ACCEPT}
                      multiple
                      onChange={handleGalleryUploadChange}
                      className="hidden"
                    />
                    <input
                      ref={cameraUploadInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCameraUploadChange}
                      className="hidden"
                    />
                    <input
                      ref={videoUploadInputRef}
                      type="file"
                      accept={PRODUCT_VIDEO_ACCEPT}
                      onChange={handleVideoUploadChange}
                      className="hidden"
                    />

                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                        <Upload size={20} className="text-red-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Drag and drop product photos here</p>
                        <p className="text-xs text-gray-400 mt-1">Upload 1-9 images. JPG, PNG, WEBP, or GIF. Up to 5MB each.</p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => galleryUploadInputRef.current?.click()}
                          className="px-4 py-2 bg-red-500/100 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Select Images
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraUploadInputRef.current?.click()}
                          className="px-4 py-2 bg-[#2a3244] hover:bg-[#37425b] text-gray-100 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Use Camera
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{productMediaItems.length}/{PRODUCT_MEDIA_MAX_FILES} images selected</span>
                    {productMediaItems.length < PRODUCT_MEDIA_MIN_FILES && (
                      <span className="text-amber-300">At least 1 image is required</span>
                    )}
                  </div>

                  {productMediaItems.length > 1 && (
                    <p className="text-[11px] text-gray-400">Drag images to reorder. The first image is saved as the cover image.</p>
                  )}

                  {productMediaItems.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {productMediaItems.map((item, index) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(event) => handleMediaItemDragStart(event, item.id)}
                          onDragOver={(event) => handleMediaItemDragOver(event, item.id)}
                          onDrop={(event) => handleMediaItemDrop(event, item.id)}
                          onDragEnd={handleMediaItemDragEnd}
                          className={`relative group rounded-xl overflow-hidden border bg-[#202430] transition-all ${
                            draggingMediaId === item.id
                              ? 'border-red-400/70 ring-2 ring-red-400/40 opacity-80 scale-[0.98]'
                              : 'border-white/10 hover:border-white/25'
                          }`}
                        >
                          <img src={item.previewUrl} alt={`Media ${index + 1}`} className="w-full aspect-square object-cover" />
                          <div className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/70 text-white/90 flex items-center justify-center cursor-grab active:cursor-grabbing" title="Drag to reorder">
                            <GripVertical size={13} />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeProductMediaItem(item.id)}
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                          <div className="absolute bottom-0 inset-x-0 px-2 py-1 text-[10px] text-white bg-gradient-to-t from-black/70 to-transparent">
                            {index === 0 ? 'Cover Image' : `Image ${index + 1}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-2xl border border-white/10 bg-[#202430]/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Optional Product Video</p>
                        <p className="text-xs text-gray-400 mt-1">Upload a short video (MP4, WEBM, MOV, OGG, or M4V) up to 20MB.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => videoUploadInputRef.current?.click()}
                          className="px-3 py-1.5 bg-[#2a3244] hover:bg-[#37425b] text-gray-100 text-xs font-semibold rounded-lg transition-colors"
                        >
                          {productVideoItem ? 'Replace Video' : 'Upload Video'}
                        </button>
                        {productVideoItem && (
                          <button
                            type="button"
                            onClick={removeProductVideoItem}
                            className="px-3 py-1.5 bg-red-500/90 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {productVideoItem ? (
                      <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
                        <video
                          key={productVideoItem.id}
                          src={productVideoItem.previewUrl}
                          controls
                          preload="metadata"
                          className="w-full max-h-64 object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No product video selected.</p>
                    )}

                    {videoError && (
                      <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                        {videoError}
                      </div>
                    )}
                  </div>

                  {mediaError && (
                    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      {mediaError}
                    </div>
                  )}
                </div>
              )}

              {formStep === 1 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <InputField label="Product Name" required>
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={form.name}
                          onChange={(event) => {
                            const nextName = event.target.value;
                            setForm((prev) => ({ ...prev, name: nextName }));
                            updateInlineInfoError('name', !String(nextName || '').trim(), 'Product name is required.');
                          }}
                          onBlur={() => updateInlineInfoError('name', !String(form.name || '').trim(), 'Product name is required.')}
                          className={`${inputClass} ${infoFieldErrors.name ? 'border-red-400 focus:border-red-400 focus:ring-red-400/25' : ''}`}
                          placeholder="Front Brake Pad Set"
                        />
                        {infoFieldErrors.name && (
                          <p className="text-xs text-red-300">{infoFieldErrors.name}</p>
                        )}
                      </div>
                    </InputField>

                    <InputField label="Brand">
                      <input
                        value={form.brand}
                        onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                        className={inputClass}
                        placeholder="Honda"
                      />
                    </InputField>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <InputField label="Category" required>
                      <div className="space-y-2" ref={categoryDropdownRef}>
                        <div className={`relative rounded-lg border bg-[#202430] ${infoFieldErrors.category_id ? 'border-red-400' : 'border-white/10'}`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Search size={15} className="text-gray-400" />
                            <input
                              type="text"
                              value={categorySearchQuery}
                              onChange={handleCategorySearchChange}
                              onFocus={() => setIsCategoryDropdownOpen(true)}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setIsCategoryDropdownOpen(false);
                                  updateInlineInfoError('category_id', !String(form.category_id || '').trim(), 'Category is required.');
                                }, 120);
                              }}
                              className="flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none"
                              placeholder="Search category..."
                            />
                            <button
                              type="button"
                              onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                              className="text-gray-400 hover:text-gray-200"
                              aria-label="Toggle category options"
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>

                          {isCategoryDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-[#1b1f2a] z-30 shadow-xl">
                              {filteredCategoryOptions.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-gray-400">No categories found.</p>
                              ) : (
                                filteredCategoryOptions.map((category) => (
                                  <button
                                    key={category.id}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      selectCategory(category);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-100 hover:bg-[#252c3d] flex items-center justify-between"
                                  >
                                    <span>{category.name}</span>
                                    {String(form.category_id || '') === String(category.id) && (
                                      <Check size={14} className="text-emerald-300" />
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        {infoFieldErrors.category_id && (
                          <p className="text-xs text-red-300">{infoFieldErrors.category_id}</p>
                        )}

                        <button type="button" onClick={openCategoryModal} className="text-xs font-medium text-red-400 hover:text-red-300">
                          + Manage Categories
                        </button>
                      </div>
                    </InputField>

                    <InputField label="Subcategory">
                      <div className="space-y-2">
                        <select value={form.subcategory_id} onChange={e => setForm(f => ({ ...f, subcategory_id: e.target.value }))} className={inputClass} disabled={!form.category_id}>
                          <option value="">None</option>
                          {subcategories.filter(s => s.category_id?.toString() === form.category_id?.toString()).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setSubcategoryModalOpen(true)}
                          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                          disabled={!form.category_id}
                        >
                          + Manage Subcategories
                        </button>
                      </div>
                    </InputField>
                  </div>

                  <InputField label="Description (Rich Text)">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#202430]/60 p-1.5">
                        <button type="button" onClick={() => executeDescriptionCommand('bold')} className="p-1.5 rounded hover:bg-white/10 text-gray-200" title="Bold"><Bold size={14} /></button>
                        <button type="button" onClick={() => executeDescriptionCommand('italic')} className="p-1.5 rounded hover:bg-white/10 text-gray-200" title="Italic"><Italic size={14} /></button>
                        <button type="button" onClick={() => executeDescriptionCommand('underline')} className="p-1.5 rounded hover:bg-white/10 text-gray-200" title="Underline"><Underline size={14} /></button>
                        <div className="w-px h-5 bg-white/10 mx-1" />
                        <button type="button" onClick={() => executeDescriptionCommand('insertUnorderedList')} className="p-1.5 rounded hover:bg-white/10 text-gray-200" title="Bullet List"><List size={14} /></button>
                        <button type="button" onClick={() => executeDescriptionCommand('insertOrderedList')} className="p-1.5 rounded hover:bg-white/10 text-gray-200" title="Numbered List"><ListOrdered size={14} /></button>
                      </div>

                      <div
                        key={`description-editor-${descriptionEditorSeed}`}
                        ref={descriptionEditorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={syncDescriptionFromEditor}
                        onPaste={handleDescriptionPaste}
                        className="min-h-[150px] w-full rounded-lg border border-white/10 bg-[#202430] px-3 py-2 text-sm text-gray-100 leading-6 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                        dangerouslySetInnerHTML={{ __html: descriptionEditorInitialHtml || '<p></p>' }}
                      />

                      <p className="text-[11px] text-gray-500">Use the toolbar to format product details.</p>
                    </div>
                  </InputField>

                  <InputField label="Part Number">
                    <input value={form.partNumber} onChange={e => setForm(f => ({ ...f, partNumber: e.target.value, barcode: e.target.value }))} className={inputClass} placeholder="PN-001234" />
                  </InputField>
                </div>
              )}

              {formStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InputField label="Price" required>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.price}
                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                        className={inputClass}
                        placeholder="0.00"
                      />
                    </InputField>
                    <InputField label="Buying Price (Optional)">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.buyingPrice}
                        onChange={e => setForm(f => ({ ...f, buyingPrice: e.target.value }))}
                        className={inputClass}
                        placeholder="0.00"
                      />
                    </InputField>
                    <InputField label="Stock" required>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.stock_quantity}
                        onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))}
                        className={inputClass}
                      />
                    </InputField>
                    <InputField label="Low Stock Alert">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.low_stock_threshold}
                        onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                        className={inputClass}
                      />
                    </InputField>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/10 bg-[#202430]/40 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">SKU</p>
                        <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#171a22] p-1">
                          <button
                            type="button"
                            onClick={() => setSkuMode(SKU_MODE_AUTO)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${form.sku_mode === SKU_MODE_AUTO ? 'bg-red-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                          >
                            Auto
                          </button>
                          <button
                            type="button"
                            onClick={() => setSkuMode(SKU_MODE_MANUAL)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${form.sku_mode === SKU_MODE_MANUAL ? 'bg-red-500 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>

                      <input
                        value={form.sku}
                        onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                        className={`${inputClass} ${form.sku_mode === SKU_MODE_AUTO ? 'opacity-70 cursor-not-allowed' : ''}`}
                        placeholder={form.sku_mode === SKU_MODE_AUTO ? 'SKU will be generated automatically' : 'Enter manual SKU'}
                        disabled={form.sku_mode === SKU_MODE_AUTO}
                      />

                      {form.sku_mode === SKU_MODE_AUTO ? (
                        <p className="text-xs text-gray-400">
                          Auto preview: {buildAutoSkuPreview({ partNumber: form.partNumber, name: form.name })}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">Manual SKU is required in manual mode.</p>
                      )}
                    </div>

                    <InputField label="Barcode">
                      <input
                        value={form.barcode}
                        onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                        className={inputClass}
                        placeholder="Scan-ready barcode"
                      />
                    </InputField>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#202430]/40 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Bulk Pricing (Optional)</p>
                        <p className="text-xs text-gray-400 mt-1">Add quantity tiers to offer discounted unit prices.</p>
                      </div>
                      <button
                        type="button"
                        onClick={addBulkPricingTier}
                        className="px-3 py-1.5 bg-[#2a3244] hover:bg-[#37425b] text-gray-100 text-xs font-semibold rounded-lg transition-colors"
                      >
                        + Add Tier
                      </button>
                    </div>

                    {form.bulk_pricing.length === 0 ? (
                      <p className="text-xs text-gray-500">No bulk pricing tiers yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {form.bulk_pricing.map((tier, tierIndex) => (
                          <div key={`bulk-tier-${tierIndex}`} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-5">
                              <input
                                type="number"
                                min="2"
                                step="1"
                                value={tier.min_qty}
                                onChange={(event) => updateBulkPricingTier(tierIndex, 'min_qty', event.target.value)}
                                className={inputClass}
                                placeholder="Min qty"
                              />
                            </div>
                            <div className="col-span-5">
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={tier.unit_price}
                                onChange={(event) => updateBulkPricingTier(tierIndex, 'unit_price', event.target.value)}
                                className={inputClass}
                                placeholder="Unit price"
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => removeBulkPricingTier(tierIndex)}
                                className="w-9 h-9 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 flex items-center justify-center transition-colors"
                                title="Remove tier"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] text-gray-500">Tier prices must be lower than regular price and should not increase as quantity grows.</p>
                  </div>
                </div>
              )}

              {formStep === 3 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-[#202430]/40 p-4">
                    <h5 className="text-sm font-semibold text-white">Variant Setup</h5>
                    <p className="mt-1 text-xs text-gray-400">
                      Use the variant manager for size, color, or model combinations.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!editing) return;
                          setSelectedProductVariants(editing);
                          setVariantsModalOpen(true);
                        }}
                        disabled={!editing}
                        className="px-4 py-2 bg-red-500/90 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Open Variant Manager
                      </button>
                      {!editing && (
                        <span className="text-xs text-amber-300">Save product first, then configure variants.</span>
                      )}
                    </div>
                  </div>

                  <InputField label="Variant Notes">
                    <textarea
                      value={form.variant_notes}
                      onChange={e => setForm(f => ({ ...f, variant_notes: e.target.value }))}
                      rows={3}
                      className={inputClass}
                      placeholder="Example: Color (Black/Red), Size (S/M/L)"
                    />
                  </InputField>
                </div>
              )}

              {formStep === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Shipping Option" required>
                      <select
                        value={form.shipping_option}
                        onChange={e => setForm(f => ({ ...f, shipping_option: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="standard">Standard</option>
                        <option value="express">Express</option>
                      </select>
                    </InputField>
                    <InputField label="Weight (kg)" required>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={form.shipping_weight_kg}
                        onChange={e => setForm(f => ({ ...f, shipping_weight_kg: e.target.value }))}
                        className={inputClass}
                        placeholder="0.500"
                      />
                    </InputField>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#202430]/40 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Dimensions (optional)</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Enter all values in centimeters if your courier requires parcel dimensions.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <InputField label="Length (cm)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.shipping_length_cm}
                          onChange={e => setForm(f => ({ ...f, shipping_length_cm: e.target.value }))}
                          className={inputClass}
                          placeholder="30"
                        />
                      </InputField>
                      <InputField label="Width (cm)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.shipping_width_cm}
                          onChange={e => setForm(f => ({ ...f, shipping_width_cm: e.target.value }))}
                          className={inputClass}
                          placeholder="20"
                        />
                      </InputField>
                      <InputField label="Height (cm)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.shipping_height_cm}
                          onChange={e => setForm(f => ({ ...f, shipping_height_cm: e.target.value }))}
                          className={inputClass}
                          placeholder="10"
                        />
                      </InputField>
                    </div>
                  </div>

                  <InputField label="Storage / Pickup Location">
                    <input value={form.boxNumber} onChange={e => setForm(f => ({ ...f, boxNumber: e.target.value }))} className={inputClass} placeholder="A-12" />
                  </InputField>

                  <p className="text-xs text-gray-500">
                    Courier-ready payload: shipping option, weight in kg, and optional dimensions in cm for APIs like J&T.
                  </p>
                </div>
              )}

              {formStep === 5 && (
                <div className="space-y-4">
                  <InputField label="Product Status" required>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputClass}>
                      <option value="available">Available</option>
                      <option value="hidden">Hidden</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </InputField>

                  <div className={`p-4 rounded-lg border ${form.is_on_sale ? 'bg-red-500/10 border-red-500/30' : 'bg-[#202430]/40 border-white/10'}`}>
                    <label className="flex items-center gap-2 font-medium text-sm text-gray-200 cursor-pointer">
                      <input type="checkbox" checked={form.is_on_sale} onChange={e => setForm(f => ({ ...f, is_on_sale: e.target.checked }))} className="w-4 h-4 text-red-500 rounded focus:ring-red-500" />
                      Put on Sale
                    </label>
                    {form.is_on_sale && (
                      <div className="mt-3">
                        <InputField label="Sale Price">
                          <input type="number" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} className={inputClass} />
                        </InputField>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#202430]/40 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Preview</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-gray-200">
                        Status: {form.status === 'available' ? 'Available' : form.status === 'hidden' ? 'Hidden' : 'Out of Stock'}
                      </span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-gray-200">
                        Stock: {form.stock_quantity || 0}
                      </span>
                      {form.is_on_sale && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-300">
                          Sale Enabled
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {formError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 border-t border-gray-700">
              <button type="button" onClick={closeProductModal} className="px-5 py-2 text-sm text-gray-300 hover:bg-[#202430] rounded-lg transition-colors">Cancel</button>

              <div className="flex items-center justify-end gap-2">
                {formStep > 0 && (
                  <button
                    type="button"
                    onClick={() => goToStep(formStep - 1)}
                    className="px-4 py-2 text-sm text-gray-200 bg-[#202430] hover:bg-[#2a3244] rounded-lg transition-colors"
                  >
                    Previous
                  </button>
                )}

                {formStep < PRODUCT_FORM_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => goToStep(formStep + 1)}
                    className="px-5 py-2 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Next
                  </button>
                ) : (
                  <button type="submit" disabled={submitting} className="px-5 py-2 bg-red-500/100 hover:bg-red-600 disabled:opacity-70 text-white text-sm font-medium rounded-lg transition-colors">
                    {submitting ? 'Saving...' : editing ? 'Update Product' : 'Create Product'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Category Management Modal */}
      {categoryModalOpen && (
        <Modal
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          title="Manage Categories"
          size="lg"
        >
          <div className="space-y-4">
            <form onSubmit={handleCreateCategory} className="space-y-2">
              <InputField label="Add New Category" required>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. MIO I 125"
                  />
                  <button
                    type="submit"
                    disabled={categorySubmitting}
                    className="px-4 py-2 bg-red-500/100 hover:bg-red-600 disabled:opacity-70 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    {categorySubmitting ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </InputField>
            </form>

            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-[#202430]/40 border-b border-white/10 text-xs font-semibold text-gray-300">Existing Categories</div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/10">
                {categories.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400">No categories yet.</p>
                ) : (
                  categories.map(category => (
                    <div key={category.id} className="px-3 py-2 flex items-center gap-2">
                      {editingCategoryId === category.id ? (
                        <>
                          <input
                            value={editingCategoryName}
                            onChange={e => setEditingCategoryName(e.target.value)}
                            className={`${inputClass} py-1.5`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCategory(category.id)}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-red-500/100 hover:bg-red-600 text-white rounded-md disabled:opacity-70"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditCategory}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-[#202430] hover:bg-[#2a3244] text-gray-200 rounded-md disabled:opacity-70"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-gray-200">{category.name}</span>
                          <button
                            type="button"
                            onClick={() => startEditCategory(category)}
                            disabled={categorySubmitting}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#202430] text-gray-400 hover:text-blue-400 disabled:opacity-70"
                            title="Edit category"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(category)}
                            disabled={categorySubmitting}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#202430] text-gray-400 hover:text-red-400 disabled:opacity-70"
                            title="Delete category"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {categoryError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {categoryError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-[#202430] rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Subcategory Management Modal */}
      {subcategoryModalOpen && (
        <Modal isOpen={subcategoryModalOpen} onClose={() => setSubcategoryModalOpen(false)} title={`Manage Subcategories (${categories.find(c => c.id.toString() === form.category_id?.toString())?.name || 'Selected Category'})`} size="md">
          <div className="space-y-4">
            <form onSubmit={handleCreateSubcategory} className="flex gap-2">
              <input
                type="text"
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
                placeholder="New subcategory name"
                className="flex-1 px-3 py-2 border border-white/10 bg-[#202430] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                disabled={categorySubmitting}
              />
              <button
                type="submit"
                disabled={!newSubcategoryName.trim() || categorySubmitting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus size={16} /> Add
              </button>
            </form>

            <div className="border border-gray-700 rounded-lg max-h-60 overflow-y-auto">
              <div className="divide-y divide-gray-800">
                {subcategories.filter(s => s.category_id?.toString() === form.category_id?.toString()).length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No subcategories yet.</div>
                ) : (
                  subcategories.filter(s => s.category_id?.toString() === form.category_id?.toString()).map(subcat => (
                    <div key={subcat.id} className="flex items-center justify-between p-3 bg-gray-900 group">
                      {editingSubcategoryId === subcat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingSubcategoryName}
                            onChange={(e) => setEditingSubcategoryName(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-red-500"
                            autoFocus
                            disabled={categorySubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateSubcategory(subcat.id)}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-md disabled:opacity-70"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSubcategoryId(null)}
                            disabled={categorySubmitting}
                            className="px-2.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-white rounded-md disabled:opacity-70 border border-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium text-sm text-gray-300">{subcat.name}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => { setEditingSubcategoryId(subcat.id); setEditingSubcategoryName(subcat.name); setCategoryError(''); }}
                              disabled={categorySubmitting}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-400 hover:text-blue-500 disabled:opacity-70"
                              title="Edit subcategory"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubcategory(subcat)}
                              disabled={categorySubmitting}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-800 text-gray-400 hover:text-red-500 disabled:opacity-70"
                              title="Delete subcategory"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {categoryError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {categoryError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSubcategoryModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-[#202430] rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      <VariantsModal isOpen={variantsModalOpen} onClose={() => { setVariantsModalOpen(false); setSelectedProductVariants(null); }} product={selectedProductVariants} />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center"><AlertTriangle size={20} className="text-red-400" /></div>
              <h3 className="text-lg font-bold text-white">Delete Product</h3>
            </div>
            <p className="text-sm text-gray-300 mb-4">Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 bg-[#202430] hover:bg-[#2a3244] text-gray-200 text-sm font-medium rounded-xl">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsView;


