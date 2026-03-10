import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, Loader2, Eye, Heart, MessageCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

export default function Guides() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const handleLike = async (e, guideId) => {
    e.stopPropagation();
    if (!isAuthenticated) return toast.error("Войдите, чтобы оценить");
    try {
      const res = await apiClient.post(`/guides/${guideId}/like`);
      setGuides(prev => prev.map(g => g.id === guideId ? { ...g, is_liked: res.data.liked, likes_count: res.data.count } : g));
    } catch(e) {
        toast.error("Ошибка");
        console.error(e);
    }
  };

  useEffect(() => {
    apiClient.get('/guides')
      .then(res => setGuides(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  },[]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">База знаний</h1>
        <p className="mt-4 text-lg text-gray-500">Авторские руководства по здоровью и уходу</p>
      </div>

      {guides.length === 0 ? (
        <div className="text-center text-gray-500 py-10">Пока нет доступных гайдов.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {guides.map((guide) => (
            <div key={guide.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col cursor-pointer" onClick={() => navigate(`/guides/${guide.id}`)}>
              <div className="h-48 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                {guide.cover_image_id ? (
                  <img src={`/api/guides/${guide.id}/cover`} alt={guide.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-emerald-100 to-teal-50 flex items-center justify-center">
                    <Book className="w-16 h-16 text-emerald-300" />
                  </div>
                )}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold text-gray-800 shadow-sm">
                  {guide.price} ₽
                </div>
              </div>
              <div className="p-6 flex flex-col grow">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{guide.title}</h3>
                <p className="text-gray-500 text-sm mb-4 line-clamp-2">{guide.description}</p>
                <div className="mt-auto flex gap-3">
                    <button className="w-full bg-gray-50 text-gray-900 border border-gray-200 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-100 transition">
                      <Eye className="w-5 h-5 text-gray-500" /> Смотреть
                    </button>
                    <button onClick={(e) => handleLike(e, guide.id)} className={`px-3 py-2 rounded-xl flex items-center gap-1 font-bold transition border ${guide.is_liked ? 'bg-pink-50 border-pink-200 text-pink-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      <Heart className={`w-4 h-4 ${guide.is_liked ? 'fill-current' : ''}`} /> {guide.likes_count}
                    </button>
                    {/* ВОТ ТУТ СЧЕТЧИК КОММЕНТОВ */}
                    <div className="flex items-center gap-1 text-xs text-gray-400 font-medium ml-1">
                        <MessageCircle className="w-4 h-4" /> {guide.comments_count}
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}