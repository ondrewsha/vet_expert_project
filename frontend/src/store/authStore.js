import { create } from 'zustand';
import { apiClient } from '../api/client';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // Изначально грузимся, пока проверяем токен

  // Функция проверки: залогинен ли юзер (вызывается при загрузке приложения)
  checkAuth: async () => {
    try {
      const res = await apiClient.get('/users/me');
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      console.error("Ошибка при проверке авторизации", error);
    }
  },

  // Функция входа: сохраняем токен и обновляем стейт
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
  logout: () => {
    localStorage.removeItem('access_token');
    // TODO: Здесь еще можно сделать запрос на бэк /api/auth/logout для удаления куки
    set({ user: null, isAuthenticated: false });
  }
}));