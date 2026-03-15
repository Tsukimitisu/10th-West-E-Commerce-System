import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, Eye, Package } from 'lucide-react';
import { getWishlist, removeFromWishlist } from '../../services/api';
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
          setLoading(false);
          return;
        }
        const data = await getWishlist(user.id);
        setItems(data);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleRemove = async (productId) => {
    try {
      const userData = localStorage.getItem('shopCoreUser');
      const user = userData ? JSON.parse(userData) : null;
      if (!user) return;
      await removeFromWishlist(user.id, productId);
      setItems((prev) => prev.filter((i) => i.product_id !== productId && i.id !== productId));
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
          <h2 className="font-display font-semibold text-lg text-gray-900 flex items-center gap-2"><Heart size={20} /> Wishlist ({items.length})</h2>
          {items.length > 0 && (
            <Link to="/shop" className="text-sm text-orange-500 hover:text-orange-600 font-medium">Continue Shopping</Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 rounded-xl aspect-[4/5] animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Heart size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Your wishlist is empty</h3>
            <p className="text-sm text-gray-500 mb-4">Save items you love to your wishlist.</p>
            <Link to="/shop" className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
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
              const inStock = item.in_stock !== false && stockQuantity > 0;
              const imageUrl = item.image_url || item.product?.image_url || item.product?.image || '';
              const selectedQty = quantities[productId] ?? 1;
              const cartQty = cartItems.find((cartItem) => cartItem.productId === productId)?.quantity ?? 0;
              const availableQty = Math.max(0, stockQuantity - cartQty);
              const hasQtyError = !!quantityErrors[productId];
              const canAdd = inStock && !hasQtyError && selectedQty <= availableQty;

              return (
                <div key={productId} className="bg-white rounded-xl border border-gray-100 overflow-hidden group hover:shadow-md transition-all">
                  <div className="relative aspect-square bg-gray-50 overflow-hidden">
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
                    <button
                      onClick={() => handleRemove(productId)}
                      className="absolute top-2 right-2 w-8 h-8 bg-white/90 hover:bg-orange-50 rounded-full flex items-center justify-center text-gray-400 hover:text-orange-500 transition-colors shadow-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="p-3 space-y-2">
                    <Link to={`/products/${productId}`} className="block">
                      <h3 className="text-sm font-medium text-gray-900 hover:text-orange-500 line-clamp-2 transition-colors">{name}</h3>
                    </Link>
                    <p className="text-xs text-gray-500">Stock: {stockQuantity}</p>
                    <div className="flex items-center gap-2">
                      {salePrice ? (
                        <>
                          <span className="font-semibold text-orange-500">PHP {salePrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          <span className="text-xs text-gray-400 line-through">PHP {price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-gray-900">PHP {price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-gray-500">Qty</label>
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
                          className="w-16 px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
                        />
                      </div>
                      <button
                        onClick={() => handleAddToCart(item, selectedQty)}
                        disabled={!canAdd}
                        className="flex-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <ShoppingCart size={13} /> Add to Cart
                      </button>
                      <Link to={`/products/${productId}`} className="px-3 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center">
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
