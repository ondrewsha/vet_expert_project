import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { BookOpen, CalendarHeart, User, LogOut } from 'lucide-react';

export default function Navbar() {
  const { isAuthenticated, logout } = useAuthStore();

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
          </div>

          {/* Профиль / Вход (Справа) */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link 
                  to="/profile" 
                  className="text-gray-600 hover:text-primary transition flex items-center gap-2 font-medium"
                >
                  <User className="w-5 h-5" />
                  <span className="hidden sm:block">Кабинет</span>
                </Link>
                <button 
                  onClick={logout}
                  className="p-2 text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50"
                  title="Выйти"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <Link 
                to="/login" 
                className="bg-primary text-white px-5 py-2 rounded-xl font-medium hover:bg-emerald-600 transition shadow-sm"
              >
                Войти
              </Link>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}