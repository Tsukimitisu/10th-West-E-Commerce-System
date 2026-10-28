import test from 'node:test';
import assert from 'node:assert/strict';
import { managedHeroSlides } from '../utils/managedHero.js';

test('Owner metadata integrates without changing legacy Customer slide behavior', () => {
  const now=Date.parse('2026-10-20T10:00:00Z');
  const base={id:1,title:'Oil weekend',is_active:true,image_url:'/brand/ride-detail.webp',display_order:2,alt_text:'Oil service',link_url:'/shop?promotion=51'};
  const rows=[base,{...base,id:2,title:'Future',starts_at:'2026-10-21T00:00:00Z'},
    {...base,id:3,title:'Expired',ends_at:'2026-10-20T10:00:00Z'}, {...base,id:4,title:'Inactive',is_active:false},
    {...base,id:5,title:'Invalid date',starts_at:'invalid'}, {...base,id:6,title:'Current',starts_at:'2026-10-20T10:00:00Z',ends_at:'2026-10-22T00:00:00Z',display_order:1},
    {id:7,title:'Legacy',display_order:3,link_url:'/shop'}];
  const slides=managedHeroSlides(rows,[],now);
  assert.deepEqual(slides.map(row=>row.title),['Current','Oil weekend','Legacy']);
  assert.equal(slides[0].alt,'Oil service');
  assert.equal(slides[1].destination.href,'/shop?promotion=51');
  assert.equal(slides[2].destination.href,'/shop');
  assert.deepEqual(managedHeroSlides([],[],now),[]);
});

test('Owner destination metadata preserves no-link, product, model and category destinations', () => {
  const routes=['','/products/98001','/shop?model=Click%20125','/shop?category=1'];
  const slides=managedHeroSlides(routes.map((link_url,id)=>({id,title:`Slide ${id}`,is_active:true,link_url})));
  assert.equal(slides[0].destination,null);
  assert.deepEqual(slides.slice(1).map(row=>row.destination.href),routes.slice(1));
});
