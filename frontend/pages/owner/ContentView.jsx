import React, { useState, useEffect } from 'react';
import { Save, Plus, Edit3, Trash2, FileText, HelpCircle, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { getPolicy, updatePolicy, getFAQs, createFAQ, updateFAQ, deleteFAQ } from '../../services/api';
import RichText from '../../components/ui/RichText';
import RichTextEditor from '../../components/owner/RichTextEditor';
import Modal from '../../components/owner/Modal';
import PageHeader from '../../components/operations/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';

const POLICY_TYPES = [
  { key: 'return_policy', label: 'Return Policy' },
  { key: 'privacy_policy', label: 'Privacy Policy' },
  { key: 'terms_of_service', label: 'Terms of Service' },
  { key: 'shipping_policy', label: 'Shipping Policy' },
];

const inputClass = 'w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10';
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50';

const ContentView = () => {
  const [mainTab, setMainTab] = useState('policies');
  const [policyTab, setPolicyTab] = useState('return_policy');

  // Policy state
  const [previewPolicy, setPreviewPolicy] = useState(false);
  const [policyDirty, setPolicyDirty] = useState(false);
  const [policyTitle, setPolicyTitle] = useState('');
  const [policyContent, setPolicyContent] = useState('');
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const [policyError, setPolicyError] = useState('');

  // FAQ state
  const [faqs, setFaqs] = useState([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqError, setFaqError] = useState('');
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    is_active: true,
    display_order: 0,
  });
  const [faqSaving, setFaqSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Load policy when policy tab changes
  useEffect(() => {
    if (mainTab !== 'policies') return;
    const loadPolicy = async () => {
      setPolicyLoading(true);
      setPolicyError('');
      setPolicySaved(false);
      try {
        const data = await getPolicy(policyTab);
        setPolicyTitle(data?.title || '');
        setPolicyContent(data?.content || '');
        setPolicyDirty(false);
      } catch (err) {
        console.error('Failed to load policy:', err);
        setPolicyError('Failed to load policy content.');
        setPolicyTitle('');
        setPolicyContent('');
      }
      setPolicyLoading(false);
    };
    loadPolicy();
  }, [policyTab, mainTab]);

  // Load FAQs when FAQ tab is active
  useEffect(() => {
    if (mainTab !== 'faqs') return;
    loadFaqs();
  }, [mainTab]);

  const loadFaqs = async () => {
    setFaqLoading(true);
    setFaqError('');
    try {
      const data = await getFAQs(true);
      setFaqs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load FAQs:', err);
      setFaqError('Failed to load FAQs.');
      setFaqs([]);
    }
    setFaqLoading(false);
  };

  const handleSavePolicy = async () => {
    setPolicySaving(true);
    setPolicyError('');
    setPolicySaved(false);
    try {
      await updatePolicy(policyTab, policyTitle, policyContent);
      setPolicySaved(true);
      setPolicyDirty(false);
      setTimeout(() => setPolicySaved(false), 3000);
    } catch (err) {
      console.error('Failed to save policy:', err);
      setPolicyError('Failed to save policy. Please try again.');
    }
    setPolicySaving(false);
  };

  const openAddFaq = () => {
    setEditingFaq(null);
    setFaqForm({ question: '', answer: '', is_active: true, display_order: faqs.length + 1 });
    setFaqModalOpen(true);
  };

  const openEditFaq = (faq) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question || '',
      answer: faq.answer || '',
      is_active: faq.is_active !== false,
      display_order: faq.display_order || 0,
    });
    setFaqModalOpen(true);
  };

  const handleFaqSubmit = async (e) => {
    e.preventDefault();
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;
    setFaqSaving(true);
    setFaqError('');
    try {
      if (editingFaq) {
        await updateFAQ(editingFaq.id, faqForm);
      } else {
        await createFAQ(faqForm);
      }
      setFaqModalOpen(false);
      await loadFaqs();
    } catch (err) {
      console.error('Failed to save FAQ:', err);
      setFaqError(err.message || 'Failed to save FAQ. Please try again.');
    }
    setFaqSaving(false);
  };

  const handleDeleteFaq = async (id) => {
    try {
      await deleteFAQ(id);
      setDeleteConfirm(null);
      await loadFaqs();
    } catch (err) {
      console.error('Failed to delete FAQ:', err);
      setFaqError('Failed to delete FAQ.');
    }
  };

  const mainTabs = [
    { id: 'policies', label: 'Policies', icon: FileText },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Content management"
        description="Edit store policies and the answers customers see in Help & FAQ."
        actions={mainTab === 'faqs' && (
          <button type="button" onClick={openAddFaq} className={primaryButtonClass}>
            <Plus size={16} aria-hidden="true" /> Add FAQ
          </button>
        )}
      />

      <div className="border-b border-slate-200" role="tablist" aria-label="Content type">
        <div className="flex gap-1">
          {mainTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mainTab === t.id}
              onClick={() => setMainTab(t.id)}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${
                mainTab === t.id
                  ? 'border-orange-600 text-slate-950'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              <t.icon size={16} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {mainTab === 'policies' && (
        <div className="space-y-4">
          <div tabIndex={0} className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit" role="tablist" aria-label="Policy">
            {POLICY_TYPES.map((pt) => (
              <button
                key={pt.key}
                type="button"
                role="tab"
                aria-selected={policyTab === pt.key}
                onClick={() => setPolicyTab(pt.key)}
                className={`min-h-9 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors ${
                  policyTab === pt.key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {policyLoading ? (
              <div className="space-y-3" role="status" aria-label="Loading policy">
                <div className="skeleton h-10 w-full rounded-lg" />
                <div className="skeleton h-72 w-full rounded-lg" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="policy-title" className={labelClass}>Title</label>
                  <input
                    id="policy-title"
                    type="text"
                    value={policyTitle}
                    onChange={(e) => {
                      setPolicyTitle(e.target.value);
                      setPolicyDirty(true);
                      setPolicySaved(false);
                    }}
                    placeholder="e.g. Return Policy"
                    className={inputClass}
                  />
                </div>

                <div>
                  <p className={labelClass}>Content</p>
                  {previewPolicy ? <div className="min-h-[300px] rounded-lg border border-slate-200 bg-slate-50 p-5"><RichText value={policyContent} fallback={<p className="text-sm text-slate-600">No policy content yet.</p>} /></div> : <RichTextEditor
                    value={policyContent}
                    onChange={(html) => {
                      setPolicyContent(html);
                      setPolicyDirty(true);
                      setPolicySaved(false);
                    }}
                    placeholder="Write the policy customers will read…"
                    minHeight="300px"
                  />}
                  <p className="mt-1.5 text-xs text-slate-500">Use Heading for section titles. Bold and italic are kept when you save.</p>
                </div>

                {policyError && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{policyError}</p>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  <button type="button" onClick={handleSavePolicy} disabled={policySaving} className={primaryButtonClass}>
                    {policySaving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                    {policySaving ? 'Saving…' : 'Save policy'}
                  </button>
                  <button type="button" onClick={() => setPreviewPolicy(current => !current)} className={secondaryButtonClass}>{previewPolicy ? 'Back to editor' : 'Preview policy'}</button>
                  <span role="status" className="text-sm font-medium text-emerald-700">
                    {policyDirty && <span className="text-slate-600">Unsaved changes</span>}
                    {policySaved && <span className="inline-flex items-center gap-1.5"><Check size={16} aria-hidden="true" /> Policy saved</span>}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {mainTab === 'faqs' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-slate-950">Frequently asked questions</h2>
            <span className="text-xs text-slate-500">{faqs.length} {faqs.length === 1 ? 'entry' : 'entries'}</span>
          </header>
          {faqLoading ? (
            <div className="space-y-3 p-4 sm:p-5" role="status" aria-label="Loading FAQs">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-16 w-full rounded-lg" />)}
            </div>
          ) : faqError && !faqModalOpen ? (
            <div className="p-4 sm:p-5">
              <EmptyState tone="error" title="FAQs could not be loaded" description={faqError} action={<button type="button" onClick={loadFaqs} className={secondaryButtonClass}>Try again</button>} />
            </div>
          ) : faqs.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState icon={HelpCircle} title="No FAQs yet" description="Answer the questions customers ask most, such as fitment, shipping times, and returns." action={<button type="button" onClick={openAddFaq} className={primaryButtonClass}><Plus size={16} aria-hidden="true" /> Add FAQ</button>} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {faqs.map((faq) => (
                <li key={faq.id} className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-950">{faq.question}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{faq.answer}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <StatusBadge tone={faq.is_active !== false ? 'success' : 'neutral'} icon={faq.is_active !== false ? Eye : EyeOff}>
                        {faq.is_active !== false ? 'Visible' : 'Hidden'}
                      </StatusBadge>
                      {faq.display_order != null && <span className="text-xs text-slate-500">Position {faq.display_order}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {deleteConfirm === faq.id ? (
                      <>
                        <button type="button" onClick={() => handleDeleteFaq(faq.id)} className="min-h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
                        <button type="button" onClick={() => setDeleteConfirm(null)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => openEditFaq(faq)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Edit FAQ: ${faq.question}`}>
                          <Edit3 size={16} />
                        </button>
                        <button type="button" onClick={() => setDeleteConfirm(faq.id)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete FAQ: ${faq.question}`}>
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal isOpen={faqModalOpen} onClose={() => setFaqModalOpen(false)} title={editingFaq ? 'Edit FAQ' : 'Add FAQ'} size="lg">
        <form onSubmit={handleFaqSubmit} className="space-y-4">
          <div>
            <label htmlFor="faq-question" className={labelClass}>Question <span className="text-red-600" aria-hidden="true">*</span></label>
            <input
              id="faq-question"
              type="text"
              value={faqForm.question}
              onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))}
              placeholder="e.g. Do you ship outside Luzon?"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="faq-answer" className={labelClass}>Answer <span className="text-red-600" aria-hidden="true">*</span></label>
            <textarea
              id="faq-answer"
              value={faqForm.answer}
              onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))}
              placeholder="Write a short, direct answer…"
              className={`${inputClass} min-h-[140px] resize-y`}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="faq-order" className={labelClass}>Position</label>
              <input
                id="faq-order"
                type="number"
                value={faqForm.display_order}
                onChange={(e) => setFaqForm((f) => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
                min="0"
                className={inputClass}
              />
            </div>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 self-end text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={faqForm.is_active}
                onChange={(e) => setFaqForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 accent-orange-600"
              />
              Visible to customers
            </label>
          </div>
          {faqError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{faqError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setFaqModalOpen(false)} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={faqSaving} className={primaryButtonClass}>
              {faqSaving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {faqSaving ? 'Saving…' : editingFaq ? 'Save changes' : 'Create FAQ'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ContentView;
