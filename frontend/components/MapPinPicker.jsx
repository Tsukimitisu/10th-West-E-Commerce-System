import React, { useEffect, useRef, useState } from 'react';

// Lightweight Leaflet-based map picker loaded via CDN (no extra dependency in package.json).
// Shows after street is filled; geocodes PH address via Nominatim, then lets user drag the pin.
// Emits { lat, lng } through onChange.
const MapPinPicker = ({ street, barangay, city, state, onChange, height = 280, disabled = false }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');
  const [lastAddressKey, setLastAddressKey] = useState('');

  const loadLeaflet = () => new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);

    const existingCss = document.getElementById('leaflet-css');
    if (!existingCss) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (!cancelled) setLeafletReady(true);
    }).catch(() => {
      if (!cancelled) setError('Map failed to load.');
    });
    return () => { cancelled = true; };
  }, []);

  // Initialize map once Leaflet is ready
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return;
    const L = window.L;
    const fallbackCenter = [12.8797, 121.7740]; // Philippines centroid
    const map = L.map(mapContainerRef.current).setView(fallbackCenter, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(fallbackCenter, { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange?.({ lat: pos.lat, lng: pos.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
    };
  }, [leafletReady, onChange]);

  // Geocode when address parts are present
  useEffect(() => {
    if (!leafletReady || !city || !state || (!street && !barangay)) return;
    const addressKey = `${street || ''}|${barangay || ''}|${city}|${state}`;
    if (addressKey === lastAddressKey) return;
    setLastAddressKey(addressKey);

    const L = window.L;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const query = street
      ? `${street}${barangay ? `, ${barangay}` : ''}, ${city}, ${state}, Philippines`
      : `${barangay}, ${city}, ${state}, Philippines`;
    setGeocoding(true);
    setError('');
    const controller = new AbortController();

    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': '10th-west-moto-map-pin',
      },
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error('Failed to geocode');
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('No results');
      const { lat, lon } = data[0];
      const next = [Number(lat), Number(lon)];
      map.setView(next, 17);
      marker.setLatLng(next);
      onChange?.({ lat: Number(lat), lng: Number(lon) });
    }).catch(() => {
      setError('Could not locate that address. You can drag the pin manually.');
      // Keep existing marker position
    }).finally(() => setGeocoding(false));

    return () => controller.abort();
  }, [leafletReady, street, barangay, city, state, onChange, lastAddressKey]);

  if (!street && !barangay) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Pin exact location</p>
        {geocoding && <span className="text-xs text-gray-500">Locating…</span>}
      </div>
      <div
        ref={mapContainerRef}
        className="w-full rounded-lg border border-gray-200 overflow-hidden"
        style={{ height: `${height}px`, pointerEvents: disabled ? 'none' : 'auto', filter: disabled ? 'grayscale(0.6)' : 'none' }}
      />
      {error && <p className="text-xs text-orange-500">{error}</p>}
      <p className="text-xs text-gray-500">Drag the pin if the automatic placement is off. Lat/Lng are saved with the address/order.</p>
    </div>
  );
};

export default MapPinPicker;
