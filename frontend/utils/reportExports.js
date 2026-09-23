const humanizeKey = (key) => String(key || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const normalizeCell = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? '';
};

const rowsToCsv = (rows = [], columns = null) => {
  if (!rows.length) return '';
  const selectedColumns = columns || Object.keys(rows[0]).map((key) => ({ key, label: humanizeKey(key) }));
  return [
    selectedColumns.map((column) => csvCell(column.label)).join(','),
    ...rows.map((row) => selectedColumns.map((column) => csvCell(normalizeCell(row[column.key]))).join(',')),
  ].join('\r\n');
};

const reportDate = () => new Date().toISOString().slice(0, 10);

export const downloadCsv = ({ filename, sections }) => {
  const content = sections
    .filter((section) => section.rows?.length)
    .map((section) => [csvCell(section.title), rowsToCsv(section.rows, section.columns)].join('\r\n'))
    .join('\r\n\r\n');
  if (!content) return false;

  const blob = new Blob([`\uFEFF${content}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}_${reportDate()}.csv`;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
};

const escapeHtml = (value) => String(normalizeCell(value))
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const tableHtml = (section) => {
  if (!section.rows?.length) return '';
  const columns = section.columns || Object.keys(section.rows[0]).map((key) => ({ key, label: humanizeKey(key) }));
  return `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
        <tbody>${section.rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </section>`;
};

export const openDataReportPdf = ({ title, rangeLabel, sections }) => {
  const printableSections = sections.filter((section) => section.rows?.length);
  if (!printableSections.length) return false;
  const printWindow = window.open('about:blank', '_blank');
  if (!printWindow) return false;
  printWindow.opener = null;

  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 14mm 10mm 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #172033; font: 10px/1.35 Arial, sans-serif; }
      header { border-bottom: 2px solid #f97316; margin-bottom: 16px; padding-bottom: 10px; }
      h1 { font-size: 21px; margin: 0 0 4px; }
      h2 { break-after: avoid; font-size: 14px; margin: 18px 0 6px; }
      p { color: #526078; margin: 2px 0; }
      table { border-collapse: collapse; table-layout: auto; width: 100%; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 1px solid #d8dee9; padding: 5px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #182235; color: #fff; font-size: 9px; text-transform: uppercase; }
      tbody tr:nth-child(even) { background: #f6f8fb; }
      section { break-inside: auto; }
      .page-footer { bottom: 4mm; color: #6b7280; font-size: 8px; left: 10mm; position: fixed; right: 10mm; text-align: right; }
      .page-footer::after { content: 'Page ' counter(page); }
    </style></head><body>
      <header><h1>${escapeHtml(title)}</h1><p>Reporting period: ${escapeHtml(rangeLabel)}</p><p>Generated: ${escapeHtml(generatedAt)}</p></header>
      ${printableSections.map(tableHtml).join('')}
      <div class="page-footer"></div>
    </body></html>`);
  printWindow.document.close();
  window.setTimeout(() => printWindow.print(), 250);
  return true;
};

export const buildOwnerReportSections = ({
  salesReport,
  salesTrend,
  topProducts,
  stockLevels,
  profitReport,
  posReport,
  returnReport,
  customerActivity,
}) => [
  {
    title: 'Sales Summary',
    rows: salesReport ? [{
      total_revenue: Number(salesReport.total_revenue || 0).toFixed(2),
      total_orders: salesReport.total_orders || 0,
      average_order_value: Number(salesReport.average_order_value || 0).toFixed(2),
      pos_orders: salesReport.pos_orders || 0,
    }] : [],
  },
  { title: 'Sales Trend', rows: salesTrend || [] },
  { title: 'Top Products', rows: topProducts || [] },
  { title: 'Inventory Stock', rows: stockLevels || [] },
  {
    title: 'Profit and Loss',
    rows: profitReport ? [{
      gross_revenue: Number(profitReport.total_revenue || 0).toFixed(2),
      total_cost: profitReport.profit_exact ? Number(profitReport.total_cost || 0).toFixed(2) : 'Historical COGS unavailable',
      net_profit: profitReport.profit_exact ? Number(profitReport.net_profit || 0).toFixed(2) : 'Historical COGS unavailable',
      profit_margin_percent: profitReport.profit_exact ? Number(profitReport.profit_margin || 0).toFixed(2) : '',
    }] : [],
  },
  { title: 'POS Summary', rows: posReport ? [posReport] : [] },
  { title: 'Returns and Refunds', rows: returnReport?.returns || [] },
  { title: 'Customer Activity', rows: customerActivity?.mostActive || [] },
];

export const __testing = { humanizeKey, rowsToCsv, escapeHtml, tableHtml };
