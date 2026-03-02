import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { UserCircle, Download, Book, Loader2, Save, Calendar, Video, RefreshCw, ChevronDown, ChevronUp, Star, Phone, Ticket, XCircle } from 'lucide-react';

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
  const [showHistory, setShowHistory] = useState(false);

  const [phoneStep, setPhoneStep] = useState(0); // 0 = спит, 1 = вводим код
  const [phoneCode, setPhoneCode] = useState('');
  const [needBot, setNeedBot] = useState(false);

  const fetchAppointments = () => {
    apiClient.get('/appointments/me')
      .then(res => setAppointments(res.data))
      .catch(() => {})
      .finally(() => setLoadingAppts(false));
  };

  useEffect(() => {
    apiClient.get('/users/me/guides').then(res => setGuides(res.data)).finally(() => setLoadingGuides(false));
    fetchAppointments();
  },[]);

  // Сохранение имени и телефона
  const handleSaveData = async () => {
    setSavingData(true);
    try {
      await apiClient.patch('/users/me', { full_name: name });
      await checkAuth(); 
      alert("Имя успешно сохранено!");
    } finally {
      setSavingData(false);
    }
  };

  // Отмена записи
  const handleCancel = async (apptId) => {
    if (!window.confirm("Вы уверены, что хотите отменить запись? Средства будут возвращены на ваш внутренний баланс в виде 1 консультации.")) return;
    
    try {
      await apiClient.post(`/appointments/${apptId}/cancel`);
      await checkAuth(); // Обновляем стейт юзера (чтобы увидеть +1 на балансе)
      fetchAppointments(); // Обновляем список записей
      alert("Запись отменена. 1 консультация добавлена на ваш баланс.");
    } catch (error) {
      alert("Ошибка при отмене записи.");
      console.error("Ошибка при отмене записи", error);
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
      alert("Не удалось скачать файл.");
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
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, rating: star } : a));
    try {
      await apiClient.patch(`/appointments/${apptId}/rating`, { rating: star });
    } catch (e) { console.error(e); }
  };

  // Функция 1: Запрос кода
  const handleRequestPhoneChange = async () => {
    let formattedPhone = phone.replace(/\s+/g, '');
    if (formattedPhone.startsWith('8')) formattedPhone = '+7' + formattedPhone.slice(1);
    else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;
    setPhone(formattedPhone);

    try {
      const res = await apiClient.post('/users/me/phone/request', { new_phone: formattedPhone });
      setNeedBot(res.data.need_bot);
      setPhoneStep(1);
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка при запросе");
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
      alert("Телефон успешно изменен!");
    } catch (e) {
      alert("Неверный код. Попробуйте еще раз.");
      console.error("Ошибка при подтверждении кода", e);
    }
  };

  const upcomingAppts = appointments.filter(a => a.status === 'scheduled');
  const historyAppts = appointments.filter(a => a.status === 'completed' || a.status === 'canceled');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Личный кабинет</h1>
        
        {/* КНОПКА БЭК-ОФИСА (Только для врачей и админов) */}
        {(user?.role === 'superadmin') && (
          <button 
            onClick={async () => {
              // 1. Запрашиваем код (используем существующий эндпоинт авторизации)
              try {
                await apiClient.post('/auth/send-code', { phone: user.phone });
                alert("Код для входа в Бэк-офис отправлен вам в Telegram!");
                // 2. Открываем админку в новой вкладке
                window.open(`${window.location.origin}/admin`, '_blank');
              } catch (e) {
                alert("Ошибка при запросе кода для админки.");
                console.error("Ошибка при запросе кода для админки", e);
              }
            }}
            className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition"
          >
            Войти в Бэк-офис
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        
        {/* ЛЕВАЯ КОЛОНКА: Данные */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-gray-100">
            <div className="bg-emerald-100 p-4 rounded-full text-primary">
              <UserCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Мои данные</h2>
              <p className="text-gray-500">Управляйте контактной информацией</p>
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
                    value={phone} 
                    onChange={(e) => {
                      setPhone(e.target.value);
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
                      Для подтверждения нового номера перейдите в <a href="https://t.me/VetExpert_TestBot" target="_blank" rel="noreferrer" className="font-bold underline">нашего Telegram-бота</a>, нажмите <b>Start</b> и отправьте свой контакт. После этого нажмите "Отправить код".
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

        {/* ПРАВАЯ КОЛОНКА: Баланс */}
        <div className="bg-linear-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-8 text-white flex flex-col justify-center items-center text-center relative overflow-hidden">
          {/* Декор */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
          
          <Ticket className="w-12 h-12 mb-4 opacity-90" />
          <h3 className="text-xl font-medium opacity-90 mb-2">Ваш баланс</h3>
          <div className="text-6xl font-black mb-2">{user?.unused_consultations || 0}</div>
          <p className="text-sm opacity-80 mt-2">
            оплаченных консультаций<br/>доступно для записи
          </p>
        </div>
      </div>

      {/* --- ПРЕДСТОЯЩИЕ ЗАПИСИ --- */}
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Calendar className="w-6 h-6 text-primary" /> Предстоящие приемы
      </h2>
      
      {loadingAppts ? (
        <div className="flex justify-center py-6"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : upcomingAppts.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-500 border border-dashed border-gray-200 mb-10">
          У вас нет запланированных консультаций.
        </div>
      ) : (
        <div className="space-y-4 mb-10">
          {upcomingAppts.map(appt => (
            <div key={appt.id} className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
              <div>
                <div className="text-lg font-bold text-gray-900 mb-1">{formatDateTime(appt.start_time)}</div>
                <div className="text-sm text-gray-500 bg-gray-50 inline-block px-3 py-1 rounded-lg">Пациент: {appt.pet_info || 'Не указано'}</div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {appt.meet_link ? (
                  <a href={appt.meet_link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-5 py-2.5 rounded-xl font-medium hover:bg-blue-100 transition">
                    <Video className="w-5 h-5" /> Подключиться
                  </a>
                ) : (
                  <button onClick={() => handleRefreshLink(appt.id)} disabled={updatingLinkId === appt.id} className="flex items-center justify-center gap-2 bg-amber-50 text-amber-600 px-5 py-2.5 rounded-xl font-medium border border-amber-100 hover:bg-amber-100 transition">
                    <RefreshCw className={`w-5 h-5 ${updatingLinkId === appt.id ? 'animate-spin' : ''}`} /> Ссылка
                  </button>
                )}
                {/* КНОПКА ОТМЕНЫ */}
                <button onClick={() => handleCancel(appt.id)} className="flex items-center justify-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-medium border border-red-100 hover:bg-red-100 transition">
                  <XCircle className="w-5 h-5" /> Отменить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ИСТОРИЯ ЗАПИСЕЙ --- */}
      {historyAppts.length > 0 && (
        <div className="mb-12">
          <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-lg font-bold text-gray-600 hover:text-gray-900 transition">
            История приемов {showHistory ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          {showHistory && (
            <div className="mt-4 space-y-4">
              {historyAppts.map(appt => (
                <div key={appt.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-80 hover:opacity-100 transition">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-gray-600 font-bold">{formatDateTime(appt.start_time)}</span>
                      {appt.status === 'canceled' && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-md font-medium">Отменена</span>}
                    </div>
                    <div className="text-sm text-gray-500">Пациент: {appt.pet_info || 'Не указано'}</div>
                  </div>
                  
                  {appt.status === 'completed' && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2 text-center sm:text-right">
                        {appt.rating ? "Ваша оценка" : "Оцените прием"}
                      </div>
                      <div className="flex gap-1 justify-center sm:justify-end">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button key={star} onClick={() => handleRate(appt.id, star)} className={`transition ${(appt.rating || 0) >= star ? 'text-amber-400' : 'text-gray-300 hover:text-amber-200'}`}>
                            <Star className="w-7 h-7 fill-current" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
              <div className="bg-emerald-50 p-4 rounded-full mb-4">
                <Book className="w-8 h-8 text-primary" />
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
    </div>
  );
}