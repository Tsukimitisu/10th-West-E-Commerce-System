import React, { useEffect, useMemo, useState } from 'react';
import { ThumbsUp, CheckCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [previewIndex, setPreviewIndex] = useState(-1);

  const activePreviewItem = useMemo(() => {
    if (previewIndex < 0 || previewIndex >= mediaItems.length) return null;
    return mediaItems[previewIndex];
  }, [mediaItems, previewIndex]);

  useEffect(() => {
    if (!activePreviewItem) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewIndex(-1);
      } else if (event.key === 'ArrowRight' && mediaItems.length > 1) {
        setPreviewIndex((prev) => (prev + 1) % mediaItems.length);
      } else if (event.key === 'ArrowLeft' && mediaItems.length > 1) {
        setPreviewIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePreviewItem, mediaItems.length]);

  const openPreview = (index) => {
    setPreviewIndex(index);
  };

  const closePreview = () => {
    setPreviewIndex(-1);
  };

  const showPreviousPreview = () => {
    if (mediaItems.length <= 1) return;
    setPreviewIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);
  };

  const showNextPreview = () => {
    if (mediaItems.length <= 1) return;
    setPreviewIndex((prev) => (prev + 1) % mediaItems.length);
  };

  return (
    <>
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
        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{review.comment}</p>

        {mediaItems.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {mediaItems.map((item, index) => (
              <button
                key={`${item.url}-${index}`}
                type="button"
                onClick={() => openPreview(index)}
                className="group relative overflow-hidden rounded-lg border border-gray-700 bg-black/20 text-left"
              >
                {item.kind === 'video' ? (
                  <video src={item.url} className="h-40 w-full object-cover" preload="metadata" muted playsInline />
                ) : (
                  <img src={item.url} alt="Review attachment" className="h-40 w-full object-cover" loading="lazy" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {item.kind === 'video' ? 'Preview video' : 'Preview image'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-700">
          <button className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            <ThumbsUp size={13} /> Helpful
          </button>
        </div>
      </div>

      {activePreviewItem && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          onClick={closePreview}
        >
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-4 text-white">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{userName}</p>
                <p className="text-xs text-gray-300">{timeAgo}</p>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-xl border border-white/20 bg-black/60">
              <div className="flex h-full w-full items-center justify-center p-3 md:p-6">
                {activePreviewItem.kind === 'video' ? (
                  <video
                    src={activePreviewItem.url}
                    controls
                    autoPlay
                    className="max-h-full w-full rounded-lg object-contain"
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={activePreviewItem.url}
                    alt="Review media preview"
                    className="max-h-full w-full rounded-lg object-contain"
                  />
                )}
              </div>

              {mediaItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPreviousPreview}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    aria-label="Previous media"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={showNextPreview}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    aria-label="Next media"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                {previewIndex + 1} / {mediaItems.length}
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-black/40 p-3 text-white">
              <StarRating rating={review.rating} size={14} />
              <p className="mt-2 text-sm text-gray-100 whitespace-pre-wrap">{review.comment}</p>
            </div>
          </div>
        </div>
      )}
    </>
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


