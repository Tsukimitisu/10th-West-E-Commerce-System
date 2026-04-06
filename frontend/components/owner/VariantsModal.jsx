import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getProductVariants, saveProductVariants, uploadProductImage } from '../../services/api';
import Modal from './Modal';
import { Plus, Save, Trash2, Upload } from 'lucide-react';

const MAX_OPTIONS = 5;
const MAX_VARIANTS = 300;

const createOptionId = () => `option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeOptionName = (value) => String(value || '').trim().slice(0, 50);
const normalizeOptionValue = (value) => String(value || '').trim().slice(0, 100);

const normalizeVariantToken = (value, fallback = 'x') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
};

const buildCombinationKey = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${normalizeVariantToken(optionName, 'opt')}:${normalizeVariantToken(optionCombination?.[optionName], 'val')}`)
  .join('|');

const formatCombinationLabel = (optionCombination, optionOrder) => optionOrder
  .map((optionName) => `${optionName}: ${optionCombination?.[optionName] || ''}`)
  .join(' / ');

const parseValuesInput = (value) => String(value || '')
  .split(/[\n,|]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const normalizeOptionDrafts = (drafts) => {
  if (!Array.isArray(drafts)) return [];

  const seenNames = new Set();
  const options = [];

  drafts.forEach((draft) => {
    const name = normalizeOptionName(draft?.name);
    if (!name) return;

    const nameToken = name.toLowerCase();
    if (seenNames.has(nameToken)) return;
    seenNames.add(nameToken);

    const seenValues = new Set();
    const values = (Array.isArray(draft?.values) ? draft.values : [])
      .map((value) => normalizeOptionValue(value))
      .filter(Boolean)
      .filter((value) => {
        const valueToken = value.toLowerCase();
        if (seenValues.has(valueToken)) return false;
        seenValues.add(valueToken);
        return true;
      });

    if (values.length === 0) return;

    options.push({
      id: draft.id || createOptionId(),
      name,
      values,
    });
  });

  return options.slice(0, MAX_OPTIONS);
};

const generateCombinations = (options) => {
  if (!Array.isArray(options) || options.length === 0) {
    return { value: [] };
  }

  let combinations = [{}];

  for (const option of options) {
    const next = [];
    for (const combination of combinations) {
      for (const value of option.values) {
        next.push({
          ...combination,
          [option.name]: value,
        });

        if (next.length > MAX_VARIANTS) {
          return {
            error: `Combination limit exceeded (${MAX_VARIANTS}). Reduce options or values.`,
          };
        }
      }
    }

    combinations = next;
  }

  return { value: combinations };
};

const normalizeVariantRows = (rows, optionOrder, fallbackPrice) => {
  const rowMap = new Map();

  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      const optionCombination = row?.option_combination && typeof row.option_combination === 'object' && !Array.isArray(row.option_combination)
        ? row.option_combination
        : {};
      const resolvedOptionOrder = optionOrder.length > 0 ? optionOrder : Object.keys(optionCombination);
      const combinationKey = row?.combination_key || buildCombinationKey(optionCombination, resolvedOptionOrder);

      rowMap.set(combinationKey, {
        id: row?.id || null,
        option_combination: optionCombination,
        combination_key: combinationKey,
        price: Number.isFinite(Number(row?.price)) ? Number(row.price) : Number(fallbackPrice || 0),
        stock_quantity: Number.isInteger(Number(row?.stock_quantity)) ? Number(row.stock_quantity) : 0,
        image_url: String(row?.image_url || '').trim(),
        sku: String(row?.sku || '').trim(),
      });
    });
  }

  return rowMap;
};

const createBlankOption = () => ({
  id: createOptionId(),
  name: '',
  values: [],
});

