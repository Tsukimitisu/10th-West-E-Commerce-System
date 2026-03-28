import React, { useEffect, useRef, useState } from 'react';

// Lightweight PH-focused address autocomplete using Nominatim (OpenStreetMap).
// Expects parent to manage the final form fields; this only suggests and returns parsed address parts.
const AddressAutocomplete = ({
  value,
  onSelect,
  onInputChange,
  placeholder = 'Search address (Philippines)',
  disabled = false,
  context = {},
  strictContext = false,
}) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
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
        // Clean up redundant parts if the user typed their full address
        const queryParts = query.split(',').map(s => s.trim());
        const allParts = [...queryParts, context.barangay, context.city, context.state, 'Philippines'].filter(Boolean);
        const uniqueParts = Array.from(new Set(allParts));
        const cleanQuery = uniqueParts.join(', ');

        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ph&q=${encodeURIComponent(cleanQuery)}`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept-Language': 'en',
            'User-Agent': '10th-west-moto-address-autocomplete'
          }
        });
        if (!res.ok) throw new Error('Failed to fetch suggestions');
        const data = await res.json();
        let list = Array.isArray(data) ? data : [];

        setSuggestions(list);
        setOpen(list.length > 0);
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
      lat: s.lat ? Number(s.lat) : null,
      lng: s.lon ? Number(s.lon) : null,
    });
    setQuery(street);
    setSuggestions([]);
    setOpen(false);
  };

  const handleOutsideClick = (event) => {
    if (containerRef.current && !containerRef.current.contains(event.target)) {
      setSuggestions([]);
      setOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const renderLabel = (s) => {
    const addr = s.address || {};
    const primary = [addr.house_number, addr.road].filter(Boolean).join(' ').trim() || s.display_name;
    const barangay = addr.suburb || addr.village || addr.neighbourhood || addr.hamlet || '';
    const locality = addr.city || addr.town || addr.municipality || addr.county || '';
    const province = addr.state || addr.region || '';
    const zip = addr.postcode || '';
    const secondary = [barangay, locality, province, zip].filter(Boolean).join(', ');
    return { primary, secondary };
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onInputChange?.(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm bg-gray-900 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-haspopup="listbox"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Loading...</div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto" role="listbox">
          {suggestions.map((s) => {
            const label = renderLabel(s);
            return (
              <button
                type="button"
                key={s.place_id}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-sm text-gray-100"
                role="option"
              >
                <div className="font-medium truncate">{label.primary}</div>
                {label.secondary && <div className="text-xs text-gray-400 truncate">{label.secondary}</div>}
              </button>
            );
          })}
        </div>
      )}
      {open && !loading && !error && suggestions.length === 0 && query.trim().length >= 3 && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-sm text-gray-400 px-3 py-2">
          No suggestions found. Try refining your search.
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;


