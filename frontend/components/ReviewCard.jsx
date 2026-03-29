import React from 'react';
import { ThumbsUp, CheckCircle } from 'lucide-react';
import StarRating from './StarRating';

const isVideoUrl = (value = '') => /\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i.test(String(value));

const normalizeReviewMedia = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return {
          url: item.trim(),
          kind: isVideoUrl(item) ? 'video' : 'image',
        };
      }

      if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.trim()) {
        const hint = String(item.kind || item.type || item.media_type || '').toLowerCase();
        const kind = hint === 'video' || hint === 'image' ? hint : (isVideoUrl(item.url) ? 'video' : 'image');
        return {
          url: item.url.trim(),
          kind,
        };
      }

      return null;
    })
    .filter(Boolean);
};

const ReviewCard = ({ review }) => {
  const date = new Date(review.created_at);
  const timeAgo = getTimeAgo(date);
  const userName = review.user_name || 'Customer';
  const userInitial = userName.charAt(0).toUpperCase();
  const reviewStatus = String(review.review_status || '').toLowerCase();
  const mediaItems = normalizeReviewMedia(review.media_urls || review.media || []);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {review.user_avatar ? (
            <img src={review.user_avatar} alt={userName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
              {userInitial}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white text-sm">{userName}</span>
              {reviewStatus === 'pending' && review.is_mine && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300 bg-amber-900/40 px-2 py-0.5 rounded">
                  Pending
                </span>
              )}
              {review.verified_purchase && (
                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                  <CheckCircle size={10} /> Verified Purchase
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">{timeAgo}</span>
          </div>
        </div>
        <StarRating rating={review.rating} size={14} />
      </div>
      <p className="text-sm text-gray-200 leading-relaxed">{review.comment}</p>

      {mediaItems.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {mediaItems.map((item, index) => (
            <div key={`${item.url}-${index}`} className="overflow-hidden rounded-lg border border-gray-700 bg-black/20">
              {item.kind === 'video' ? (
                <video src={item.url} controls className="h-40 w-full object-cover" preload="metadata" />
              ) : (
                <img src={item.url} alt="Review attachment" className="h-40 w-full object-cover" loading="lazy" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-700">
        <button className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          <ThumbsUp size={13} /> Helpful
        </button>
      </div>
    </div>
  );
};

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export default ReviewCard;


