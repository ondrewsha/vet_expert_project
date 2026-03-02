import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, Loader2, Eye } from 'lucide-react';
import { apiClient } from '../api/client';

export default function Home() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Загружаем гайды при открытии страницы
  useEffect(() => {
    apiClient.get('/guides')
      .then(res => setGuides(res.data))
      .catch(err => console.error("Ошибка загрузки гайдов:", err))
      .finally(() => setLoading(false));
  },[]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      
      {/* Заголовок */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
          Забота о питомце в <span className="text-primary">ваших руках</span>
        </h1>
        <p className="mt-4 text-xl text-gray-500 max-w-2xl mx-auto">
          Авторские руководства от ведущего ветеринарного врача. Понятно, доступно и научно обосновано.
        </p>
      </div>

      {/* Сетка гайдов */}
      {guides.length === 0 ? (
        <div className="text-center text-gray-500 py-10">Пока нет доступных гайдов.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {guides.map((guide) => (
            <div key={guide.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col">
              {/* Верхняя часть карточки (Обложка) */}
              <div className="h-48 bg-linear-to-br from-emerald-100 to-teal-50 flex items-center justify-center relative">
                <Book className="w-16 h-16 text-emerald-300" />
                <div className="absolute top-4 right-4 bg-white px-3 py-1 rounded-full text-sm font-bold text-gray-700 shadow-sm">
                  {guide.price} ₽
                </div>
              </div>
              
              {/* Текст */}
              <div className="p-6 flex flex-col grow">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{guide.title}</h3>
                
                {/* Описание */}
                <p className="text-gray-500 text-sm mb-4 line-clamp-2">
                  {guide.description || "Подробное руководство."}
                </p>

                {/* Бесплатный фрагмент (Сниппет) */}
                {guide.free_snippet && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700 italic relative">
                    <span className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">Фрагмент</span>
                    "{guide.free_snippet}"
                  </div>
                )}
                
                {/* Кнопки внизу */}
                <div className="mt-auto">
                  <button 
                    onClick={() => navigate(`/guides/${guide.id}`)}
                    className="w-full bg-gray-50 text-gray-900 border border-gray-200 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-100 hover:border-gray-300 transition"
                  >
                    <Eye className="w-5 h-5 text-gray-500" />
                    Смотреть подробнее
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}