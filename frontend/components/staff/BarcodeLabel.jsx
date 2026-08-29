import React from 'react';

const BarcodeLabel = ({ product }) => {
  const identifier = product.barcode || product.sku || product.id;

  return (
    <div className="mb-4 w-[300px] break-inside-avoid border-2 border-black bg-white p-4 text-center text-black">
      <h3 className="truncate text-lg font-bold">{product.name}</h3>
      <p className="text-xs text-slate-600">{product.partNumber}</p>
      <div className="mt-3 rounded border border-dashed border-slate-400 bg-slate-50 p-3">
        <p className="font-mono text-sm tracking-widest">{identifier}</p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Barcode field/search only</p>
      </div>
      <p className="mt-1 text-xl font-bold">₱{Number(product.price || 0).toFixed(2)}</p>
    </div>
  );
};

export default BarcodeLabel;

