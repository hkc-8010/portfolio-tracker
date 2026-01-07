import axios from 'axios';

const API_BASE_URL = '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getPortfolios = async () => {
  const response = await api.get('/portfolios');
  return response.data;
};

export const createPortfolio = async (name) => {
  const response = await api.post('/portfolios', { name });
  return response.data;
};

export const deletePortfolio = async (id) => {
  const response = await api.delete(`/portfolios/${id}`);
  return response.data;
};

export const renamePortfolio = async (id, name) => {
  const response = await api.put(`/portfolios/${id}`, { name });
  return response.data;
};

export const getHoldings = async (portfolioId) => {
  if (!portfolioId) return [];
  const response = await api.get(`/holdings?portfolio_id=${portfolioId}`);
  return response.data;
};

export const addHolding = async (data) => {
  const response = await api.post('/holdings/add', data);
  return response.data;
};

export const deleteHoldingsBulk = async (portfolioId, isins) => {
  const response = await api.post('/holdings/delete-bulk', {
    portfolio_id: portfolioId,
    isins
  });
  return response.data;
};

export const updateSettings = async (portfolioId, isin, settings) => {
  const response = await api.post('/settings', {
    portfolio_id: portfolioId,
    isin,
    ...settings
  });
  return response.data;
};

export const autoDiscover = async () => {
  const response = await api.post('/discover');
  return response.data;
};

export const uploadPortfolio = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};
