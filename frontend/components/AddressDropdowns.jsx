import React, { useEffect, useState } from 'react';

// Hierarchical Philippines location picker powered by PSGC open API (psgc.gitlab.io).
// Emits chosen province/city/municipality/barangay names and codes via onChange.
const AddressDropdowns = ({
  province = '',
  city = '',
  barangay = '',
  onChange,
  disabled = false,
  labels = { province: 'Province', city: 'City / Municipality', barangay: 'Barangay' },
}) => {
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  const [selectedProvince, setSelectedProvince] = useState({ code: '', name: province || '' });
  const [selectedCity, setSelectedCity] = useState({ code: '', name: city || '' });
  const [selectedBarangay, setSelectedBarangay] = useState(barangay || '');

  const [loadingProvince, setLoadingProvince] = useState(false);
  const [loadingCity, setLoadingCity] = useState(false);
  const [loadingBarangay, setLoadingBarangay] = useState(false);

  const [error, setError] = useState('');

  const BASE = 'https://psgc.gitlab.io/api';
  const NCR_REGION_CODE = '130000000';
  const NCR_OPTION = { code: 'NCR', name: 'Metro Manila (NCR)', isNcr: true };
  // Sync props to state if they change externally (e.g., from Autocomplete)
  useEffect(() => {
    if (province && province.toLowerCase() !== selectedProvince.name.toLowerCase()) {
      setSelectedProvince({ code: '', name: province });
    }
  }, [province]);

  useEffect(() => {
    if (city && city.toLowerCase() !== selectedCity.name.toLowerCase()) {
      setSelectedCity({ code: '', name: city });
    }
  }, [city]);

  useEffect(() => {
    if (barangay && barangay.toLowerCase() !== selectedBarangay.toLowerCase()) {
      setSelectedBarangay(barangay);
    }
  }, [barangay]);
  const emitChange = (next) => {
    onChange?.({
      province: next.province ?? selectedProvince.name,
      provinceCode: next.provinceCode ?? selectedProvince.code,
      city: next.city ?? selectedCity.name,
      cityCode: next.cityCode ?? selectedCity.code,
      barangay: next.barangay ?? selectedBarangay,
    });
  };

  // Load provinces once.
  useEffect(() => {
    const load = async () => {
      setLoadingProvince(true);
      setError('');
      try {
        const res = await fetch(`${BASE}/provinces/?per_page=200`);
        if (!res.ok) throw new Error('Failed to load provinces');
        const data = await res.json();
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : [];
        setProvinces([NCR_OPTION, ...sorted]);
      } catch (err) {
        setError('Unable to load provinces. Please try again.');
      } finally {
        setLoadingProvince(false);
      }
    };
    load();
  }, []);

  // When provinces load, try to match existing province name to a code.
  useEffect(() => {
    if (!selectedProvince.code && selectedProvince.name && provinces.length) {
      const match = provinces.find((p) => p.name.toLowerCase() === selectedProvince.name.toLowerCase());
      if (match) {
        setSelectedProvince({ code: match.code, name: match.name });
      }
    }
  }, [provinces, selectedProvince.name, selectedProvince.code]);

  // Fetch cities when province code changes.
  useEffect(() => {
    if (!selectedProvince.code) {
      setCities([]);
      setSelectedCity({ code: '', name: '' });
      setBarangays([]);
      setSelectedBarangay('');
      emitChange({ province: '', provinceCode: '', city: '', cityCode: '', barangay: '' });
      return;
    }

    const loadCities = async () => {
      setLoadingCity(true);
      setError('');
      try {
        const url = selectedProvince.code === NCR_OPTION.code
          ? `${BASE}/regions/${NCR_REGION_CODE}/cities-municipalities/?per_page=500`
          : `${BASE}/provinces/${selectedProvince.code}/cities-municipalities/?per_page=500`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load cities');
        const data = await res.json();
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : [];
        setCities(sorted);
      } catch (err) {
        setError('Unable to load cities/municipalities.');
      } finally {
        setLoadingCity(false);
      }
    };

    loadCities();
  }, [selectedProvince.code]);

  // When cities load, try to match existing city name to a code.
  useEffect(() => {
    if (!selectedCity.code && selectedCity.name && cities.length) {
      const match = cities.find((c) => c.name.toLowerCase() === selectedCity.name.toLowerCase());
      if (match) {
        setSelectedCity({ code: match.code, name: match.name });
      }
    }
  }, [cities, selectedCity.name, selectedCity.code]);

  // Fetch barangays when city code changes.
  useEffect(() => {
    if (!selectedCity.code) {
      setBarangays([]);
      setSelectedBarangay('');
      emitChange({ city: '', cityCode: '', barangay: '' });
      return;
    }

    const loadBarangays = async () => {
      setLoadingBarangay(true);
      setError('');
      try {
        const res = await fetch(`${BASE}/cities-municipalities/${selectedCity.code}/barangays/?per_page=1000`);
        if (!res.ok) throw new Error('Failed to load barangays');
        const data = await res.json();
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : [];
        setBarangays(sorted);
      } catch (err) {
        setError('Unable to load barangays.');
      } finally {
        setLoadingBarangay(false);
      }
    };

    loadBarangays();
  }, [selectedCity.code]);

  // When barangays list loads, try to keep existing barangay selection if present.
  useEffect(() => {
    if (selectedBarangay && barangays.length) {
      const match = barangays.find((b) => b.name.toLowerCase() === selectedBarangay.toLowerCase());
      if (!match) {
        setSelectedBarangay('');
      }
    }
  }, [barangays, selectedBarangay]);

  // Emit on initial mount to sync defaults.
  useEffect(() => {
    emitChange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProvinceChange = (code) => {
    const found = provinces.find((p) => p.code === code);
    const name = found?.name || '';
    setSelectedProvince({ code, name });
    setSelectedCity({ code: '', name: '' });
    setSelectedBarangay('');
    setCities([]);
    setBarangays([]);
    emitChange({ province: name, provinceCode: code, city: '', cityCode: '', barangay: '' });
  };

  const handleCityChange = (code) => {
    const found = cities.find((c) => c.code === code);
    const name = found?.name || '';
    setSelectedCity({ code, name });
    setSelectedBarangay('');
    setBarangays([]);
    emitChange({ city: name, cityCode: code, barangay: '' });
  };

  const handleBarangayChange = (name) => {
    setSelectedBarangay(name);
    emitChange({ barangay: name });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.province}</label>
        <select
          value={selectedProvince.code}
          onChange={(e) => handleProvinceChange(e.target.value)}
          disabled={disabled || loadingProvince}
          className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-800"
        >
          <option value="">Select a province</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        {loadingProvince && <p className="text-xs text-gray-400 mt-1">Loading provinces...</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.city}</label>
        <select
          value={selectedCity.code}
          onChange={(e) => handleCityChange(e.target.value)}
          disabled={disabled || !selectedProvince.code || loadingCity}
          className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-800 disabled:bg-gray-900 disabled:text-gray-400"
        >
          <option value="">{selectedProvince.code ? 'Select a city/municipality' : 'Choose province first'}</option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
        {loadingCity && <p className="text-xs text-gray-400 mt-1">Loading cities/municipalities...</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.barangay}</label>
        <select
          value={selectedBarangay}
          onChange={(e) => handleBarangayChange(e.target.value)}
          disabled={disabled || !selectedCity.code || loadingBarangay}
          className="w-full px-3 py-2.5 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-gray-800 disabled:bg-gray-900 disabled:text-gray-400"
        >
          <option value="">{selectedCity.code ? 'Select a barangay' : 'Choose city/municipality first'}</option>
          {barangays.map((b) => (
            <option key={b.code} value={b.name}>{b.name}</option>
          ))}
        </select>
        {loadingBarangay && <p className="text-xs text-gray-400 mt-1">Loading barangays...</p>}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default AddressDropdowns;


