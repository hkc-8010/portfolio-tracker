import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getHoldings = async () => {
  const response = await api.get('/holdings');
  return response.data;
};

export const updateSettings = async (isin, ticker, dateOfExit, target, stopLoss) => {
  const response = await api.post('/settings', {
    isin,
    ticker,
    date_of_exit: dateOfExit,
    target: target ? parseFloat(target) : null,
    stop_loss: stopLoss ? parseFloat(stopLoss) : null,
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
