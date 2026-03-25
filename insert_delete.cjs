const fs = require('fs');
const file = 'frontend/pages/owner/CustomersView.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/import \{ getOrders \} from '\.\.\/\.\.\/services\/api';/, "import { getOrders, adminDeleteUser } from '../../services/api';");
content = content.replace(/import \{ Users, Search, Eye, ShoppingBag, DollarSign, Star, Mail, Phone, MapPin, Calendar, Package \} from 'lucide-react';/, "import { Users, Search, Eye, ShoppingBag, DollarSign, Star, Mail, Phone, MapPin, Calendar, Package, Trash2 } from 'lucide-react';");

const stateInsert =   const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [deleteId, setDeleteId] = useState(null);;

content = content.replace(/  const \[selectedCustomer, setSelectedCustomer\] = useState\(null\);/, stateInsert);

const deleteLogic = 
  const handleDeleteCustomer = async () => {
    if (!deleteId) return;
    try {
      await adminDeleteUser(deleteId);
      setCustomers(customers.filter(c => c.id !== deleteId));
      setDeleteId(null);
      // Optional toast goes here
    } catch (err) {
      console.error('Failed to delete customer', err);
      alert(err.message || 'Failed to delete customer');
    }
  };

  const filtered = customers.filter(c => {;

content = content.replace(/  const filtered = customers\.filter\(c => \{/, deleteLogic);

const trReplace = <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setSelectedCustomer(c)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="View Details"><Eye size={14} /></button>
                        <button onClick={() => setDeleteId(c.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors" title="Delete Customer"><Trash2 size={14} /></button>
                      </div>
                    </td>;

content = content.replace(/<td className="px-4 py-3 text-right">\s*<button onClick=\{\(\) => setSelectedCustomer\(c\)\} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"><Eye size=\{14\} \/><\/button>\s*<\/td>/, trReplace);

const deleteModal =       {/* Delete Confirmation Modal */}
      {deleteId && (
        <Modal isOpen={true} onClose={() => setDeleteId(null)} title="Confirm Deletion">
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Customer?</h3>
            <p className="text-gray-500 mb-6">Are you sure you want to delete this customer account? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteCustomer} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
                Delete Account
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Customer Detail Modal */};

content = content.replace(/      \{\/\* Customer Detail Modal \*\/\}/, deleteModal);

fs.writeFileSync(file, content, 'utf8');
