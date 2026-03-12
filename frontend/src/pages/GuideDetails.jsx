import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Book, Loader2, Heart, Send, ShoppingCart, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function GuideDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Загрузка данных
  useEffect(() => {
    const fetchGuide = async () => {
      try {
        const res = await apiClient.get(`/guides/${id}`);
        setGuide(res.data);
        setLikesCount(res.data.likes_count);
        
        // Если юзер залогинен, проверим, лайкнул ли он
        if (isAuthenticated) {
          const likeRes = await apiClient.get(`/guides/${id}/check-like`);
          setIsLiked(likeRes.data);
        }
      } catch (error) {
        toast.error("Ошибка загрузки гайда");
        console.error("Ошибка загрузки гайда", error)
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    fetchGuide();
  }, [id, isAuthenticated, navigate]);

  // Лайк
  const handleLike = async () => {
    if (!isAuthenticated) return navigate('/login');
    try {
      const res = await apiClient.post(`/guides/${id}/like`);
      setIsLiked(res.data.liked);
      setLikesCount(res.data.count);
    } catch (e) {
      toast.error("Ошибка лайка");
      console.error("Ошибка лайка", e)
    }
  };

  // Покупка
  const handleBuy = async () => {
    if (!isAuthenticated) return navigate('/login');
    try {
      const res = await apiClient.post(`/payments/buy-guide/${id}`);
      if (res.data.free) {
        toast.success("Гайд добавлен в вашу библиотеку бесплатно!");
      } else if (res.data.payment_url) {
        window.location.assign(res.data.payment_url);
      } else if (res.data.message) {
        toast.info(res.data.message);
      }
    } catch (e) {
      toast.error("Ошибка оплаты");
      console.error("Ошибка оплаты", e)
    }
  };

  // Отправка коммента
  const handleComment = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return navigate('/login');
    if (!commentText.trim()) return;

    setSendingComment(true);
    try {
      const res = await apiClient.post(`/guides/${id}/comments`, { text: commentText });
      // Добавляем новый коммент в список
      setGuide(prev => ({
        ...prev,
        comments: [res.data, ...prev.comments]
      }));
      setCommentText('');
      toast.success("Комментарий добавлен!");
    } catch (e) {
      toast.error("Не удалось отправить комментарий");
      console.error("Ошибка отправления комментария", e)
    } finally {
      setSendingComment(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (!guide) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      
      {/* КАРТОЧКА ГАЙДА */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-12">
        <div className="md:flex">
          {/* Левая часть - Обложка */}
          <div className="md:w-1/3 bg-gray-50 flex items-center justify-center relative overflow-hidden">
            {guide.cover_image_id ? (
               <img 
                 src={`/api/guides/${guide.id}/cover`} 
                 alt={guide.title} 
                 className="w-full h-full object-cover"
               />
            ) : (
              <div className="w-full h-full bg-linear-to-br from-emerald-100 to-teal-50 flex items-center justify-center p-12">
                <Book className="w-32 h-32 text-emerald-400 drop-shadow-md" />
              </div>
            )}
          </div>
          
          {/* Правая часть - Инфо */}
          <div className="md:w-2/3 p-8 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-3xl font-extrabold text-gray-900">{guide.title}</h1>
              <div className="bg-gray-100 px-3 py-1 rounded-full text-sm font-bold text-gray-600">
                {guide.price} ₽
              </div>
            </div>
            
            <p className="text-gray-600 mb-6 text-lg leading-relaxed">{guide.description}</p>
            
            {/* Сниппет */}
            {guide.free_snippet && (
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-8 rounded-r-xl">
                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">Бесплатный фрагмент</h4>
                <p className="text-gray-800 italic">"...{guide.free_snippet}"</p>
              </div>
            )}

            <div className="mt-auto flex items-center gap-4">
              <button 
                onClick={handleBuy}
                className="flex-1 bg-gray-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition shadow-lg shadow-gray-200"
              >
                <ShoppingCart className="w-5 h-5" />
                {guide.price == 0 ? "Получить бесплатно" : `Купить за ${guide.price} ₽`}
              </button>
              
              <button 
                onClick={handleLike}
                className={`p-3 rounded-xl border transition flex items-center gap-2 font-bold ${
                  isLiked ? 'border-red-200 bg-red-50 text-red-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
                {likesCount}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* СЕКЦИЯ КОММЕНТАРИЕВ */}
      <div className="max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Отзывы и вопросы</h3>
        
        {/* Форма */}
        <form onSubmit={handleComment} className="mb-10 relative">
          {!isAuthenticated && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 font-medium">
                <Lock className="w-4 h-4" />
                Войдите, чтобы комментировать
              </div>
            </div>
          )}
          <textarea
            rows="3"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Напишите ваш отзыв..."
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none bg-gray-50 focus:bg-white transition"
          ></textarea>
          <div className="flex justify-end mt-2">
            <button 
              type="submit" 
              disabled={sendingComment || !commentText.trim()}
              className="bg-primary text-white px-6 py-2 rounded-xl font-medium hover:bg-emerald-600 transition flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Отправить
            </button>
          </div>
        </form>

        {/* Список */}
        <div className="space-y-6">
          {guide.comments.length === 0 ? (
            <p className="text-center text-gray-400">Пока нет комментариев. Будьте первым!</p>
          ) : (
            guide.comments.map(comment => (
              <div key={comment.id} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 shrink-0">
                  {comment.user_name[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-bold text-gray-900">{comment.user_name}</span>
                    <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-700 bg-gray-50 px-4 py-3 rounded-2xl rounded-tl-none inline-block">
                    {comment.text}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}