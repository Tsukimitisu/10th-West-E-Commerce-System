// Owner QA uses in-memory merchant records. Every business API is intercepted.
import { staffFixture, staffParts, staffOrders } from './staffPhaseFixture.js';

// API integration/validation is exercised separately against the real Express
// router in backend/src/routes/banners.test.js. This fixture owns only UI data.
const withinCarouselSchedule = row => row.is_active && (!row.starts_at || Date.parse(row.starts_at)<=Date.now()) && (!row.ends_at || Date.parse(row.ends_at)>Date.now());
const publicCarouselSlide = (row, link) => ({ ...row,link_url:link });
const targetLink = (type,row) => type==='product' ? `/products/${row.id}` : type==='promotion' ? `/shop?promotion=${row.id}` : type==='category' ? `/shop?category=${row.id}` : `/shop?model=${encodeURIComponent(row.model_name)}`;
const parseCarouselBanner = input => {
  if(input.image_url && !/^(?:https?:\/\/|\/(?:brand|images|uploads)\/)/.test(input.image_url)) throw new Error('Use a valid image URL or upload a supported image.');
  return { ...input };
};

export const ownerSlides = [
  { id: 1, title: 'Maintenance essentials', subtitle: 'Dependable parts for your next service.', button_text: 'Shop maintenance', image_url: '/brand/ride-detail.webp', alt_text: 'Motorcycle service detail', destination_type: 'category', destination_id: 1, link_url: '/shop?category=1', is_active: true, display_order: 1 },
  { id: 2, title: 'Parts for your Click 125', subtitle: 'Find the right part. Confirm compatibility before ordering.', button_text: 'Find Click parts', image_url: '/brand/ride-detail-mobile.webp', destination_type: 'model', destination_id: 1, link_url: '/shop?model=Click%20125', is_active: true, display_order: 2 },
];
export const ownerPromotions = [{ id: 51, code: 'WEEKENDOIL', type: 'percentage', value: 20, min_purchase: 500, max_discount: 300, is_active: true, used_count: 3, max_uses: 100, starts_at: null, expires_at: null, created_at: '2026-10-10T08:00:00Z' }];
export const ownerReviews = [{ id: 61, product_id: 98001, product_name: 'Front Brake Pad Set', product_image: '/images/product-fallback.svg', user_name: 'Jamie Rider', rating: 5, comment: 'Good fit and clear part information. The shop helped confirm compatibility.', verified_purchase: true, review_status: 'pending', created_at: '2026-10-15T08:00:00Z' }];

