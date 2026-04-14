import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { formatPhone } from '../lib/utils';
import { toast } from 'sonner';
import Modal from '../components/Modal';
import { UserCircle, Download, Book, Loader2, Save, Calendar, Video, RefreshCw, ChevronDown, ChevronUp, Star, Phone, XCircle, Stethoscope, Paperclip, FileText, Upload } from 'lucide-react';

export default function Profile() {
  const { user, checkAuth } = useAuthStore();
  const [guides, setGuides] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [updatingLinkId, setUpdatingLinkId] = useState(null); 
  
  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingData, setSavingData] = useState(false);

  const [phoneStep, setPhoneStep] = useState(0); // 0 = спит, 1 = вводим код
  const [phoneCode, setPhoneCode] = useState('');
  const [needBot, setNeedBot] = useState(false);

  const [history, setHistory] = useState([]); // Отдельный стейт для истории
  const [hasMoreHistory, setHasMoreHistory] = useState(true); // Есть ли еще?
  const [loadingHistory, setLoadingHistory] = useState(false);
  const initialized = useRef(false);
  const HISTORY_LIMIT = 3;

  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [selectedApptForProtocol, setSelectedApptForProtocol] = useState(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [recommendations, setRecommendations] = useState('');

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [apptToCancel, setApptToCancel] = useState(null);
  const [isCanceling, setIsCanceling] = useState(false);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewDoctorId, setReviewDoctorId] = useState(null);

  const isDoctor = user?.role === 'doctor' || user?.role === 'superadmin';

  const fetchAppointments = () => {
    apiClient.get('/appointments/me')
      .then(res => {
        setAppointments(res.data.filter(a => a.status === 'scheduled'));
      })
      .catch(() => {})
      .finally(() => setLoadingAppts(false));
  };

  const loadHistoryData = async (offset) => {
      setLoadingHistory(true);
      try {
          const res = await apiClient.get(`/appointments/me/history?limit=${HISTORY_LIMIT}&offset=${offset}`);
          if (res.data.length < HISTORY_LIMIT) setHasMoreHistory(false);
          
          setHistory(prev => {
              // Защита от дублей ID
              const existingIds = new Set(prev.map(i => i.id));
              const uniqueNew = res.data.filter(i => !existingIds.has(i.id));
              return [...prev, ...uniqueNew];
          });
      } finally {
          setLoadingHistory(false);
      }
  };

  const submitReview = async () => {
    try {
        await apiClient.post('/reviews', {
            text: reviewText,
            rating: reviewRating,
            doctor_id: reviewDoctorId
        });
        toast.success("Спасибо за ваш отзыв!");
        setIsReviewModalOpen(false);
        setReviewText('');
    } catch (e) {
        toast.error("Не удалось отправить отзыв");
        console.error("Ошибка при отправке отзыва", e);
    }
  };

  useEffect(() => {
    apiClient.get('/users/me/guides').then(res => setGuides(res.data)).finally(() => setLoadingGuides(false));
    fetchAppointments();
    if (!initialized.current) {
        initialized.current = true;
        loadHistoryData(0);
    }
  },[]);

  const openProtocolModal = (appt) => {
    setSelectedApptForProtocol(appt);
    setDiagnosis('');
    setRecommendations('');
    setIsProtocolModalOpen(true);
  };

  const submitProtocol = async () => {
    try {
        await apiClient.post(`/appointments/${selectedApptForProtocol.id}/generate-protocol`, {
            diagnosis, recommendations
        });
        toast.success("Протокол создан и отправлен!");
        setIsProtocolModalOpen(false);
        fetchAppointments(); // убираем из предстоящих
        
        // Сбрасываем и обновляем историю записей, чтобы отчет сразу появился там
        setHistory([]);
        loadHistoryData(0); 
    } catch (e) {
        toast.error("Ошибка создания протокола");
        console.error("Ошибка создания протокола", e);
    }
  };

  const handleLoadMore = () => {
    loadHistoryData(history.length);
  };

  // Сохранение имени и телефона
  const handleSaveData = async () => {
    setSavingData(true);
    try {
      await apiClient.patch('/users/me', { full_name: name });
      await checkAuth(); 
      toast.success("Имя успешно сохранено!");
    } finally {
      setSavingData(false);
    }
  };

  // Отмена записи
  // 1. Открытие модалки
  const handleCancelClick = (apptId) => {
    setApptToCancel(apptId);
    setIsCancelModalOpen(true);
  };

  // 2. Реальная отмена (вызывается из модалки)
  const confirmCancel = async () => {
    if (!apptToCancel) return;

    setIsCanceling(true);
    
    try {
      const res = await apiClient.post(`/appointments/${apptToCancel}/cancel`);
      await checkAuth(); // Обновляем баланс
      fetchAppointments(); // Обновляем список
      toast.success(res.data.message || "Запись успешно отменена!");
    } catch (error) {
      toast.error("Ошибка при отмене записи.");
      console.error("Ошибка при отмене записи", error);
    } finally {
      setIsCancelModalOpen(false);
      setApptToCancel(null);
      setIsCanceling(false); // Выключаем лоудер
    }
  };

  const handleDownload = async (guide) => {
    try {
      const res = await apiClient.get(`/guides/${guide.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${guide.title}.pdf`); 
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Не удалось скачать файл.");
      console.error("Ошибка при скачивании гайда", error);
    }
  };

  const formatDateTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleString('ru-RU', { 
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
    });
  };

  const handleRefreshLink = async (apptId) => {
    setUpdatingLinkId(apptId);
    try {
      await apiClient.patch(`/appointments/${apptId}/refresh-link`);
      fetchAppointments();
    } finally {
      setUpdatingLinkId(null);
    }
  };

  const handleRate = async (apptId, star) => {
    setHistory(prev => prev.map(a => a.id === apptId ? { ...a, rating: star } : a));
    try {
      await apiClient.patch(`/appointments/${apptId}/rating`, { rating: star });
    } catch (e) { console.error(e); }
  };

  // Функция 1: Запрос кода
  const handleRequestPhoneChange = async () => {
    let formattedPhone = phone.replace(/[^\d+]/g, '');
    setPhone(formattedPhone);

    try {
      const res = await apiClient.post('/users/me/phone/request', { new_phone: formattedPhone });
      setNeedBot(res.data.need_bot);
      setPhoneStep(1);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ошибка при запросе");
      setPhone(user?.phone); // Откат
    }
  };

  // Функция 2: Подтверждение кода
  const handleVerifyPhoneChange = async () => {
    try {
      await apiClient.post('/users/me/phone/verify', { new_phone: phone, code: phoneCode });
      await checkAuth(); // Обновляем юзера
      setPhoneStep(0);
      setPhoneCode('');
      toast.success("Телефон успешно изменен!");
    } catch (e) {
      toast.error("Неверный код. Попробуйте еще раз.");
      console.error("Ошибка при подтверждении кода", e);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Личный кабинет</h1>
        
        {/* КНОПКА БЭК-ОФИСА (Только для админов) */}
        {(user?.role === 'superadmin') && (
          <button 
            onClick={async () => {
              // 1. Запрашиваем код (используем существующий эндпоинт авторизации)
              try {
                await apiClient.post('/auth/send-code', { phone: user.phone });
                toast.success("Код для входа в Бэк-офис отправлен вам в Telegram!");
                // 2. Открываем админку в новой вкладке
                window.open(`${window.location.origin}/admin`, '_blank');
              } catch (e) {
                toast.error("Ошибка при запросе кода для админки.");
                console.error("Ошибка при запросе кода для админки", e);
              }
            }}
            className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition"
          >
            Войти в Бэк-офис
          </button>
        )}
      </div>

      {/* МОИ ДАННЫЕ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-10">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-gray-100">
          <div className="bg-emerald-100 p-4 rounded-full text-primary">
            <UserCircle className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Мои данные</h2>
            <p className="text-gray-500">Управляйте контактной информацией</p>
          </div>
          {/* ПОКАЗЫВАЕМ РЕЙТИНГ ВРАЧУ */}
          <div className="ml-auto">
            {isDoctor && (
              <>
              {user?.average_rating ? (
                  <div className="flex items-center gap-1.5 text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-100">
                      <Star className="w-4 h-4 fill-current" />
                      Оценка пациентов: {Number(user.average_rating).toFixed(1)}
                  </div>
              ) : (
                  <div className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">Оценок пока нет</div>
              )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* ИМЯ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
            <div className="flex gap-3">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition" />
              {name !== user?.full_name && (
                <button onClick={handleSaveData} disabled={savingData} className="bg-gray-900 text-white px-6 rounded-xl hover:bg-gray-800 transition flex items-center justify-center gap-2">
                  {savingData ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          {/* ТЕЛЕФОН */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон (Привязан к Telegram)</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="tel" 
                  value={formatPhone(phone)} 
                  onChange={(e) => {
                    setPhone(formatPhone(e.target.value));
                    setPhoneStep(0); // Сбрасываем стейт изменения
                  }} 
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition" 
                />
              </div>
              {phone !== user?.phone && phoneStep === 0 && (
                <button onClick={handleRequestPhoneChange} className="bg-primary text-white px-6 rounded-xl hover:bg-emerald-600 transition font-medium">
                  Сменить
                </button>
              )}
            </div>

            {/* БЛОК ВВОДА КОДА ДЛЯ СМЕНЫ ТЕЛЕФОНА */}
            {phoneStep === 1 && (
              <div className="mt-4 p-5 bg-blue-50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-4">
                {needBot ? (
                  <div className="text-sm text-blue-800 mb-4">
                    Для подтверждения нового номера перейдите в <a href="https://t.me/zoo_medica_bot" target="_blank" rel="noreferrer" className="font-bold underline">нашего Telegram-бота</a>, нажмите <b>Start</b> и отправьте свой контакт. После этого нажмите "Отправить код".
                  </div>
                ) : (
                  <div className="text-sm text-blue-800 mb-4">
                    Мы отправили код подтверждения в ваш Telegram.
                  </div>
                )}
                
                <div className="flex gap-3">
                  {needBot ? (
                    <button onClick={handleRequestPhoneChange} className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
                      Я поделился контактом, отправить код
                    </button>
                  ) : (
                    <>
                      <input 
                        type="text" 
                        placeholder="0000" 
                        maxLength={4}
                        value={phoneCode} 
                        onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))} 
                        className="px-4 py-2 border border-blue-200 rounded-xl w-32 text-center tracking-widest outline-none focus:border-blue-500" 
                      />
                      <button onClick={handleVerifyPhoneChange} disabled={phoneCode.length < 4} className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition">
                        Подтвердить
                      </button>
                      
                      {/* --- НОВАЯ КНОПКА ОТМЕНЫ --- */}
                      <button 
                        onClick={() => {
                          setPhoneStep(0);
                          setPhoneCode('');
                          setPhone(user?.phone); 
                        }} 
                        className="bg-white text-gray-700 border border-gray-300 px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
                      >
                        Отмена
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ПРЕДСТОЯЩИЕ ЗАПИСИ */}
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Calendar className="w-6 h-6 text-primary" /> 
        {isDoctor ? "Мои пациенты (Предстоящие)" : "Предстоящие приемы"}
      </h2>
      
      {loadingAppts ? (
        <div className="flex justify-center py-6"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : appointments.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-500 border border-dashed border-gray-200 mb-10">
          У вас нет запланированных консультаций.
        </div>
      ) : (
        <div className="space-y-4 mb-10">
          {appointments.map(appt => (
            <div key={appt.id} className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                  <div>
                    <div className="text-lg font-bold text-gray-900 mb-1">
                      {formatDateTime(appt.start_time)}
                    </div>
                    
                    {/* Если я Врач - показываю пациента, если Пациент - врача */}
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                       <Stethoscope className="w-4 h-4 text-emerald-500" />
                       {isDoctor ? "Пациент (из анкеты):" : appt.doctor?.full_name || "Специалист"}
                    </div>

                    <div className="text-sm text-gray-500 bg-gray-50 inline-block px-3 py-1 rounded-lg">Пациент: {appt.pet_name || 'Не указано'} {appt.pet_details || ''}</div>

                    {/* ФАЙЛЫ АНАЛИЗОВ */}
                    {appt.files && appt.files.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {appt.files.map(f => (
                                <a key={f.id} href={`/api/appointments/files/${f.mongo_file_id}`} target="_blank" rel="noreferrer" className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-1 hover:bg-blue-100 transition">
                                    <Paperclip className="w-3 h-3" /> {f.filename}
                                </a>
                            ))}
                        </div>
                    )}
                  </div>
              <div className="flex flex-col sm:flex-row gap-3">
                    {appt.meet_link ? (
                  <a href={appt.meet_link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-5 py-2.5 rounded-xl font-medium hover:bg-blue-100 transition">
                        <Video className="w-5 h-5" /> Подключиться
                      </a>
                    ) : (
                  <button onClick={() => handleRefreshLink(appt.id)} disabled={updatingLinkId === appt.id} className="flex items-center justify-center gap-2 bg-amber-50 text-amber-600 px-5 py-2.5 rounded-xl font-medium border border-amber-100 hover:bg-amber-100 transition">
                    <RefreshCw className={`w-5 h-5 ${updatingLinkId === appt.id ? 'animate-spin' : ''}`} /> Обновить ссылку
                      </button>
                    )}

                    {/* КНОПКА ЗАВЕРШЕНИЯ (ДЛЯ ВРАЧА) */}
                    {isDoctor && (
                      <button 
                        onClick={() => openProtocolModal(appt)}
                        className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-medium border border-emerald-100 hover:bg-emerald-100 transition text-sm"
                      >
                        <FileText className="w-4 h-4" /> Написать отчет
                      </button>
                    )}
                    
                    {/* КНОПКА ОТМЕНЫ */}
                    {!isDoctor && (
                      <button 
                        onClick={() => handleCancelClick(appt.id)} // <--- ИЗМЕНИЛИ ЗДЕСЬ
                        className="flex items-center justify-center gap-2 bg-white text-red-500 px-4 py-2 rounded-xl font-medium border border-red-100 hover:bg-red-50 transition text-sm"
                      >
                        <XCircle className="w-4 h-4" /> Отменить
                      </button>
                    )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ИСТОРИЯ ЗАПИСЕЙ --- */}
      {history.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-600 hover:text-gray-900 transition">
            История приемов
          </div>
          <div className="mt-4 space-y-4">
            {history.map(appt => (
              <div key={appt.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-80 hover:opacity-100 transition">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-gray-600 font-bold">{formatDateTime(appt.start_time)}</span>
                    {appt.status === 'canceled' && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-md font-medium">Отменена</span>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Stethoscope className="w-4 h-4 text-emerald-500" />
                    {appt.doctor?.full_name || "Специалист"}
                  </div>
                  <div className="text-sm text-gray-500">{appt.pet_name || 'Не указано'} {appt.pet_details ? `- ${appt.pet_details}` : ''}</div>
                </div>
                {/* ЗАКЛЮЧЕНИЕ */}
                <div className="items-center">
                    {appt.protocol_file_id ? (
                        <a href={`/api/appointments/files/${appt.protocol_file_id}`} target="_blank" className="flex items-center gap-2 text-emerald-700 font-bold hover:underline">
                            <FileText className="w-5 h-5"/> Скачать заключение врача
                        </a>
                    ) : isDoctor && appt.status !== 'canceled' ? (
                        <>
                        {!appt.protocol_file_id && (
                            <button 
                                onClick={() => openProtocolModal(appt)}
                                className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition"
                            >
                                <FileText className="w-4 h-4" /> Создать заключение
                            </button>
                        )}
                        </>
                    ) : (
                        <div>
                          {appt.status !== 'canceled' && <span className="text-gray-400 text-sm">Заключение еще не готово</span>}
                        </div>
                    )}
                </div>
                
                {appt.status === 'completed' && !isDoctor && (
                  <div>
                    <div className="text-sm font-medium text-gray-500 mb-2 text-center">
                      {appt.rating ? "Ваша оценка" : "Оцените прием"}
                    </div>
                    <div className="flex gap-1 justify-center sm:justify-end mb-4">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} onClick={() => handleRate(appt.id, star)} className={`transition ${(appt.rating || 0) >= star ? 'text-amber-400' : 'text-gray-300 hover:text-amber-200'}`}>
                          <Star className="w-7 h-7 fill-current" />
                        </button>
                      ))}
                    </div>
                    <button 
                        onClick={() => {
                            setReviewDoctorId(appt.doctor.id);
                            setReviewRating(appt.rating || 0);
                            setIsReviewModalOpen(true);
                        }}
                        className="px-6 py-2 ml-1.5 bg-emerald-50 text-primary border border-primary/20 rounded-full text-xs font-bold hover:bg-primary hover:text-white transition-all duration-300 shadow-sm active:scale-95"
                    >
                        Написать отзыв
                    </button>
                  </div>
                  )}
              </div>
            ))}
            {/* Кнопка "Показать еще" */}
            {hasMoreHistory && (
              <button 
                onClick={handleLoadMore} 
                disabled={loadingHistory}
                className="w-full py-3 text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition flex justify-center"
              >
                {loadingHistory ? <Loader2 className="w-4 h-4 animate-spin"/> : "Показать еще"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ... Блок "Мои гайды" ... */}
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Book className="w-6 h-6 text-primary" />
        Мои гайды
      </h2>
      {loadingGuides ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : guides.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-500 border border-dashed border-gray-200">
          Вы пока не приобрели ни одного гайда.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {guides.map(guide => (
            <div key={guide.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition">
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
              <h3 className="text-lg font-bold text-gray-900 mb-2">{guide.title}</h3>
              <p className="text-sm text-gray-500 mb-6 grow">Доступ открыт навсегда</p>
              
              <button
                onClick={() => handleDownload(guide)}
                className="w-full bg-primary text-white py-2.5 rounded-xl flex justify-center items-center gap-2 hover:bg-emerald-600 transition font-medium"
              >
                <Download className="w-5 h-5" />
                Скачать PDF
              </button>
            </div>
          ))}
        </div>
      )}

      {/* МОДАЛКА ПРОТОКОЛА КОНСУЛЬТАЦИИ */}
      <Modal isOpen={isProtocolModalOpen} onClose={() => setIsProtocolModalOpen(false)} title="Протокол консультации">
        <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-xl text-sm">
                <p><b>Пациент:</b> {selectedApptForProtocol?.pet_name} ({selectedApptForProtocol?.pet_details})</p>
                <p className="mt-1"><b>Жалобы:</b> {selectedApptForProtocol?.pet_info}</p>
            </div>
            
            <div>
                <label className="block text-sm font-bold mb-1">Диагноз</label>
                <textarea rows="2" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} className="w-full border rounded-xl p-2 outline-none focus:ring-2 focus:ring-primary"></textarea>
            </div>
            <div>
                <label className="block text-sm font-bold mb-1">Рекомендации</label>
                <textarea rows="6" value={recommendations} onChange={e => setRecommendations(e.target.value)} className="w-full border rounded-xl p-2 outline-none focus:ring-2 focus:ring-primary"></textarea>
            </div>
            
            <button onClick={submitProtocol} className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-emerald-600">
                Сохранить и отправить
            </button>
        </div>
      </Modal>

      {/* МОДАЛКА ОТМЕНЫ */}
      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Отмена записи">
        <div className="space-y-4">
          <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm border border-amber-100">
            Вы уверены, что хотите отменить эту запись?
          </div>
          <p className="text-gray-600 text-sm">
            <b>Правила отмены:</b><br/>
            — При отмене более чем за 4 часа до начала: средства возвращаются на ваш <b>внутренний баланс</b>. Вы сможете использовать их для новой записи в любое время.<br/>
            — При отмене менее чем за 4 часа: средства <b>не возвращаются</b> (услуга считается оказанной, так как врач забронировал время).
          </p>
          
          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isCanceling} // Блокируем кнопку "Оставить"
              className="flex-1 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition disabled:opacity-50"
            >
              Оставить
            </button>
            <button 
              onClick={confirmCancel}
              disabled={isCanceling} // Блокируем кнопку "Отменить"
              className="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isCanceling ? <Loader2 className="w-5 h-5 animate-spin" /> : "Да, отменить"}
            </button>
          </div>
        </div>
      </Modal>

      {/* МОДАЛКА ОТЗЫВА */}
      <Modal isOpen={isReviewModalOpen} onClose={() => setIsReviewModalOpen(false)} title="Ваш отзыв">
        <div className="space-y-4">
            <textarea 
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="Расскажите о ваших впечатлениях..."
                className="w-full border rounded-xl p-3 h-32 outline-none focus:ring-2 focus:ring-primary"
            />
            <button onClick={submitReview} className="w-full bg-primary text-white py-3 rounded-xl font-bold">
                Опубликовать
            </button>
        </div>
      </Modal>

    </div>
  );
}