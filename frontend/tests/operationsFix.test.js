import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
import { returnLabels, returnProgress } from '../utils/returnStatus.js';

test('offline preparation exposes progress and feedback beside its explicit submit action', () => {
  const ui = source('../components/staff/OfflinePosSetup.jsx');
  assert.match(ui, /Prepare Offline POS/);
  assert.match(ui, /type="submit"/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /Offline POS Ready/);
  assert.ok(ui.indexOf('{message &&') < ui.indexOf('id="offline-reserve-editor"'));
});

test('actual return statuses have customer labels and rejected/manual review do not claim refund completion', () => {
  for(const status of ['pending','approved','received','refund_processing','refunded','rejected','manual_review']) assert.ok(returnLabels[status]);
  assert.equal(returnProgress('approved').at(-1), 'Approved — return item to shop');
  assert.ok(!returnProgress('rejected').includes('Refunded'));
  assert.ok(!returnProgress('manual_review').includes('Refunded'));
  assert.equal(returnProgress('refunded').at(-1),'Refunded');
});

test('both dashboards use backend channel metrics and keep socket refresh', () => {
  for(const file of ['owner/DashboardView.jsx','staff/StaffDashboardView.jsx']) {
    const ui=source(`../pages/${file}`);assert.match(ui,/todayInStoreSales/);assert.match(ui,/todayOnlineSales/);assert.match(ui,/In-store Sales/);assert.match(ui,/Online Sales/);assert.match(ui,/useSocketEvent\('order:updated'/);
  }
});

test('hero keeps narrow accessible edge targets, focus visibility, swipe, dots and independent CTA',()=>{
  const hero=source('../components/customer/ManagedHeroCarousel.jsx');const css=source('../styles/storefront.css');
  assert.match(hero,/managed-hero-previous/);assert.match(hero,/managed-hero-next/);assert.match(hero,/aria-label="Previous slide"/);assert.match(hero,/aria-label="Next slide"/);assert.match(hero,/onTouchEnd/);assert.match(hero,/onKeyDown/);assert.match(hero,/Go to slide/);assert.match(hero,/<BrandButton/);
  assert.match(css,/\.managed-hero-arrow \{[^}]*width:48px[^}]*opacity:0/s);assert.match(css,/\.managed-hero-arrow:focus-visible/);assert.match(css,/\.managed-hero:hover \.managed-hero-arrow/);
});

test('service worker registration errors reach offline preparation instead of being discarded', () => {
  const pwa = source('../services/posPwa.js');
  assert.doesNotMatch(pwa, /register\('\/pos-sw\.js'\)\.catch\(\(\)=>\{\}\)/);
});
