import axios from 'axios';

export const apiClient = axios.create({
  // Vite проксирует /api на наш бэкенд (http://localhost:8000)
  baseURL: '/api', 
  withCredentials: true, // Нужно для работы с refresh-куками
});

// Перехватчик: перед каждым запросом достаем токен из памяти и кладем в заголовки
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});