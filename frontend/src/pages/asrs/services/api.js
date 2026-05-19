import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Create an axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add a response interceptor for better error handling
api.interceptors.response.use(
  response => response,
  error => {
    const errorMessage = 
      error.response?.data?.message || 
      error.response?.data?.detail ||
      error.response?.data?.error || 
      error.message || 
      'An unknown error occurred';
    
    console.error('API Error:', errorMessage);
    
    return Promise.reject({
      ...error,
      message: errorMessage
    });
  }
);

/* ========================================
   BOX ENDPOINTS
   ======================================== */
export const boxesAPI = {
  getAll: () => api.get('/asrs-data/boxes'),
  getById: (boxId) => api.get(`/asrs-data/boxes/${boxId}`),
  create: (data) => api.post('/asrs-data/boxes', data),
  delete: (boxId) => api.delete(`/asrs-data/boxes/${boxId}`),
  getEmptyCompartments: () => api.get('/asrs-data/boxes/empty-compartments')
};

/* ========================================
   ITEM ENDPOINTS
   ======================================== */
export const itemsAPI = {
  getAll: () => api.get('/asrs-data/items'),
  getById: (itemId) => api.get(`/asrs-data/items/${itemId}`),
  create: (data) => api.post('/asrs-data/items', data),
  delete: (itemId) => api.delete(`/asrs-data/items/${itemId}`),
  checkExists: (itemId) => api.get(`/asrs-data/items/${itemId}/exists`),
  getAvailable: () => api.get('/asrs-data/items/available/with-count'),
  getLocations: (itemId) => api.get(`/asrs-data/items/${itemId}/locations`)
};

/* ========================================
   SUBCOMPARTMENT ENDPOINTS
   ======================================== */
export const subcompartmentsAPI = {
  getAll: () => api.get('/asrs-data/subcompartments'),
  getByPlace: (place) => api.get(`/asrs-data/subcompartments/${place}`),
  create: (data) => api.post('/asrs-data/subcompartments', data),
  updateStatus: (place, data) => api.put(`/asrs-data/subcompartments/${place}/status`, data),
  delete: (place) => api.delete(`/asrs-data/subcompartments/${place}`),
  addProduct: (data) => api.post('/asrs-data/subcompartments/operations/add-product', data),
  retrieveProduct: (data) => api.post('/asrs-data/subcompartments/operations/retrieve-product', data)
};

/* ========================================
   TRANSACTION ENDPOINTS
   ======================================== */
export const transactionsAPI = {
  getAll: (sort = 'id_asc', limit = 100) => api.get('/asrs-data/transactions', { params: { sort, limit } }),
  getById: (tranId) => api.get(`/asrs-data/transactions/${tranId}`),
  getByItemId: (itemId) => api.get(`/asrs-data/transactions/item/${itemId}`)
};

export default api;