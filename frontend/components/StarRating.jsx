import React from 'react';
import { Star } from 'lucide-react';

const StarRating = ({ rating, count, size = 16, interactive = false, onChange }) => {
  return (
    <div className="flex items-center gap-1" role={interactive ? 'group' : 'img'} aria-label={interactive ? 'Choose your rating' : `${Number(rating || 0).toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(star => {
        const icon = <Star size={size} aria-hidden="true" className={`${star <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} transition-colors`} />;
        return interactive
          ? <button key={star} type="button" aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`} aria-pressed={Number(rating) === star} onClick={() => onChange?.(star)} className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-orange-50">{icon}</button>
          : <span key={star}>{icon}</span>;
      })}
      {count !== undefined && (
        <span className="text-xs text-slate-600 ml-1">({count})</span>
      )}
    </div>
  );
};

export default StarRating;


