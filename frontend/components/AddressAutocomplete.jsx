import React, { useEffect, useRef, useState } from 'react';

// Lightweight PH-focused address autocomplete using Nominatim (OpenStreetMap).
// Expects parent to manage the final form fields; this only suggests and returns parsed address parts.
const AddressAutocomplete = ({ value, onSelect, onInputChange, placeholder = 'Search address (Philippines)', disabled = false }) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setError('');
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');

    const timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ph&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept-Language': 'en',
            'User-Agent': '10th-west-moto-address-autocomplete'
          }
        });
        if (!res.ok) throw new Error('Failed to fetch suggestions');
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError('Could not load suggestions');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (s) => {
    const addr = s.address || {};
    const barangay = addr.suburb || addr.village || addr.neighbourhood || addr.hamlet || '';
    const city = addr.city || addr.town || addr.municipality || addr.county || '';
    const province = addr.state || addr.region || '';
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ').trim() || addr.road || s.display_name || '';
    const postal_code = addr.postcode || '';

    onSelect?.({
      street,
      barangay,
      city,
      state: province,
      postal_code,
      country: 'Philippines',
    });
    setQuery(street);
    setSuggestions([]);
  };

  const handleOutsideClick = (event) => {
    if (containerRef.current && !containerRef.current.contains(event.target)) {
      setSuggestions([]);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onInputChange?.(e.target.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Loading...</div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.place_id}
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm text-gray-700"
            >
              {s.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
