import React from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import BrandButton from '../components/ui/BrandButton';

const NotFound = () => (
  <main className="grid min-h-[65vh] place-items-center bg-slate-50 px-4 py-16">
    <div className="max-w-xl text-center">
      <p className="font-display text-7xl font-black tracking-tight text-slate-200">404</p>
      <h1 className="-mt-3 font-display text-3xl font-extrabold text-slate-950">That road ends here</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">The page may have moved, or the link may be incorrect. Use the catalog search or return to the storefront.</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <BrandButton to="/"><ArrowLeft size={17} /> Back home</BrandButton>
        <BrandButton to="/shop" variant="secondary"><Search size={17} /> Browse products</BrandButton>
      </div>
    </div>
  </main>
);

export default NotFound;
