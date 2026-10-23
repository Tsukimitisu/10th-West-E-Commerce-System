import React, { useEffect, useState } from 'react';
import { Check, Search, Star, X } from 'lucide-react';
import { getReviewModerationQueue, moderateReview } from '../../services/api';
import StarRating from '../../components/StarRating';
import { handleProductImageError, resolveProductImageUrl } from '../../utils/productImages.js';
import { getCurrentAuthUser } from '../../services/authSession';
import PageHeader from '../../components/operations/PageHeader';
import BrandButton from '../../components/ui/BrandButton';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import DataToolbar, { FilterSelect } from '../../components/operations/DataToolbar';

const FILTERS = ['pending', 'approved', 'rejected', 'all'];

const statusBadgeClass = {
  pending: 'bg-amber-500/10 text-amber-600 border border-amber-200',
  approved: 'bg-green-500/10 text-green-600 border border-green-200',
  rejected: 'bg-red-500/10 text-red-600 border border-red-200',
};

const ReviewsView = () => {
  const isOwner = ['owner','admin'].includes(getCurrentAuthUser()?.role);
  const [reviews, setReviews] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [processingId, setProcessingId] = useState(null);

  const loadReviews = async (status = statusFilter) => {
    try {
      setLoading(true);
      setError('');
      const data = await getReviewModerationQueue(status);
      setReviews(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (!actionMessage) return undefined;
    const timer = window.setTimeout(() => setActionMessage(''), 2500);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const handleModeration = async (reviewId, nextStatus) => {
    try {
      setProcessingId(reviewId);
      setError('');
      const response = await moderateReview(reviewId, { status: nextStatus });
      setActionMessage(response?.message || 'Review updated.');

      setReviews((prev) => {
        if (statusFilter === 'pending') {
          return prev.filter((review) => review.id !== reviewId);
        }
        return prev.map((review) => (
          review.id === reviewId
            ? { ...review, review_status: nextStatus }
            : review
        ));
      });
    } catch (actionError) {
      setError(actionError?.message || 'Failed to update review.');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredReviews = reviews.filter((review) => {
    const haystack = `${review.product_name || ''} ${review.user_name || ''} ${review.comment || ''}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  if (isOwner) return <div className="space-y-5">
    <PageHeader title="Reviews" description="Approve or reject customer reviews before they appear on product pages." />
    <DataToolbar label="Review filters" search={search} onSearchChange={event => setSearch(event.target.value)} searchPlaceholder="Search product, buyer or review"><FilterSelect label="Review status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{FILTERS.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}</option>)}</FilterSelect></DataToolbar>
    {actionMessage && <p role="status" className="owner-account-feedback">{actionMessage}</p>}
    {error && <div role="alert" className="owner-account-feedback">{error}<BrandButton variant="ghost" onClick={() => loadReviews(statusFilter)}>Retry reviews</BrandButton></div>}
    {loading ? <div role="status" aria-label="Loading reviews" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading reviews…</div> : !error && !filteredReviews.length ? <EmptyState icon={Star} title="No reviews in this view" description="Try another review status or clear your search." action={search ? <BrandButton variant="secondary" onClick={() => setSearch('')}>Clear search</BrandButton> : undefined} /> : !error && <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Customer review records">
      {filteredReviews.map(review => <article className="owner-review-row" key={review.id}>
        <div className="owner-review-layout"><div className="owner-review-product">
          {review.product_image ? <img src={resolveProductImageUrl(review.product_image)} alt="" width="48" height="48" onError={handleProductImageError} /> : <Star size={22} className="shrink-0 text-slate-500" aria-hidden="true" />}
          <div className="min-w-0"><h2>{review.product_name || `Product #${review.product_id}`}</h2><p className="mt-1 text-sm text-slate-600">{review.user_name || 'Customer'}</p><time className="mt-1 block text-xs text-slate-600" dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString()}</time></div>
        </div><div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center gap-3"><StarRating rating={review.rating} size={15} /><StatusBadge tone={review.review_status==='approved' ? 'success' : review.review_status==='rejected' ? 'danger' : 'warning'}>{review.review_status || 'pending'}</StatusBadge>{review.verified_purchase && <StatusBadge tone="neutral">Verified purchase</StatusBadge>}</div><p className="owner-review-copy">{review.comment}</p></div>
          <div className="flex flex-wrap gap-2"><BrandButton size="sm" onClick={() => handleModeration(review.id,'approved')} disabled={processingId===review.id || review.review_status==='approved'}><Check size={15} aria-hidden="true" />Approve</BrandButton><BrandButton size="sm" variant="secondary" onClick={() => handleModeration(review.id,'rejected')} disabled={processingId===review.id || review.review_status==='rejected'}><X size={15} aria-hidden="true" />Reject</BrandButton></div>
        </div>
      </article>)}
    </section>}
  </div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Review Moderation</h1>
          <p className="text-sm text-gray-400 mt-1">Approve or reject customer reviews before they appear on product pages.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors ${
                statusFilter === filter
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, reviewer, or comment..."
            className="w-full rounded-xl border border-gray-800 bg-gray-900 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-red-400 focus:outline-none"
          />
        </div>
      </div>

      {actionMessage && <p className="text-sm text-green-400">{actionMessage}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-8 text-center text-gray-400">
          Loading reviews...
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-8 text-center text-gray-400">
          No reviews found for the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((review) => (
            <div key={review.id} className="rounded-2xl border border-gray-800 bg-gray-950/80 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  {review.product_image ? (
                    <img src={resolveProductImageUrl(review.product_image)} alt={review.product_name} onError={handleProductImageError} className="h-16 w-16 rounded-xl object-cover border border-gray-800" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-gray-800 bg-gray-900 text-gray-500">
                      <Star size={18} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-white">{review.product_name || `Product #${review.product_id}`}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeClass[review.review_status] || statusBadgeClass.pending}`}>
                        {review.review_status}
                      </span>
                      {review.verified_purchase && (
                        <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                          Verified Purchase
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      {review.user_name || 'Customer'} • {new Date(review.created_at).toLocaleString()}
                    </p>
                    <StarRating rating={review.rating} size={16} />
                    <p className="text-sm leading-relaxed text-gray-200">{review.comment}</p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleModeration(review.id, 'approved')}
                    disabled={processingId === review.id || review.review_status === 'approved'}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-700"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeration(review.id, 'rejected')}
                    disabled={processingId === review.id || review.review_status === 'rejected'}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-700"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewsView;
