import React, { useId, useRef } from 'react';
import { Check } from 'lucide-react';
import OptionImage from '../ui/OptionImage.jsx';
import { formatPeso } from '../../utils/formatPeso.js';

export default function SetOptionCards({ options,selectedId,onSelect,cover }) {
  const heading = useId(), optionRefs = useRef([]);
  const choose = option => { if (option.is_available) onSelect(option.id); };
  const handleOptionKeyDown = (event,index) => {
    if (!['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const step = ['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1;
    for (let offset=1;offset<=options.length;offset++) {
      const next = (index+step*offset+options.length)%options.length;
      if (options[next].is_available) { optionRefs.current[next]?.focus();choose(options[next]);return; }
    }
  };
  return <div>
        <p id={heading} className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Choose item</p>
        <div role="radiogroup" aria-labelledby={heading} className="mb-5 grid max-h-[42vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {options.map((option, index) => {
            const isSelected = option.id === selectedId;
            return (
              <button
                key={option.id}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!option.is_available || undefined}
                tabIndex={isSelected || (!selectedId && index === options.findIndex((entry) => entry.is_available)) ? 0 : -1}
                onClick={() => choose(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                data-testid="set-option"
                className={`flex min-h-16 items-center gap-3 rounded-lg border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${isSelected ? 'border-orange-600 bg-orange-50 ring-1 ring-orange-600' : 'border-slate-200 bg-white hover:border-slate-400'} ${option.is_available ? '' : 'cursor-not-allowed opacity-55'}`}
              >
                <OptionImage src={option.image} fallback={cover} alt="" width="48" height="48" className="h-12 w-12 shrink-0 rounded-md border border-slate-200 bg-white object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{option.name}</span>
                  <span className="block truncate text-xs text-slate-600">{[option.color, option.part_number && `Part # ${option.part_number}`].filter(Boolean).join(' · ')}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{option.price == null ? '' : formatPeso(option.price)}</span>
                    <span className={option.is_available ? 'text-slate-600' : 'font-semibold text-red-700'}>{option.is_available ? `${option.stock_quantity} in stock` : option.unavailable_reason}</span>
                  </span>
                </span>
                {isSelected && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-600 text-white"><Check size={14} aria-hidden="true" /><span className="sr-only">Selected</span></span>}
              </button>
            );
          })}
        </div>
  </div>;
}
