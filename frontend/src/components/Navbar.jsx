import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { BookOpen, CalendarHeart, User, LogOut, Ticket } from 'lucide-react';

export const PawIcon = () => (
  <svg viewBox="0 0 100 100" className="w-5 h-5 fill-current">
    <path d="M50 70 C 40 70, 32 60, 35 48 C 38 35, 62 35, 65 48 C 68 60, 60 70, 50 70 Z" />
    <circle cx="32" cy="38" r="8" />
    <circle cx="43" cy="28" r="8" />
    <circle cx="57" cy="28" r="8" />
    <circle cx="68" cy="38" r="8" />
  </svg>
);

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/'); // Перенаправляем на лендинг после очистки данных
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Логотип: Умная ссылка (Гость -> /, Юзер -> /guides) */}
          <div className="flex items-center">
            <Link to={isAuthenticated ? "/guides" : "/"} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
                <PawIcon />
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">ЗооМедика</span>
            </Link>
          </div>

          {/* Ссылки (Центр) */}
          <div className="hidden sm:flex sm:items-center sm:space-x-8">
            <Link to="/guides" className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium">
              <BookOpen className="w-4 h-4" />
              Гайды
            </Link>
            <Link to="/consultation" className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium">
              <CalendarHeart className="w-4 h-4" />
              Онлайн-прием
            </Link>
            {(user?.role === 'doctor' || user?.role === 'superadmin') && (
              <Link to="/doctor" className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition text-sm font-bold">
                Панель специалиста
              </Link>
            )}
            {(user?.role === 'superadmin') && (
              <Link to="/super-panel" className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition text-sm font-bold">
                Админ Панель
              </Link>
            )}
          </div>

          {/* Профиль / Вход (Справа) */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {user?.unused_consultations > 0 && (
                  <div className="group relative flex items-center gap-1 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-sm font-bold cursor-help">
                    <Ticket className="w-4 h-4" />
                    {user.unused_consultations}
                  </div>
                )}
                <Link to="/profile" className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium">
                  <User className="w-5 h-5" />
                  <span className="hidden sm:block">Кабинет</span>
                </Link>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50">
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login" className="text-gray-600 hover:text-primary font-medium transition hidden sm:block">
                  Войти
                </Link>
                <Link to="/consultation" className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-600 transition shadow-md shadow-emerald-500/20 flex items-center gap-2">
                  <CalendarHeart className="w-4 h-4" />
                  <span className="hidden sm:block">Записаться</span>
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}