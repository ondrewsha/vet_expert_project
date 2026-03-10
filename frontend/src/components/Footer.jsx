import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import { PawIcon } from './Navbar';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Бренд и описание */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
                <PawIcon />
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">ЗооМедика</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Профессиональные ветеринарные онлайн-консультации и авторские руководства по уходу за питомцами.
            </p>
          </div>

          {/* Контакты */}
          <div>
            <h3 className="font-bold text-gray-900 mb-4">Свяжитесь со мной</h3>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary" />
                <a href="tel:+79807492577" className="hover:text-primary transition">
                  +7 (980) 749-25-77
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-primary" />
                <a href="mailto:info@andrej-rjabov.ru" className="hover:text-primary transition">
                  info@andrej-rjabov.ru
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>г. Москва, ул. Шипиловская ул., 50, корп. 3, стр. 1<br/><span className="text-xs text-gray-400">(Почтовый адрес)</span></span>
              </li>
            </ul>
          </div>

          {/* Юридическая информация */}
          <div>
            <h3 className="font-bold text-gray-900 mb-4">Реквизиты</h3>
            <ul className="space-y-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <li><strong>Самозанятый:</strong> Рябов Андрей Максимович</li>
              <li><strong>ИНН:</strong> 760211383977</li>
            </ul>
            
            <div className="mt-4 flex flex-col gap-2">
              <Link to="/terms" className="text-sm text-gray-500 hover:text-primary transition underline decoration-gray-300 underline-offset-2">
                Пользовательское соглашение
              </Link>
              <Link to="/privacy" className="text-sm text-gray-500 hover:text-primary transition underline decoration-gray-300 underline-offset-2">
                Политика конфиденциальности
              </Link>
            </div>
          </div>
          
        </div>

        <div className="border-t border-gray-100 mt-10 pt-6 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} ЗооМедика. Все права защищены.
        </div>
      </div>
    </footer>
  );
}