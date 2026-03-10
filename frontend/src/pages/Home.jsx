import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { Book, Loader2, Eye, Heart, MessageCircle, ShieldCheck, Clock, Video, Star, ArrowRight, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const [guides, setGuides] = useState([]);
  const [landingData, setLandingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Стейты и ссылки для карусели
  const carouselRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Если пользователь уже вошел, лендинг ему не нужен, кидаем в каталог
    if (isAuthenticated) return;

    Promise.all([
      apiClient.get('/guides'),
      apiClient.get('/appointments/landing-info')
    ]).then(([guidesRes, infoRes]) => {
      setGuides(guidesRes.data.slice(0, 3));
      setLandingData(infoRes.data);
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

  // Функция программного скролла
  const scroll = (direction) => {
    if (!carouselRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
    
    // Защита: если карточек мало и они не вылазят за экран, не крутим
    if (scrollWidth <= clientWidth) return;

    // Считаем размер шага: ширина первой карточки + отступ (gap-6 = 24px)
    const cardWidth = carouselRef.current.firstElementChild?.clientWidth || 350;
    const scrollAmount = cardWidth + 24; 

    if (direction === 'right') {
      // Если дошли до конца (с запасом 10px на погрешность) - возвращаемся в начало
      if (Math.ceil(scrollLeft + clientWidth) >= scrollWidth - 10) {
        carouselRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    } else {
      // Если мы в самом начале - прыгаем в конец
      if (scrollLeft <= 10) {
        carouselRef.current.scrollTo({ left: scrollWidth, behavior: 'smooth' });
      } else {
        carouselRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      }
    }
  };

  // Эффект автопрокрутки
  useEffect(() => {
    // Если мышка над каруселью или данные не загрузились - ставим на паузу
    if (isHovered || !landingData || landingData.doctors.length === 0) return;
    
    const interval = setInterval(() => {
      scroll('right');
    }, 4000); // Меняем слайд каждые 4 секунды
    
    return () => clearInterval(interval);
  },[isHovered, landingData]);

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

  if (isAuthenticated) return <Navigate to="/guides" replace />;
  if (loading || !landingData) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;

  return (
    <div className="bg-white">
      {/* === HERO === */}
      <div className="relative overflow-hidden bg-emerald-50/50 pt-16 pb-24 lg:pt-24 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
            
            <div className="lg:col-span-6 text-center lg:text-left mb-12 lg:mb-0">
              {landingData.has_slots_today && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-800 font-medium text-sm mb-6 animate-in fade-in slide-in-from-bottom-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  Врач на связи сегодня
                </div>
              )}
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
                Здоровье вашего питомца <br/>
                <span className="text-primary">в надежных руках</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto lg:mx-0">
                Профессиональные ветеринарные онлайн-консультации без стресса для животного. Получите точный диагноз и план лечения, не выходя из дома.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/consultation" className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 transition shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2">
                  Записаться на прием <ArrowRight className="w-5 h-5" />
                </Link>
                <a href="#guides" className="bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-gray-50 transition flex items-center justify-center gap-2">
                  <Book className="w-5 h-5 text-gray-400" /> База знаний
                </a>
              </div>
            </div>

            <div className="lg:col-span-6 relative">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white aspect-4/3 bg-gray-100">
                <img src="/images/hero.jpg" alt="Ветеринар" className="w-full h-full object-cover" />
                
                <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-lg flex items-center gap-4">
                  <div className="bg-amber-100 p-2 rounded-full">
                    <Star className="w-8 h-8 text-amber-500 fill-current" />
                  </div>
                  <div>
                    <div className="font-black text-xl text-gray-900">{landingData.average_rating.toFixed(1)} / 5.0</div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Средняя оценка сервиса</div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* === ПРЕИМУЩЕСТВА === */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-gray-900">Почему выбирают онлайн-прием?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 text-center hover:shadow-md transition">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Video className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Никакого стресса</h3>
            <p className="text-gray-600">Питомцу не нужно ехать в переноске. Врач оценит состояние животного в его привычной домашней обстановке.</p>
          </div>
          <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 text-center hover:shadow-md transition">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Экономия времени</h3>
            <p className="text-gray-600">Не нужно сидеть в очередях. Выбирайте удобное время и подключайтесь к видеозвонку с любого устройства.</p>
          </div>
          <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 text-center hover:shadow-md transition">
            <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Официальное заключение</h3>
            <p className="text-gray-600">После приема вы получаете подробный PDF-протокол с диагнозом, расшифровкой анализов и планом лечения.</p>
          </div>
        </div>
      </div>

      {/* === ВРАЧИ (ДИНАМИЧНАЯ КАРУСЕЛЬ) === */}
      <div className="bg-gray-900 text-white py-20 lg:py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Наши специалисты</h2>
              <p className="text-gray-400 text-lg">Команда дипломированных профессионалов.</p>
            </div>
            {/* Кнопки навигации */}
            <div className="hidden sm:flex gap-3">
              <button onClick={() => scroll('left')} className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 transition border border-gray-700 hover:border-gray-500">
                <ChevronLeft className="w-6 h-6 text-gray-300" />
              </button>
              <button onClick={() => scroll('right')} className="p-3 bg-gray-800 rounded-full hover:bg-gray-700 transition border border-gray-700 hover:border-gray-500">
                <ChevronRight className="w-6 h-6 text-gray-300" />
              </button>
            </div>
          </div>
          
          {/* Контейнер карусели */}
          {/* [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] - скрывает ползунок во всех браузерах */}
          <div 
            className="relative"
            onMouseEnter={() => setIsHovered(true)} 
            onMouseLeave={() => setIsHovered(false)}
          >
            <div 
              ref={carouselRef}
              className="flex overflow-x-auto gap-6 pb-4 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden[-ms-overflow-style:none] [scrollbar-width:none]"
            >
              {landingData.doctors.map(doc => (
                <div key={doc.id} className="snap-center shrink-0 w-[85vw] sm:w-95 bg-gray-800 rounded-3xl p-6 md:p-8 border border-gray-700 flex flex-col hover:border-gray-500 transition">
                  <div className="flex items-center gap-4 mb-6">
                    {doc.doctor_profile?.photo_url ? (
                      <img src={`/api/users/${doc.id}/photo`} alt={doc.full_name} className="w-20 h-20 rounded-full object-cover border-2 border-gray-600 shrink-0" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-bold text-gray-400 shrink-0">
                        {doc.full_name?.[0] || "В"}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-xl">{doc.full_name || "Специалист"}</h3>
                      {doc.average_rating && (
                        <div className="flex items-center gap-1 text-amber-400 text-sm font-bold mt-1">
                          <Star className="w-4 h-4 fill-current" /> {doc.average_rating.toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-4">
                    {doc.doctor_profile?.description || "Опытный ветеринарный врач. Поможет с постановкой диагноза и планом лечения."}
                  </p>
                  <Link to="/consultation" className="mt-auto bg-gray-700 text-white w-full py-3 rounded-xl font-bold hover:bg-gray-600 transition text-center flex items-center justify-center gap-2">
                     Записаться <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* === ГАЙДЫ === */}
      <div id="guides" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Авторские руководства</h2>
            <p className="text-lg text-gray-500 max-w-2xl">
              Пошаговые инструкции, схемы питания и чек-листы здоровья.
            </p>
          </div>
          <Link to="/guides" className="text-primary font-bold flex items-center gap-2 hover:text-emerald-700 transition">
            Все материалы <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {guides.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {guides.map((guide) => (
              <div key={guide.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col group cursor-pointer" onClick={() => navigate(`/guides/${guide.id}`)}>
                <div className="h-56 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                  {guide.cover_image_id ? (
                    <img src={`/api/guides/${guide.id}/cover`} alt={guide.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <Book className="w-20 h-20 text-emerald-300 group-hover:scale-110 transition-transform" />
                  )}
                  <div className="absolute top-4 right-4 bg-white/95 px-4 py-1.5 rounded-full text-sm font-black text-gray-900 shadow-sm">
                    {guide.price} ₽
                  </div>
                </div>
                
                <div className="p-8 flex flex-col grow">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{guide.title}</h3>
                  <p className="text-gray-500 text-sm mb-6 line-clamp-3">{guide.description}</p>
                  
                  <div className="mt-auto flex gap-3">
                      <button className="flex-1 bg-gray-50 text-gray-900 py-3 rounded-xl font-medium border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-100 transition">
                        <Eye className="w-4 h-4 text-gray-500" /> Смотреть
                      </button>
                      
                      <button onClick={(e) => handleLike(e, guide.id)} className={`px-4 py-3 rounded-xl flex items-center gap-1.5 font-bold transition border ${guide.is_liked ? 'bg-pink-50 border-pink-200 text-pink-500' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        <Heart className={`w-5 h-5 ${guide.is_liked ? 'fill-current' : ''}`} />
                        {guide.likes_count}
                      </button>

                      <div className="flex items-center justify-center gap-1 text-gray-400 font-bold px-2">
                        <MessageCircle className="w-5 h-5" /> {guide.comments_count}
                      </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === BOTTOM CTA === */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 mb-10">
        <div className="bg-primary rounded-3xl p-8 sm:p-12 text-center text-white relative overflow-hidden shadow-2xl shadow-emerald-500/20">
          <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>
          
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-6">Нужна помощь прямо сейчас?</h2>
            <p className="text-emerald-50 text-lg mb-10 max-w-2xl mx-auto">
              Выберите удобное время в календаре. Регистрация займет меньше минуты, а профессиональная помощь будет оказана в срок.
            </p>
            <Link to="/consultation" className="bg-white text-primary px-10 py-4 rounded-2xl font-bold text-lg hover:bg-gray-50 transition shadow-xl inline-block">
              Выбрать время приема
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}