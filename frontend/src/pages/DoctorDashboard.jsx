import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { BookOpen, UploadCloud, Loader2, CheckCircle, Calendar, Clock, Lock, CheckSquare, Settings, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function DoctorDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('schedule'); // 'guides' | 'schedule' | 'settings'

  // --- Стейты Гайда ---
  const[title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const[snippet, setSnippet] = useState('');
  const [price, setPrice] = useState('');
  const[file, setFile] = useState(null);
  // const [cover, setCover] = useState(null); // Для загрузки обложки (пока не используется, задел на будущее)
  const [loadingGuide, setLoadingGuide] = useState(false);

  // --- Стейты Умного Расписания ---
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  const defaultDate = new Date(today.getTime() - offset).toISOString().split('T')[0];
  
  const [scheduleDate, setScheduleDate] = useState(defaultDate);
  const[scheduleSlots, setScheduleSlots] = useState([]); 
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const[savingSchedule, setSavingSchedule] = useState(false);
  
  const [toBlock, setToBlock] = useState([]);
  const [toUnblock, setToUnblock] = useState([]);

  // --- Стейты Настроек Врача ---
  const [workDays, setWorkDays] = useState([0, 1, 2, 3, 4, 5, 6]); // 0=Пн, 6=Вс. По умолчанию все дни.
  const [loadingSettings, setLoadingSettings] = useState(false);
  const[savingSettings, setSavingSettings] = useState(false);

  // --- ЭФФЕКТЫ ---
  useEffect(() => {
    if (activeTab === 'schedule') {
      const fetchSchedule = async () => {
        setLoadingSchedule(true);
        setToBlock([]); 
        setToUnblock([]);
        try {
          const res = await apiClient.get(`/appointments/doctor/schedule?target_date=${scheduleDate}`);
          setScheduleSlots(res.data);
        } catch (e) {
          toast.error("Ошибка загрузки расписания");
          console.error(e);
        } finally {
          setLoadingSchedule(false);
        }
      };
      fetchSchedule();
    }
    
    if (activeTab === 'settings') {
      const fetchSettings = async () => {
        setLoadingSettings(true);
        try {
          // Предполагаем, что бэкенд отдаст нам профиль по /users/me
          const res = await apiClient.get('/users/me');
          // Если мы прокинем профиль в ответ /users/me, можно будет брать дни оттуда. 
          // Пока что мы сделаем заглушку, а потом обновим бэк.
          // Временно будем считать, что дни хранятся в user.doctor_profile.work_days
          const docProfile = res.data.doctor_profile;
          if (docProfile && docProfile.work_days) {
              setWorkDays(docProfile.work_days.split(',').map(Number));
          }
        } catch (e) {
          toast.error("Ошибка загрузки настроек");
          console.error(e);
        } finally {
          setLoadingSettings(false);
        }
      };
      fetchSettings();
    }
  },[scheduleDate, activeTab]);

  // Защита роута
  if (user?.role !== 'doctor' && user?.role !== 'superadmin') {
    return <div className="text-center py-20 text-red-500 font-bold">Доступ запрещен</div>;
  }

  // --- ФУНКЦИИ РАСПИСАНИЯ ---
  const toggleSlot = (time, originalState) => {
    if (originalState === 'booked' || originalState === 'yandex') return;

    if (originalState === 'free') {
      if (toBlock.includes(time)) {
        setToBlock(toBlock.filter(t => t !== time)); 
      } else {
        setToBlock([...toBlock, time]);
      }
    } else if (originalState === 'blocked') {
      if (toUnblock.includes(time)) {
        setToUnblock(toUnblock.filter(t => t !== time));
      } else {
        setToUnblock([...toUnblock, time]);
      }
    }
  };

  const toggleWholeDay = () => {
    const freeSlots = scheduleSlots.filter(s => s.state === 'free').map(s => s.time);
    const blockedSlots = scheduleSlots.filter(s => s.state === 'blocked').map(s => s.time);
    
    if (toBlock.length < freeSlots.length) {
      setToBlock(freeSlots);
      setToUnblock(blockedSlots); 
    } else {
      setToBlock([]);
      setToUnblock([]);
    }
  };

  const handleSaveSchedule = async () => {
    if (toBlock.length === 0 && toUnblock.length === 0) return;
    setSavingSchedule(true);
    try {
      await apiClient.post('/appointments/doctor/manage-blocks', {
        date: scheduleDate,
        to_block: toBlock,
        to_unblock: toUnblock
      });
      toast.success("Расписание обновлено!");
      
      const res = await apiClient.get(`/appointments/doctor/schedule?target_date=${scheduleDate}`);
      setScheduleSlots(res.data);
      setToBlock([]);
      setToUnblock([]);
    } catch (e) {
      toast.error("Ошибка при сохранении расписания.");
      console.error(e);
    } finally {
      setSavingSchedule(false);
    }
  };

  // --- ФУНКЦИИ ГАЙДОВ ---
  const handleGuideSubmit = async (e) => {
    e.preventDefault();
    if (!file) return toast.error("Выберите PDF файл");

    setLoadingGuide(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if(snippet) formData.append('free_snippet', snippet);
    formData.append('price', price);
    formData.append('file', file);
    // if (cover) formData.append('cover', cover); // На будущее

    try {
      await apiClient.post('/guides', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success("Гайд опубликован!");
      setTitle(''); setDescription(''); setSnippet(''); setPrice(''); setFile(null);
    } catch (err) {
      toast.error("Ошибка при загрузке гайда");
      console.error(err);
    } finally {
      setLoadingGuide(false);
    }
  };

  // --- ФУНКЦИИ НАСТРОЕК ---
  const toggleWorkDay = (dayIndex) => {
      if (workDays.includes(dayIndex)) {
          setWorkDays(workDays.filter(d => d !== dayIndex));
      } else {
          setWorkDays([...workDays, dayIndex].sort());
      }
  };

  const handleSaveSettings = async () => {
      setSavingSettings(true);
      try {
          await apiClient.patch('/users/doctor/settings', {
              work_days: workDays.join(',')
          });
          toast.success("Настройки сохранены!");
      } catch (e) {
          toast.error("Ошибка сохранения настроек");
          console.error(e);
      } finally {
          setSavingSettings(false);
      }
  };

  // Вспомогательная функция для рендера карточек слотов
  const renderSlot = (slot) => {
    const isPendingBlock = toBlock.includes(slot.time);
    const isPendingUnblock = toUnblock.includes(slot.time);
    
    // Вычисляем ИТОГОВЫЙ ВИЗУАЛЬНЫЙ статус слота
    let visualState = slot.state;
    if (isPendingBlock) visualState = 'blocked_preview';
    if (isPendingUnblock) visualState = 'free_preview';

    let bgClass = "bg-gray-50 border-gray-200 text-gray-700"; // free
    let icon = null;
    let label = "Свободно";
    let cursor = "cursor-pointer hover:border-primary hover:bg-emerald-50";

    if (visualState === 'booked') {
        bgClass = "bg-amber-50 border-amber-200 text-amber-800";
        label = "Записан пациент";
        cursor = "cursor-not-allowed opacity-70";
    } else if (visualState === 'yandex') {
        bgClass = "bg-gray-100 border-gray-300 text-gray-500";
        label = "Событие в Яндексе";
        cursor = "cursor-not-allowed opacity-70";
    } else if (visualState === 'blocked') {
        bgClass = "bg-red-50 border-red-200 text-red-600";
        icon = <Lock className="w-4 h-4" />;
        label = "Заблокировано";
        cursor = "cursor-pointer hover:bg-red-100";
    } else if (visualState === 'blocked_preview') {
        bgClass = "bg-red-500 border-red-600 text-white shadow-md";
        icon = <Lock className="w-4 h-4" />;
        label = "Будет заблокировано";
    } else if (visualState === 'free_preview') {
        bgClass = "bg-white border-primary text-primary shadow-md border-2";
        label = "Будет свободно";
    }

    return (
        <div 
            key={slot.time} 
            onClick={() => toggleSlot(slot.time, slot.state)}
            className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center text-center select-none ${bgClass} ${cursor} h-24`}
        >
            <div className="font-bold text-lg mb-1 flex items-center justify-center gap-1">
                {icon} {slot.time}
            </div>
            <div className="text-xs leading-tight">{label}</div>
        </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8 flex items-center gap-3">
        Панель специалиста
      </h1>

      {/* ТАБЫ */}
      <div className="flex flex-wrap gap-2 bg-gray-100 p-1 rounded-xl mb-8 w-fit">
        <button onClick={() => setActiveTab('schedule')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          <Calendar className="w-4 h-4"/> Расписание (Блокировки)
        </button>
        <button onClick={() => setActiveTab('settings')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          <Settings className="w-4 h-4"/> Настройки графика
        </button>
        <button onClick={() => setActiveTab('guides')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'guides' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          <BookOpen className="w-4 h-4"/> Публикация гайдов
        </button>
      </div>

      {/* --- ВКЛАДКА 1: РАСПИСАНИЕ (УМНАЯ СЕТКА) --- */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 animate-in fade-in">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Управление слотами</h2>
              <p className="text-sm text-gray-500">Кликайте на слоты, чтобы заблокировать или разблокировать их.</p>
            </div>
            <div className="flex items-center gap-4">
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-primary outline-none" />
              <button onClick={toggleWholeDay} className="flex items-center gap-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl transition">
                <CheckSquare className="w-4 h-4" /> Весь день
              </button>
            </div>
          </div>

          {loadingSchedule ? (
            <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-8">
                {scheduleSlots.map(slot => renderSlot(slot))}
              </div>

              {(toBlock.length > 0 || toUnblock.length > 0) && (
                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200 animate-in slide-in-from-bottom-4">
                  <div className="text-sm text-gray-700 font-medium">
                    Выбрано для блокировки: <span className="text-red-600 font-bold">{toBlock.length}</span> | 
                    Для разблокировки: <span className="text-emerald-600 font-bold">{toUnblock.length}</span>
                  </div>
                  <button onClick={handleSaveSchedule} disabled={savingSchedule} className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-gray-800 transition flex items-center gap-2 disabled:opacity-50">
                    {savingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить изменения
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* --- ВКЛАДКА 2: НАСТРОЙКИ (РАБОЧИЕ ДНИ) --- */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 animate-in fade-in max-w-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Настройки графика работы</h2>
            <p className="text-sm text-gray-500 mb-8">Выберите дни недели, по которым вы принимаете пациентов. В остальные дни ваша карточка не будет отображаться на странице записи.</p>
            
            {loadingSettings ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
                <div className="space-y-8">
                    <div>
                        <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Рабочие дни</h3>
                        <div className="flex flex-wrap gap-3">
                            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dayName, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => toggleWorkDay(idx)}
                                    className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
                                        workDays.includes(idx) 
                                        ? 'bg-primary text-white shadow-md shadow-primary/30 border-2 border-primary' 
                                        : 'bg-white text-gray-400 border-2 border-dashed border-gray-300 hover:border-gray-400'
                                    }`}
                                >
                                    {dayName}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3 text-blue-800 text-sm">
                        <Clock className="w-5 h-5 shrink-0 text-blue-500" />
                        <p>
                            <b>Длительность приема зафиксирована:</b> 30 минут.<br/>
                            <b>Часы работы:</b> с 10:00 до 18:00.<br/>
                            Для точечного изменения расписания (например, уйти пораньше) используйте вкладку "Блокировки" или создавайте события в Яндекс.Календаре.
                        </p>
                    </div>

                    <button onClick={handleSaveSettings} disabled={savingSettings} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition flex items-center gap-2 disabled:opacity-50">
                        {savingSettings ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Сохранить график
                    </button>
                </div>
            )}
        </div>
      )}

      {/* --- ВКЛАДКА 3: ГАЙДЫ --- */}
      {activeTab === 'guides' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 animate-in fade-in">
          {/* ... Код формы гайда (остался как в предыдущем ответе) ... */}
          <h2 className="text-xl font-bold mb-6">Новый гайд</h2>
          <form onSubmit={handleGuideSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₽)</label>
                <input type="number" required min="0" value={price} onChange={e => setPrice(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
              <textarea required rows="3" value={description} onChange={e => setDescription(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none resize-none"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Фрагмент (Тизер)</label>
              <textarea rows="3" value={snippet} onChange={e => setSnippet(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none resize-none bg-emerald-50/30"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PDF Файл</label>
              <input type="file" accept="application/pdf" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" onChange={e => setFile(e.target.files[0])} />
            </div>
            <button type="submit" disabled={loadingGuide} className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition disabled:opacity-50">
              {loadingGuide ? <Loader2 className="w-5 h-5 animate-spin" /> : "Опубликовать"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}