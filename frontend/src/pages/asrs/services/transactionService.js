import { transactionsAPI } from './api';

const TransactionService = {
  // Get all transactions with optional sorting
  getAllTransactions: async (sort = 'id_asc', limit = 100) => {
    try {
      const response = await transactionsAPI.getAll(sort, limit);
      return response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  },

  // Get transaction by ID
  getTransactionById: async (id) => {
    try {
      const response = await transactionsAPI.getById(id);
      return response.data;
    } catch (error) {
      console.error(`Error fetching transaction ${id}:`, error);
      throw error;
    }
  },

  // Get transactions by item ID
  getTransactionsByItemId: async (itemId) => {
    try {
      const response = await transactionsAPI.getByItemId(itemId);
      return response.data;
    } catch (error) {
      console.error(`Error fetching transactions for item ${itemId}:`, error);
      throw error;
    }
  }
};

export default TransactionService;
