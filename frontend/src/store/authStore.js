import { create } from 'zustand';
import { apiClient } from '../api/client';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, 

  // Функция проверки: залогинен ли юзер
  checkAuth: async () => {
    // 1. Если токена физически нет, нет смысла стучаться на бэкенд
    const token = localStorage.getItem('access_token');
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    // 2. Если токен есть, проверяем его валидность
    try {
      const res = await apiClient.get('/users/me');
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      localStorage.removeItem('access_token'); // Очищаем невалидный токен
      console.error("Ошибка при проверке авторизации", error);
    }
  },

  // Функция входа
  login: async (token) => {
    localStorage.setItem('access_token', token);
    try {
      const res = await apiClient.get('/users/me');
      set({ user: res.data, isAuthenticated: true });
    } catch (error) {
      console.error("Ошибка при получении профиля после входа", error);
    }
  },

  // Выход
  logout: async () => {
    try {
      // 1. Стучимся на бэк, чтобы удалить HttpOnly куку
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error("Ошибка при выходе на сервере", error);
    } finally {
      // 2. В любом случае удаляем токен из локальной памяти
      localStorage.removeItem('access_token');
      // 3. Сбрасываем стейт
      set({ user: null, isAuthenticated: false });
    }
  }
}));