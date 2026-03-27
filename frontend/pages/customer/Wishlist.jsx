import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, Eye, Package, AlertTriangle } from 'lucide-react';
import { getWishlist, removeFromWishlist, WISHLIST_SYNC_EVENT } from '../../services/api';
import { useCart } from '../../context/CartContext';
import AccountLayout from '../../components/customer/AccountLayout';

const Wishlist = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [quantityErrors, setQuantityErrors] = useState({});
  const { addToCart, items: cartItems } = useCart();

  useEffect(() => {
    const load = async () => {
      try {
        const userData = localStorage.getItem('shopCoreUser');
        const user = userData ? JSON.parse(userData) : null;
        if (!user) {
          setItems([]);
          setLoading(false);
          return;
        }
        const data = await getWishlist(user.id);
        setItems(data);
      } catch {
        setItems([]);
      }
      setLoading(false);
    };

    load();

    const syncWishlist = () => {
      setLoading(true);
      load();
    };

    window.addEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
    window.addEventListener('storage', syncWishlist);
    window.addEventListener('focus', syncWishlist);

    return () => {
      window.removeEventListener(WISHLIST_SYNC_EVENT, syncWishlist);
      window.removeEventListener('storage', syncWishlist);
      window.removeEventListener('focus', syncWishlist);
    };
  }, []);

  const handleRemove = async (productId) => {
    try {
      const userData = localStorage.getItem('shopCoreUser');
      const user = userData ? JSON.parse(userData) : null;
      if (!user) return;
      await removeFromWishlist(user.id, productId);
      setItems((prev) => prev.filter((item) => Number(item.product_id ?? item.product?.id ?? item.id) !== Number(productId)));
      setQuantities((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setQuantityErrors((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } catch {}
  };

  const handleAddToCart = (item, quantity) => {
    const productId = item.product_id ?? item.product?.id ?? item.id;
    const name = item.name || item.product_name || item.product?.name;
    const price = Number(item.sale_price ?? item.price ?? item.product?.sale_price ?? item.product?.price ?? 0);
    const image = item.image_url || item.product?.image_url || item.product?.image || '';
    const stockQuantity = item.stock_quantity ?? item.product?.stock_quantity ?? 0;

    addToCart({
      id: productId,
      name,
      price,
      image,
      stock_quantity: stockQuantity,
    }, quantity);
  };

  return (
    <AccountLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg text-white flex items-center gap-2"><Heart size={20} /> Wishlist ({items.length})</h2>
          {items.length > 0 && (
            <Link to="/shop" className="text-sm text-red-500 hover:text-orange-600 font-medium">Continue Shopping</Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 rounded-xl aspect-[4/5] animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
            <Heart size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-white mb-1">Your wishlist is empty</h3>
            <p className="text-sm text-gray-400 mb-4">Save items you love to your wishlist.</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500/100 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const productId = item.product_id ?? item.product?.id ?? item.id;
              const name = item.name || item.product_name || item.product?.name || 'Unknown Product';
              const price = Number(item.price ?? item.product?.price ?? 0);
              const salePrice = item.sale_price != null ? Number(item.sale_price) : (item.product?.sale_price != null ? Number(item.product.sale_price) : null);
              const stockQuantity = item.stock_quantity ?? item.product?.stock_quantity ?? 0;
              const lowStockThreshold = item.low_stock_threshold ?? item.product?.low_stock_threshold ?? 5;
              const inStock = item.in_stock !== false && stockQuantity > 0;
              const isLowStock = stockQuantity > 0 && stockQuantity <= lowStockThreshold;
              const imageUrl = item.image_url || item.product?.image_url || item.product?.image || '';
              const selectedQty = quantities[productId] ?? 1;
              const cartQty = cartItems.find((cartItem) => cartItem.productId === productId)?.quantity ?? 0;
              const availableQty = Math.max(0, stockQuantity - cartQty);
              const hasQtyError = !!quantityErrors[productId];
              const canAdd = inStock && !hasQtyError && selectedQty <= availableQty;

              return (
                <div key={productId} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden group hover:shadow-md transition-all">
                  <div className="relative aspect-square bg-gray-900 overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package size={40} className="text-gray-300" /></div>
                    )}
                    {!inStock && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">Out of Stock</span>
                      </div>
                    )}
                    {isLowStock && !hasQtyError && (
                      <div className="absolute top-2 left-2">
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">Low Stock</span>
                      </div>
                    )}
                    <button
                      onClick={() => handleRemove(productId)}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/90 hover:bg-red-500/10 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shadow-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="p-3 space-y-2">
                    <Link to={`/products/${productId}`} className="block">
                      <h3 className="text-sm font-medium text-white hover:text-red-500 line-clamp-2 transition-colors">{name}</h3>
                    </Link>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-400">Stock: {stockQuantity}</p>
                      {isLowStock && <span className="text-[10px] text-amber-600 flex items-center gap-0.5"><AlertTriangle size={10} /> Low stock</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {salePrice ? (
                        <>
                          <span className="font-semibold text-red-500">PHP {salePrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          <span className="text-xs text-gray-400 line-through">PHP {price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-white">PHP {price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-gray-400">Qty</label>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, availableQty)}
                          value={selectedQty}
                          onChange={(e) => {
                            const nextValue = Number(e.target.value);
                            const safeValue = Number.isFinite(nextValue) && nextValue > 0 ? Math.floor(nextValue) : 1;
                            setQuantities((prev) => ({ ...prev, [productId]: safeValue }));

                            if (availableQty > 0 && safeValue > availableQty) {
                              setQuantityErrors((prev) => ({
                                ...prev,
                                [productId]: `Only ${availableQty} left in stock.`
                              }));
                            } else {
                              setQuantityErrors((prev) => ({
                                ...prev,
                                [productId]: null
                              }));
                            }
                          }}
                          className="w-16 px-2 py-1 border border-gray-700 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
                        />
                      </div>
                      <button
                        onClick={() => handleAddToCart(item, selectedQty)}
                        disabled={!canAdd}
                        className="flex-1 px-3 py-2 bg-red-500/100 hover:bg-red-600 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <ShoppingCart size={13} /> Add to Cart
                      </button>
                      <Link to={`/products/${productId}`} className="px-3 py-2 border border-gray-700 text-gray-600 hover:bg-gray-900 rounded-lg transition-colors flex items-center justify-center">
                        <Eye size={14} />
                      </Link>
                    </div>
                    {hasQtyError && (
                      <p className="text-[11px] text-red-500">{quantityErrors[productId]}</p>
                    )}
                    {!hasQtyError && inStock && availableQty === 0 && (
                      <p className="text-[11px] text-red-500">No more stock available in your cart.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AccountLayout>
  );
};

export default Wishlist;


