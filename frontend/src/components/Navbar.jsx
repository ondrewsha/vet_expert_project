import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { BookOpen, CalendarHeart, User, LogOut, UploadCloud, Ticket } from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          
          {/* Логотип */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">V</span>
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">ВетЭксперт</span>
            </Link>
          </div>

          {/* Ссылки (Центр) */}
          <div className="hidden sm:flex sm:items-center sm:space-x-8">
            <Link to="/" className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium">
              <BookOpen className="w-4 h-4" />
              Гайды
            </Link>
            <Link to="/consultation" className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium">
              <CalendarHeart className="w-4 h-4" />
              Онлайн-прием
            </Link>
            {(user?.role === 'doctor' || user?.role === 'superadmin') && (
              <Link to="/doctor" className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition text-sm font-bold flex items-center gap-2">
                <UploadCloud className="w-4 h-4" />
                Панель специалиста
              </Link>
            )}
          </div>

          {/* Профиль / Вход (Справа) */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* БАЛАНС */}
                {user?.unused_consultations > 0 && (
                  <div className="group relative flex items-center gap-1 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-sm font-bold cursor-help">
                    <Ticket className="w-4 h-4" />
                    {user.unused_consultations}
                    {/* Тултип */}
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 p-3 rounded-xl shadow-xl text-xs text-gray-600 font-normal opacity-0 group-hover:opacity-100 transition pointer-events-none z-50">
                      У вас есть оплаченные консультации. Используйте их при записи.
                    </div>
                  </div>
                )}

                <Link to="/profile" className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium">
                  <User className="w-5 h-5" />
                  <span className="hidden sm:block">Кабинет</span>
                </Link>
                <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50">
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <Link to="/login" className="bg-primary text-white px-5 py-2 rounded-xl font-medium hover:bg-emerald-600 transition shadow-sm">
                Войти
              </Link>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}