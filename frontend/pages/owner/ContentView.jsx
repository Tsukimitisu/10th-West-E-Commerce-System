import React, { useState, useEffect } from 'react';
import { Newspaper, Save, Plus, Edit3, Trash2, X, FileText, HelpCircle, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { getPolicy, updatePolicy, getFAQs, createFAQ, updateFAQ, deleteFAQ } from '../../services/api';

const POLICY_TYPES = [
  { key: 'return_policy', label: 'Return Policy' },
  { key: 'privacy_policy', label: 'Privacy Policy' },
  { key: 'terms_of_service', label: 'Terms of Service' },
  { key: 'shipping_policy', label: 'Shipping Policy' },
];

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300';

const ContentView = () => {
  const [mainTab, setMainTab] = useState('policies');
  const [policyTab, setPolicyTab] = useState('return_policy');

  // Policy state
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
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-xl text-gray-900 flex items-center gap-2">
          <Newspaper size={22} /> Content Management
        </h1>
        <p className="text-sm text-gray-500">Manage store policies and frequently asked questions</p>
      </div>

      {/* Main Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {mainTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setMainTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                mainTab === t.id
                  ? 'text-orange-600 border-orange-500'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Policies Tab */}
      {mainTab === 'policies' && (
        <div className="space-y-4">
          {/* Policy Sub-Tabs */}
          <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-1 w-fit flex-wrap">
            {POLICY_TYPES.map((pt) => (
              <button
                key={pt.key}
                onClick={() => setPolicyTab(pt.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  policyTab === pt.key
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>

          {/* Policy Editor */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            {policyLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-sm text-gray-500">Loading policy...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                  <input
                    type="text"
                    value={policyTitle}
                    onChange={(e) => {
                      setPolicyTitle(e.target.value);
                      setPolicySaved(false);
                    }}
                    placeholder="Policy title..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
                  <textarea
                    value={policyContent}
                    onChange={(e) => {
                      setPolicyContent(e.target.value);
                      setPolicySaved(false);
                    }}
                    placeholder="Enter policy content..."
                    className={`${inputClass} min-h-[300px] resize-y`}
                  />
                </div>

                {policyError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle size={14} />
                    {policyError}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSavePolicy}
                    disabled={policySaving}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50 ${
                      policySaved
                        ? 'bg-green-600 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {policySaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : policySaved ? (
                      <>
                        <Check size={14} />
                        Saved!
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Save
                      </>
                    )}
                  </button>

                  {policySaved && (
                    <span className="text-sm text-green-600 font-medium">Policy saved successfully!</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAQs Tab */}
      {mainTab === 'faqs' && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{faqs.length} FAQ{faqs.length !== 1 ? 's' : ''} total</p>
            <button
              onClick={openAddFaq}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus size={14} />
              Add New FAQ
            </button>
          </div>

          {/* FAQ List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            {faqLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-sm text-gray-500">Loading FAQs...</span>
              </div>
            ) : faqError ? (
              <div className="flex flex-col items-center justify-center py-16">
                <AlertCircle size={32} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">{faqError}</p>
              </div>
            ) : faqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <HelpCircle size={32} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No FAQs yet. Add your first one!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {faqs.map((faq) => (
                  <div key={faq.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-gray-900">{faq.question}</p>
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-2">{faq.answer}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              faq.is_active !== false
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-gray-50 text-gray-500 border border-gray-200'
                            }`}
                          >
                            {faq.is_active !== false ? (
                              <><Eye size={10} /> Active</>
                            ) : (
                              <><EyeOff size={10} /> Inactive</>
                            )}
                          </span>
                          {faq.display_order != null && (
                            <span className="text-xs text-gray-400">Order: {faq.display_order}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openEditFaq(faq)}
                          className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        {deleteConfirm === faq.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteFaq(faq.id)}
                              className="px-2 py-1 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md hover:bg-gray-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(faq.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAQ Add/Edit Modal */}
      {faqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setFaqModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-display font-semibold text-gray-900">
                {editingFaq ? 'Edit FAQ' : 'Add New FAQ'}
              </h3>
              <button
                onClick={() => setFaqModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleFaqSubmit} className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Question <span className="text-orange-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={faqForm.question}
                    onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))}
                    placeholder="Enter the question..."
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Answer <span className="text-orange-500">*</span>
                  </label>
                  <textarea
                    value={faqForm.answer}
                    onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))}
                    placeholder="Enter the answer..."
                    className={`${inputClass} min-h-[150px] resize-y`}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Display Order</label>
                    <input
                      type="number"
                      value={faqForm.display_order}
                      onChange={(e) => setFaqForm((f) => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
                      min="0"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={faqForm.is_active}
                        onChange={(e) => setFaqForm((f) => ({ ...f, is_active: e.target.checked }))}
                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                      />
                      Active
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFaqModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={faqSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {faqSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        {editingFaq ? 'Save Changes' : 'Create FAQ'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentView;
