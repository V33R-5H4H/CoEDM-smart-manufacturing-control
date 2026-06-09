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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '24px', 
      height: '100%',
      overflow: 'auto',
      padding: '16px 24px',
      position: 'relative'
    }}>
      
      {/* Control Panel */}
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '16px',
        }}>Transaction Filters</div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }} htmlFor="sortOption">
                Sort By
              </label>
              <CustomSelect
                value={sortOption}
                onChange={handleSortChange}
                disabled={loading}
                options={[
                  { value: 'id_asc', label: 'Transaction ID (asc)' },
                  { value: 'newest_first', label: 'Newest First' },
                  { value: 'added_only', label: 'Added Only' },
                  { value: 'retrieved_only', label: 'Retrieved Only' }
                ]}
              />
            </div>
            
            <button
              className="btn btn-primary"
              onClick={fetchTransactions}
              disabled={loading}
              style={{ height: '35px', padding: '0 16px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>sync</span>
              {loading ? 'REFRESHING...' : 'REFRESH'}
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', background: autoRefresh ? 'rgba(5, 150, 105, 0.1)' : 'var(--bg-tertiary)', border: `1px solid ${autoRefresh ? 'rgba(5, 150, 105, 0.3)' : 'var(--border)'}`, borderRadius: '4px', transition: 'all 0.2s' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={toggleAutoRefresh}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', fontWeight: 600, color: autoRefresh ? 'var(--status-ok)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Auto Refresh (5s)
            </span>
          </label>
        </div>
      </div>

      {/* Transactions Table */}
      <div>
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '10px',
        }}>System Event Log</div>
        <div style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['ID', 'ITEM', 'LOCATION', 'ACTION', 'TIMESTAMP'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (!transactions || transactions.length === 0) ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '16px' }}>
                    <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite', fontSize: '23px', verticalAlign: 'middle', marginRight: '8px' }}>sync</span>
                    Loading transactions...
                  </td>
                </tr>
              ) : !transactions || transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '16px' }}>No transactions recorded.</td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.tran_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '16px', color: 'var(--primary)', fontWeight: 500 }}>
                      #{transaction.tran_id}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {transaction.item_name || <span style={{ color: 'var(--text-muted)' }}>Unknown</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-secondary)' }}>
                      {transaction.subcom_place || '---'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        border: `1px solid ${transaction.action === 'added' ? 'rgba(5, 150, 105, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                        background: transaction.action === 'added' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                        color: transaction.action === 'added' ? 'var(--status-ok)' : 'var(--warning)'
                      }}>
                        {transaction.action}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-muted)' }}>
                      {formatDateTime(transaction.time)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Custom Select Component for perfect theme consistency
function CustomSelect({ value, onChange, options, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '160px' }}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{ 
          background: 'var(--bg-primary)', 
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border)', 
          borderRadius: '4px', 
          padding: '0 12px', 
          color: 'var(--text-primary)', 
          fontSize: '15px', 
          height: '35px', 
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: disabled ? 0.6 : 1,
          boxShadow: isOpen ? '0 0 0 1px var(--primary)' : 'none',
          transition: 'all 0.2s',
          userSelect: 'none'
        }}
      >
        <span>{selectedOption.label}</span>
        <span className="material-symbols-outlined" style={{ fontSize: '19px', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>
          expand_more
        </span>
      </div>
      
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 50,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => {
                onChange({ target: { value: opt.value } });
                setIsOpen(false);
              }}
              style={{
                padding: '10px 12px',
                fontSize: '15px',
                color: opt.value === value ? 'var(--primary)' : 'var(--text-primary)',
                background: opt.value === value ? 'var(--bg-hover)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.2s',
                fontWeight: opt.value === value ? 600 : 400
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) e.currentTarget.style.background = 'transparent';
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TransactionsTab;
