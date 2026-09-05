const parseValue = (value, fallback) => {
  if (typeof fallback === 'boolean') return String(value).toLowerCase() === 'true';
  if (typeof fallback === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return value ?? fallback;
};

export const getRuntimeSettings = async (db, category, defaults = {}) => {
  const keys = Object.keys(defaults);
  if (!keys.length) return {};
  const result = await db.query(
    `SELECT key,value FROM system_settings
     WHERE category=$1 AND key=ANY($2::text[])`,
    [category, keys]
  );
  const values = { ...defaults };
  for (const row of result.rows) {
    values[row.key] = parseValue(row.value, defaults[row.key]);
  }
  return values;
};

export const listSettings = async (db, category = null) => {
  const result = category
    ? await db.query('SELECT * FROM system_settings WHERE category=$1 ORDER BY key', [category])
    : await db.query('SELECT * FROM system_settings ORDER BY category,key');
  return result.rows;
};