const VariantsModal = ({ isOpen, onClose, product }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [options, setOptions] = useState([createBlankOption()]);
  const [valueDraftByOption, setValueDraftByOption] = useState({});
  const [variants, setVariants] = useState([]);
  const [combinationWarning, setCombinationWarning] = useState('');
  const [uploadingKey, setUploadingKey] = useState('');
  const [uploadTargetKey, setUploadTargetKey] = useState('');
  const imagePickerRef = useRef(null);

  const basePrice = useMemo(() => {
    const parsed = Number(product?.price ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [product?.price]);

  const rebuildVariantMatrix = (optionDrafts, currentRows = variants) => {
    const normalizedOptions = normalizeOptionDrafts(optionDrafts);

    if (normalizedOptions.length === 0) {
      setCombinationWarning('Add at least one option with values to generate variants.');
      return [];
    }

    const optionOrder = normalizedOptions.map((option) => option.name);
    const combinationResult = generateCombinations(normalizedOptions);
    if (combinationResult.error) {
      setCombinationWarning(combinationResult.error);
      return [];
    }

    setCombinationWarning('');
    const rowMap = normalizeVariantRows(currentRows, optionOrder, basePrice);

    return combinationResult.value.map((combination) => {
      const combinationKey = buildCombinationKey(combination, optionOrder);
      const existing = rowMap.get(combinationKey);

      return {
        id: existing?.id || null,
        option_combination: combination,
        combination_key: combinationKey,
        label: formatCombinationLabel(combination, optionOrder),
        price: Number.isFinite(Number(existing?.price)) ? Number(existing.price).toFixed(2) : Number(basePrice).toFixed(2),
        stock_quantity: Number.isInteger(Number(existing?.stock_quantity)) ? String(existing.stock_quantity) : '0',
        image_url: String(existing?.image_url || ''),
        sku: String(existing?.sku || ''),
      };
    });
  };

  const fetchVariants = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const payload = await getProductVariants(product.id);
      const loadedOptions = normalizeOptionDrafts((payload.options || []).map((option) => ({
        id: createOptionId(),
        name: option.name,
        values: option.values,
      })));

      const nextOptions = loadedOptions.length > 0 ? loadedOptions : [createBlankOption()];
      const nextVariants = rebuildVariantMatrix(nextOptions, payload.variants || []);

      setOptions(nextOptions);
      setVariants(nextVariants);
      setValueDraftByOption({});
    } catch (err) {
      setError(err.message || 'Failed to load variants');
      setOptions([createBlankOption()]);
      setVariants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchVariants();
    } else {
      setOptions([createBlankOption()]);
      setVariants([]);
      setValueDraftByOption({});
      setError('');
      setSuccess('');
      setCombinationWarning('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setVariants((currentRows) => rebuildVariantMatrix(options, currentRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, basePrice, isOpen]);

  const updateOptionName = (optionId, value) => {
    setOptions((currentOptions) => currentOptions.map((option) => (
      option.id === optionId
        ? { ...option, name: value }
        : option
    )));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) {
      setError(`Only ${MAX_OPTIONS} option groups are supported.`);
      return;
    }
    setError('');
    setOptions((currentOptions) => [...currentOptions, createBlankOption()]);
  };

  const removeOption = (optionId) => {
    setOptions((currentOptions) => {
      const next = currentOptions.filter((option) => option.id !== optionId);
      return next.length > 0 ? next : [createBlankOption()];
    });

    setValueDraftByOption((current) => {
      const next = { ...current };
      delete next[optionId];
      return next;
    });
  };

  const addOptionValues = (optionId) => {
    const valueDraft = valueDraftByOption[optionId] || '';
    const parsedValues = parseValuesInput(valueDraft);
    if (parsedValues.length === 0) return;

    setOptions((currentOptions) => currentOptions.map((option) => {
      if (option.id !== optionId) return option;

      const seen = new Set(option.values.map((value) => value.toLowerCase()));
      const nextValues = [...option.values];

      parsedValues.forEach((rawValue) => {
        const normalizedValue = normalizeOptionValue(rawValue);
        if (!normalizedValue) return;

        const token = normalizedValue.toLowerCase();
        if (seen.has(token)) return;

        seen.add(token);
        nextValues.push(normalizedValue);
      });

      return {
        ...option,
        values: nextValues,
      };
    }));

    setValueDraftByOption((current) => ({
      ...current,
      [optionId]: '',
    }));
  };

  const removeOptionValue = (optionId, valueToRemove) => {
    setOptions((currentOptions) => currentOptions.map((option) => {
      if (option.id !== optionId) return option;
      return {
        ...option,
        values: option.values.filter((value) => value !== valueToRemove),
      };
    }));
  };

  const updateVariantField = (combinationKey, field, value) => {
    setVariants((currentRows) => currentRows.map((row) => (
      row.combination_key === combinationKey
        ? { ...row, [field]: value }
        : row
    )));
  };

  const triggerVariantImageUpload = (combinationKey) => {
    setUploadTargetKey(combinationKey);
    imagePickerRef.current?.click();
  };

  const handleVariantImagePick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !uploadTargetKey) return;

    setUploadingKey(uploadTargetKey);
    setError('');

    try {
      const payload = await uploadProductImage(file);
      const imageUrl = String(payload?.imageUrl || '').trim();

      if (!imageUrl) {
        throw new Error('Image upload succeeded but no URL was returned.');
      }

      updateVariantField(uploadTargetKey, 'image_url', imageUrl);
    } catch (err) {
      setError(err.message || 'Failed to upload variant image.');
    } finally {
      setUploadingKey('');
      setUploadTargetKey('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const normalizedOptions = normalizeOptionDrafts(options).map((option) => ({
        name: option.name,
        values: option.values,
      }));

      if (normalizedOptions.length === 0) {
        throw new Error('Add at least one option with values before saving.');
      }

      if (combinationWarning) {
        throw new Error(combinationWarning);
      }

      if (variants.length === 0) {
        throw new Error('No variant combinations were generated.');
      }

      const payloadVariants = variants.map((row, index) => {
        const price = Number(row.price);
        const stockQuantity = Number.parseInt(String(row.stock_quantity), 10);

        if (!Number.isFinite(price) || price <= 0) {
          throw new Error(`Variant row ${index + 1}: price must be greater than 0.`);
        }

        if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
          throw new Error(`Variant row ${index + 1}: stock must be a whole number 0 or higher.`);
        }

        return {
          option_combination: row.option_combination,
          combination_key: row.combination_key,
          price,
          stock_quantity: stockQuantity,
          image_url: String(row.image_url || '').trim() || null,
          sku: String(row.sku || '').trim() || null,
        };
      });

      const saved = await saveProductVariants(product.id, {
        options: normalizedOptions,
        variants: payloadVariants,
      });

      const savedOptions = normalizeOptionDrafts((saved.options || []).map((option) => ({
        id: createOptionId(),
        name: option.name,
        values: option.values,
      })));

      const nextOptions = savedOptions.length > 0 ? savedOptions : [createBlankOption()];
      const nextVariants = rebuildVariantMatrix(nextOptions, saved.variants || []);

      setOptions(nextOptions);
      setVariants(nextVariants);
      setSuccess('Variants saved successfully.');
    } catch (err) {
      setError(err.message || 'Failed to save variants.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  const matrixCount = variants.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Variants - ${product.name}`}>
      <div className="space-y-4">
        {error ? <p className="text-sm font-medium text-red-500">{error}</p> : null}
        {success ? <p className="text-sm font-medium text-emerald-400">{success}</p> : null}

        <input
          ref={imagePickerRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleVariantImagePick}
        />

        <section className="rounded-xl border border-gray-700 bg-gray-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white">Variant Options</h4>
              <p className="text-xs text-gray-400">Add option groups like Size, Color, Material, then values for each group.</p>
            </div>
            <button
              type="button"
              onClick={addOption}
              className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors flex items-center gap-1"
            >
              <Plus size={15} /> Add Option
            </button>
          </div>

          {options.map((option) => (
            <div key={option.id} className="rounded-lg border border-gray-700 bg-[#121620] p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={option.name}
                  onChange={(event) => updateOptionName(option.id, event.target.value)}
                  placeholder="Option name (e.g. Size)"
                  className="flex-1 px-3 py-2 bg-black border border-gray-700 rounded-lg text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => removeOption(option.id)}
                  className="h-10 w-10 rounded-lg border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/40 transition-colors flex items-center justify-center"
                  title="Remove option"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => (
                  <span key={`${option.id}-${value}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-800 text-gray-200 text-xs border border-gray-700">
                    {value}
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-400"
                      onClick={() => removeOptionValue(option.id, value)}
                      aria-label={`Remove ${value}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={valueDraftByOption[option.id] || ''}
                  onChange={(event) => setValueDraftByOption((current) => ({
                    ...current,
                    [option.id]: event.target.value,
                  }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault();
                      addOptionValues(option.id);
                    }
                  }}
                  placeholder="Add values (comma separated)"
                  className="flex-1 px-3 py-2 bg-black border border-gray-700 rounded-lg text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => addOptionValues(option.id)}
                  className="h-10 px-3 rounded-lg border border-orange-500/40 text-orange-300 hover:bg-orange-500/10 text-sm font-medium"
                >
                  Add Values
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-gray-700 bg-gray-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white">Variant Matrix</h4>
              <p className="text-xs text-gray-400">Combinations are generated automatically from option values.</p>
            </div>
            <div className="text-xs text-gray-300">
              <strong>{matrixCount}</strong> combinations
            </div>
          </div>

          {combinationWarning ? (
            <p className="text-xs text-amber-300">{combinationWarning}</p>
          ) : null}

          <div className="max-h-[340px] overflow-auto rounded-lg border border-gray-800">
            <table className="w-full text-left text-sm text-gray-200">
              <thead className="bg-gray-800 text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2">Combination</th>
                  <th className="px-3 py-2 w-28">Price</th>
                  <th className="px-3 py-2 w-24">Stock</th>
                  <th className="px-3 py-2">Image URL</th>
                  <th className="px-3 py-2 w-28">SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-6 text-center text-gray-400">Loading variants...</td>
                  </tr>
                ) : variants.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-6 text-center text-gray-500">No combinations yet.</td>
                  </tr>
                ) : (
                  variants.map((row) => (
                    <tr key={row.combination_key} className="hover:bg-gray-800/40 transition-colors">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-white">{row.label}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.price}
                          onChange={(event) => updateVariantField(row.combination_key, 'price', event.target.value)}
                          className="w-full px-2 py-1.5 bg-black border border-gray-700 rounded text-sm text-white"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.stock_quantity}
                          onChange={(event) => updateVariantField(row.combination_key, 'stock_quantity', event.target.value)}
                          className="w-full px-2 py-1.5 bg-black border border-gray-700 rounded text-sm text-white"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex gap-2">
                          <input
                            value={row.image_url}
                            onChange={(event) => updateVariantField(row.combination_key, 'image_url', event.target.value)}
                            placeholder="https://..."
                            className="flex-1 px-2 py-1.5 bg-black border border-gray-700 rounded text-sm text-white"
                          />
                          <button
                            type="button"
                            onClick={() => triggerVariantImageUpload(row.combination_key)}
                            className="h-8 px-2 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-orange-400/50 transition-colors flex items-center gap-1"
                            title="Upload image"
                            disabled={uploadingKey === row.combination_key}
                          >
                            <Upload size={13} />
                            {uploadingKey === row.combination_key ? '...' : ''}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          value={row.sku}
                          onChange={(event) => updateVariantField(row.combination_key, 'sku', event.target.value)}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 bg-black border border-gray-700 rounded text-sm text-white"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={fetchVariants}
            className="h-10 px-4 rounded-lg border border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-800 transition-colors text-sm"
            disabled={loading || saving}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center gap-1"
            disabled={loading || saving}
          >
            <Save size={15} /> {saving ? 'Saving...' : 'Save Variants'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default VariantsModal;
