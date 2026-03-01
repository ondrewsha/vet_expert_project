import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { UserCircle, Download, Book, Loader2, Save, Check, Calendar, Video, RefreshCw, ChevronDown, ChevronUp, Star } from 'lucide-react';

export default function Profile() {
  const { user, checkAuth } = useAuthStore();
  const [guides, setGuides] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [updatingLinkId, setUpdatingLinkId] = useState(null); 
  
  const [name, setName] = useState(user?.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fetchAppointments = () => {
    apiClient.get('/appointments/me')
      .then(res => setAppointments(res.data))
      .catch(err => console.error("Ошибка загрузки записей", err))
      .finally(() => setLoadingAppts(false));
  };

  useEffect(() => {
    apiClient.get('/users/me/guides').then(res => setGuides(res.data)).finally(() => setLoadingGuides(false));
    fetchAppointments();
  },[]);

  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await apiClient.patch('/users/me', { full_name: name });
      await checkAuth(); 
      setSaved(true);
      setTimeout(() => setSaved(false), 2000); 
    } finally {
      setSavingName(false);
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

  // УМНОЕ ОБНОВЛЕНИЕ ССЫЛКИ
  const handleRefreshLink = async (apptId) => {
    setUpdatingLinkId(apptId);
    try {
      await apiClient.patch(`/appointments/${apptId}/refresh-link`);
      fetchAppointments(); // Перезапрашиваем список
    } catch (e) {
      alert("Ошибка при получении ссылки");
      console.error(e);
    } finally {
      setUpdatingLinkId(null);
    }
  };

  // СОХРАНЕНИЕ ОЦЕНКИ
  const handleRate = async (apptId, star) => {
    // Оптимистичное обновление UI
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, rating: star } : a));
    try {
      await apiClient.patch(`/appointments/${apptId}/rating`, { rating: star });
    } catch (e) {
      console.error("Ошибка сохранения оценки", e);
    }
  };

  // Разделяем по статусу (Бэкенд сам меняет статус на completed через 30 мин)
  const upcomingAppts = appointments.filter(a => a.status === 'scheduled');
  const historyAppts = appointments.filter(a => a.status === 'completed');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Личный кабинет</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-10">
        <div className="flex items-start gap-4 mb-6">
          <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
            <UserCircle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Мои данные</h2>
            <p className="text-gray-500 text-sm">Телефон: {user?.phone}</p>
          </div>
        </div>

        <div className="max-w-md flex gap-3">
          <input type="text" placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition" />
          <button onClick={handleSaveName} disabled={savingName || name === user?.full_name} className="bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50">
            {savingName ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5 text-emerald-400" /> : <Save className="w-5 h-5" />}
            <span className="hidden sm:inline">Сохранить</span>
          </button>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Calendar className="w-6 h-6 text-primary" />
        Предстоящие приемы
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
              <div>
                {appt.meet_link ? (
                  <a href={appt.meet_link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-5 py-2.5 rounded-xl font-medium hover:bg-blue-100 transition">
                    <Video className="w-5 h-5" /> Подключиться к звонку
                  </a>
                ) : (
                  <button onClick={() => handleRefreshLink(appt.id)} disabled={updatingLinkId === appt.id} className="flex items-center justify-center gap-2 bg-amber-50 text-amber-600 px-5 py-2.5 rounded-xl font-medium border border-amber-100 hover:bg-amber-100 transition w-full sm:w-auto">
                    <RefreshCw className={`w-5 h-5 ${updatingLinkId === appt.id ? 'animate-spin' : ''}`} />
                    Запросить ссылку
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
                    <div className="text-gray-600 font-bold mb-1">{formatDateTime(appt.start_time)}</div>
                    <div className="text-sm text-gray-500">Пациент: {appt.pet_info || 'Не указано'}</div>
                  </div>
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* ... Блок "Мои гайды" (остается таким же как был) ... */}
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