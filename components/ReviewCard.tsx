import React from 'react';
import { Star, ThumbsUp, CheckCircle, ImageIcon } from 'lucide-react';
import { Review } from '../types';
import StarRating from './StarRating';

interface ReviewCardProps {
  review: Review;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  const date = new Date(review.created_at);
  const timeAgo = getTimeAgo(date);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
            {review.user_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 text-sm">{review.user_name}</span>
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                <CheckCircle size={10} /> Verified
              </span>
            </div>
            <span className="text-xs text-gray-400">{timeAgo}</span>
          </div>
        </div>
        <StarRating rating={review.rating} size={14} />
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-50">
        <button className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <ThumbsUp size={13} /> Helpful
        </button>
      </div>
    </div>
  );
};

function getTimeAgo(date: Date): string {
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
