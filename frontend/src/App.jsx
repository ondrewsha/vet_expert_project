import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import Login from './pages/Login';

// Компонент-обертка для защиты приватных роутов
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

// Заглушки для будущих страниц (пока сделаем их прямо тут)
const Home = () => <div className="p-10 text-xl text-center">Главная витрина (Гайды + Врач)</div>;
const Profile = () => {
  const { user, logout } = useAuthStore();
  return (
    <div className="p-10 text-center">
      <h1 className="text-2xl font-bold mb-4">Личный кабинет</h1>
      <p>Привет, {user?.full_name || user?.phone}!</p>
      <button onClick={logout} className="mt-4 px-4 py-2 bg-red-500 text-white rounded">Выйти</button>
    </div>
  );
};

function App() {
  const { checkAuth, isLoading } = useAuthStore();

  // При первой загрузке приложения проверяем токен
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Пока проверяем токен, показываем лоадер, чтобы не моргал экран логина
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Публичные страницы */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        {/* Защищенные страницы */}
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;