export async function ownerFixture(page, options = {}) {
  const state = await staffFixture(page, { ...options, user: { name: 'Morgan West', role: 'owner', ...options.user } });
  Object.assign(state, { slides: structuredClone(options.slides ?? ownerSlides), reviews: structuredClone(options.reviews ?? ownerReviews), failures: options.failures || [], writes: [], sessions: [{ id: 'fixture-device', user_agent: 'Chromium · shop workstation', last_active: '2026-10-17T08:00:00Z' }] });
  const choices = { products: staffParts.map(row => ({ ...row, image: '/images/product-fallback.svg' })), promotions: ownerPromotions, categories: [{ id: 1, name: 'Maintenance' }], models: [{ id: 1, model_name: 'Click 125', brand: 'Honda' }] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (state.failures.includes(path)) return reply({ message: 'Fixture unavailable. Please retry.' }, 503);
    const target = row => {
      const key = { product:'products', promotion:'promotions', category:'categories', model:'models' }[row.destination_type];
      return key ? choices[key].find(item => item.id === Number(row.destination_id)) : null;
    };
    if (path === '/banners' && method === 'GET') return reply(state.slides.filter(row => withinCarouselSchedule(row)).map(row => publicCarouselSlide(row, target(row) ? targetLink(row.destination_type, target(row)) : row.link_url)).sort((a,b) => a.display_order-b.display_order || a.id-b.id));
    if (path === '/banners/all') return state.user?.role === 'owner' ? reply(state.slides) : reply({ message:'Forbidden' },403);
    if (path === '/banners/destinations') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return reply({ ...choices, products: choices.products.filter(row => !search || `${row.name} ${row.part_number} ${row.motorcycle_model}`.toLowerCase().includes(search)), hasMoreProducts:false });
    }
    if (path === '/banners/destinations/promotion/51') return reply(ownerPromotions[0]);
    if (/^\/banners(?:\/\d+)?$/.test(path) && method !== 'GET') {
      if (state.user?.role !== 'owner') return reply({ message:'Forbidden' },403);
      state.writes.push({ path, method });
      if (method === 'DELETE') { state.slides=state.slides.filter(row => row.id!==Number(path.split('/')[2])); return reply({ message:'Deleted' }); }
      try {
        const id=Number(path.split('/')[2]) || Math.max(0,...state.slides.map(row => row.id))+1;
        const row={ ...parseCarouselBanner(request.postDataJSON()), id };
        const destination=target(row); if(destination) row.link_url=targetLink(row.destination_type,destination);
        state.slides=method==='POST' ? [...state.slides,row] : state.slides.map(item => item.id===id ? row : item);
        return reply({ banner:row },method==='POST' ? 201 : 200);
      } catch(error) { return reply({ message:error.message },400); }
    }
    if (path === '/announcements/toggle') return reply({ enabled:true });
    if (path.startsWith('/announcements')) return reply([]);
    if (path === '/discounts') return reply(ownerPromotions);
    if (path === '/reviews/moderation') return reply(state.reviews.filter(row => url.searchParams.get('status')==='all' || row.review_status===url.searchParams.get('status')));
    if (/^\/reviews\/\d+\/moderate$/.test(path)) { state.reviews[0].review_status=request.postDataJSON().status; return reply({ message:'Review updated.' }); }
    if (path === '/auth/sessions') return reply(state.sessions);
    if (path.startsWith('/auth/sessions/') && method==='DELETE') { state.sessions=[]; return reply({ success:true }); }
    if (path === '/dashboard/stats') return reply({ todaySales:1950, totalOrders:3 });
    if (path === '/admin/customers') return reply({ users:[{ id:90001,name:'Jamie Rider',email:'jamie@example.test',phone:'09171234567',role:'customer',created_at:'2026-10-01',is_active:true }], pagination:{ total:1 } });
    if (path === '/returns') return reply([{ id:71,order_id:88001,customer_name:'Jamie Rider',reason:'Incorrect part selected',status:'pending',refund_amount:650,created_at:'2026-10-16T08:00:00Z' }]);
    if (path.startsWith('/policies/')) return reply({ title:'Return policy',content:'<p>Contact the shop with your order details for return assistance.</p>' });
    if (path.startsWith('/reports/')) {
      const report=path.split('/').pop();
      return reply(report==='sales' ? { total_orders:3,total_revenue:1950,average_order_value:650,online_orders:2,pos_orders:1,total_discounts:0 } : report==='sales-by-channel' ? [{ channel:'online',total_revenue:1300,order_count:2 },{ channel:'pos',total_revenue:650,order_count:1 }] : report==='top-products' ? [{ product_name:'Front Brake Pad Set',total_quantity:3,total_revenue:1950 }] : report==='daily-trend' ? [{ date:'2026-10-15',revenue:650,orders:1 },{ date:'2026-10-16',revenue:1300,orders:2 }] : report==='stock-levels' ? { by_category:[{ category:'Parts',product_count:3,total_stock:27,low_stock_items:2 }] } : report==='customers' ? { total:1,new_this_month:1,most_active:[] } : {});
    }
    if (path.startsWith('/pos/')) return reply(path.endsWith('/capabilities') ? { can_access:true,can_discount:true,can_void:true } : path.endsWith('/products') ? { products:staffParts.map(row => ({ ...row,available_stock:row.stock_quantity })) } : []);
    if (path === '/products') return reply(choices.products.map(row => ({ ...row, status:'published', category_id:1 })));
    if (/^\/products\/\d+$/.test(path)) return reply({ ...choices.products[0],status:'published',category_id:1,variants:[] });
    if (path === '/categories') return reply(choices.categories);
    if (path === '/orders') return reply(staffOrders);
    return route.fallback();
  });
  return state;
}
