import React from 'react';

// Simple barcode visualization using CSS gradient to simulate bars
const BarcodePattern = () => (
  <div 
    className="h-12 w-full mt-2"
    style={{
      background: `repeating-linear-gradient(
        90deg,
        #000 0px,
        #000 2px,
        #fff 2px,
        #fff 4px,
        #000 4px,
        #000 5px,
        #fff 5px,
        #fff 7px
      )`
    }}
  />
);

const BarcodeLabel = ({ product }) => {
  return (
    <div className="border-2 border-black p-4 w-[300px] bg-white text-center break-inside-avoid mb-4">
      <h3 className="font-bold text-lg truncate">{product.name}</h3>
      <p className="text-xs text-gray-600">{product.partNumber}</p>
      <BarcodePattern />
      <p className="font-mono text-sm mt-1 tracking-widest">{product.barcode || product.sku || product.id}</p>
      <p className="font-bold text-xl mt-1">${product.price.toFixed(2)}</p>
    </div>
  );
};

export default BarcodeLabel;