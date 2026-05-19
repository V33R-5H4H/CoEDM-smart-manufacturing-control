import { useState, useEffect, useRef } from 'react';
import TransactionService from '../services/transactionService';
import { toast } from 'react-toastify';

function TransactionsTab() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortOption, setSortOption] = useState('id_asc');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshTimerRef = useRef(null);

  useEffect(() => {
    fetchTransactions();

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(fetchTransactions, 5000);
    } else if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh]);

  useEffect(() => {
    fetchTransactions();
  }, [sortOption]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await TransactionService.getAllTransactions(sortOption);
      setTransactions(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
      setLoading(false);
    }
  };

  const handleSortChange = (e) => {
    setSortOption(e.target.value);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh((prev) => !prev);
    if (!autoRefresh) {
      toast.info('Auto-refresh activated (5s)');
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div>
      <h2>Transactions</h2>

      <div className="control-panel" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="sortOption">
              Sort By
            </label>
            <select
              className="form-input"
              id="sortOption"
              value={sortOption}
              onChange={handleSortChange}
              disabled={loading}
            >
              <option value="id_asc">Transaction ID (asc)</option>
              <option value="newest_first">Newest First</option>
              <option value="added_only">Added Only</option>
              <option value="retrieved_only">Retrieved Only</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={fetchTransactions}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="autoRefresh"
                checked={autoRefresh}
                onChange={toggleAutoRefresh}
                style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
              />
              <label htmlFor="autoRefresh" style={{ fontSize: '0.875rem', cursor: 'pointer', margin: 0 }}>
                Auto Refresh (5s)
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Item</th>
              <th>Location</th>
              <th>Action</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (!transactions || transactions.length === 0) ? (
              <tr>
                <td colSpan="5" className="loading-cell">
                  <span className="animate-pulse">Loading...</span>
                </td>
              </tr>
            ) : !transactions || transactions.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-cell">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr key={transaction.tran_id}>
                  <td>{transaction.tran_id}</td>
                  <td>{transaction.item_name || 'Unknown'}</td>
                  <td>{transaction.subcom_place || 'N/A'}</td>
                  <td>
                    <span
                      className={`badge ${
                        transaction.action === 'added'
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}
                    >
                      {transaction.action}
                    </span>
                  </td>
                  <td>
                    {formatDateTime(transaction.time)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TransactionsTab;
