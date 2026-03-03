import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { BookOpen, UploadCloud, Loader2, Calendar, Clock, Lock, CheckSquare, Settings, Save, Edit3, X, Image as ImageIcon, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function DoctorDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('schedule'); 

  // --- ЛИМИТЫ ДЛЯ ГАЙДОВ ---
  const MAX_DESC_LEN = 500;
  const MAX_SNIPPET_LEN = 500;

  // --- Стейты Гайда ---
  const [myGuides, setMyGuides] = useState([]); 
  const [editingGuideId, setEditingGuideId] = useState(null); 
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [snippet, setSnippet] = useState('');
  const [price, setPrice] = useState('');
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  
  // Для отображения уже загруженных файлов при редактировании
  const [existingCoverUrl, setExistingCoverUrl] = useState(null);
  const [existingPdf, setExistingPdf] = useState(false);
  const [existingPdfName, setExistingPdfName] = useState(null);
  
  const [loadingGuide, setLoadingGuide] = useState(false);

  // --- Стейты Умного Расписания ---
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  const defaultDate = new Date(today.getTime() - offset).toISOString().split('T')[0];
  
  const [scheduleDate, setScheduleDate] = useState(defaultDate);
  const [scheduleSlots, setScheduleSlots] = useState([]); 
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const[savingSchedule, setSavingSchedule] = useState(false);
  
  const [toBlock, setToBlock] = useState([]);
  const [toUnblock, setToUnblock] = useState([]);

  // --- Стейты Настроек Врача ---
  const [workDays, setWorkDays] = useState([0, 1, 2, 3, 4, 5, 6]); 
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // --- ЭФФЕКТЫ ---
  useEffect(() => {
    if (user?.role !== 'doctor' && user?.role !== 'superadmin') return;

    if (activeTab === 'guides') {
      apiClient.get('/guides').then(res => {
          const mine = res.data.filter(g => user.role === 'superadmin' || g.author_id === user.id);
          setMyGuides(mine);
      });
    }

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
              console.error("Ошибка загрузки расписания", e);
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
              const res = await apiClient.get('/users/me');
              const docProfile = res.data.doctor_profile;
              if (docProfile && docProfile.work_days) {
                  setWorkDays(docProfile.work_days.split(',').map(Number));
              }
            } catch (e) {
              toast.error("Ошибка загрузки настроек");
              console.error("Ошибка загрузки настроек", e);
            } finally { 
              setLoadingSettings(false); 
            }
          };
          fetchSettings();
    }
  }, [scheduleDate, activeTab, user]);

  // Защита роута
  if (user?.role !== 'doctor' && user?.role !== 'superadmin') {
    return <div className="text-center py-20 text-red-500 font-bold">Доступ запрещен</div>;
  }

  // --- ЛОГИКА РАСПИСАНИЯ ---
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
      console.error("Ошибка при сохранении расписания", e);
    } finally {
      setSavingSchedule(false);
    }
  };

  const renderSlot = (slot) => {
    const isPendingBlock = toBlock.includes(slot.time);
    const isPendingUnblock = toUnblock.includes(slot.time);
    
    let visualState = slot.state;
    if (isPendingBlock) visualState = 'blocked_preview';
    if (isPendingUnblock) visualState = 'free_preview';

    let bgClass = "bg-gray-50 border-gray-200 text-gray-700"; 
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

  // --- ЛОГИКА НАСТРОЕК ---
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
          console.error("Ошибка сохранения настроек", e);
      } finally {
          setSavingSettings(false);
      }
  };

  // --- ЛОГИКА ГАЙДОВ ---
  const startEditing = (guide) => {
      setEditingGuideId(guide.id);
      setTitle(guide.title);
      setDescription(guide.description || '');
      setSnippet(guide.free_snippet || '');
      setPrice(guide.price);
      setFile(null); 
      setCover(null);
      // Подтягиваем инфу о существующих файлах
      setExistingCoverUrl(guide.cover_image_id ? `/api/guides/${guide.id}/cover` : null);
      setExistingPdf(!!guide.mongo_file_id);
      setExistingPdfName(guide.pdf_filename || null);
  };

  const cancelEditing = () => {
      setEditingGuideId(null);
      setTitle(''); setDescription(''); setSnippet(''); setPrice(''); setFile(null); setCover(null);
      setExistingCoverUrl(null); setExistingPdf(false);
  };

  const handleGuideSubmit = async (e) => {
    e.preventDefault();
    if (!editingGuideId && !file) return toast.error("Для нового гайда обязательно выберите PDF файл");

    setLoadingGuide(true);
    const formData = new FormData();
    if (title) formData.append('title', title);
    if (description) formData.append('description', description);
    if (snippet) formData.append('free_snippet', snippet);
    if (price) formData.append('price', price);
    if (file) formData.append('file', file);
    if (cover) formData.append('cover', cover); 

    try {
      if (editingGuideId) {
          await apiClient.patch(`/guides/${editingGuideId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          toast.success("Гайд успешно обновлен!");
      } else {
          await apiClient.post('/guides', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          toast.success("Новый гайд опубликован!");
      }
      
      cancelEditing();
      const res = await apiClient.get('/guides');
      setMyGuides(res.data.filter(g => user.role === 'superadmin' || g.author_id === user.id));

    } catch (err) {
      toast.error("Ошибка при сохранении гайда");
      console.error("Ошибка при сохранении гайда", err);
    } finally {
      setLoadingGuide(false);
    }
  };

  // Вспомогательная функция для цвета счетчиков
  const getCounterColor = (current, max) => {
    if (current >= max) return 'text-red-500 font-bold';
    if (current >= max * 0.9) return 'text-amber-500 font-bold';
    return 'text-gray-400';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Панель специалиста</h1>

      {/* ТАБЫ */}
      <div className="flex flex-wrap gap-2 bg-gray-100 p-1 rounded-xl mb-8 w-fit">
        <button onClick={() => setActiveTab('schedule')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          <Calendar className="w-4 h-4"/> Расписание (Блокировки)
        </button>
        <button onClick={() => setActiveTab('settings')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          <Settings className="w-4 h-4"/> Настройки графика
        </button>
        <button onClick={() => setActiveTab('guides')} className={`px-5 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${activeTab === 'guides' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          <BookOpen className="w-4 h-4"/> Управление гайдами
        </button>
      </div>

      {/* --- ВКЛАДКА 1: РАСПИСАНИЕ --- */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Управление слотами</h2>
              <p className="text-sm text-gray-500">Кликайте на слоты, чтобы заблокировать или разблокировать их.</p>
            </div>
            <div className="flex items-center gap-4">
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-primary outline-none cursor-pointer" />
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
                    Для блокировки: <span className="text-red-600 font-bold">{toBlock.length}</span> | 
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

      {/* --- ВКЛАДКА 2: НАСТРОЙКИ --- */}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
            
            {/* СПИСОК МОИХ ГАЙДОВ */}
            <div className="lg:col-span-1 space-y-4">
                <h2 className="text-xl font-bold mb-4">Мои гайды</h2>
                <button onClick={cancelEditing} className={`w-full py-3 rounded-xl border-2 border-dashed font-medium transition ${!editingGuideId ? 'border-primary bg-emerald-50 text-primary' : 'border-gray-300 text-gray-500 hover:border-primary hover:text-primary'}`}>
                    + Создать новый
                </button>
                
                {myGuides.map(g => (
                    <div key={g.id} className={`p-4 rounded-xl border-2 transition ${editingGuideId === g.id ? 'border-primary bg-white shadow-md' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
                        <div className="font-bold text-gray-900 mb-1 leading-tight">{g.title}</div>
                        <div className="text-sm text-gray-500 mb-3">{g.price} ₽</div>
                        <button onClick={() => startEditing(g)} className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-lg w-fit">
                            <Edit3 className="w-4 h-4" /> Редактировать
                        </button>
                    </div>
                ))}
            </div>

            {/* ФОРМА СОЗДАНИЯ / РЕДАКТИРОВАНИЯ */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 relative">
                {editingGuideId && (
                    <button onClick={cancelEditing} className="absolute top-6 right-6 text-gray-400 hover:text-red-500 bg-gray-100 rounded-full p-1 transition" title="Отменить редактирование">
                        <X className="w-5 h-5" />
                    </button>
                )}
                
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    {editingGuideId ? <><Edit3 className="w-5 h-5 text-blue-500"/> Редактирование гайда</> : <><UploadCloud className="w-5 h-5 text-primary"/> Новый гайд</>}
                </h2>

                <form onSubmit={handleGuideSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none transition" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₽)</label>
                            <input type="number" required min="0" value={price} onChange={e => setPrice(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none transition" />
                        </div>
                    </div>
                    
                    {/* Описание с лимитом */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                        <textarea required rows="4" maxLength={MAX_DESC_LEN} value={description} onChange={e => setDescription(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none resize-none transition"></textarea>
                        <div className={`text-right text-xs mt-1 ${getCounterColor(description.length, MAX_DESC_LEN)}`}>
                            {description.length} / {MAX_DESC_LEN}
                        </div>
                    </div>
                    
                    {/* Фрагмент с лимитом */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Фрагмент (Тизер)</label>
                        <textarea rows="3" maxLength={MAX_SNIPPET_LEN} value={snippet} onChange={e => setSnippet(e.target.value)} placeholder="Для предпросмотра на странице гайда..." className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none resize-none bg-emerald-50/30 transition"></textarea>
                        <div className={`text-right text-xs mt-1 ${getCounterColor(snippet.length, MAX_SNIPPET_LEN)}`}>
                            {snippet.length} / {MAX_SNIPPET_LEN}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
                        {/* ФАЙЛ PDF */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Полная версия (PDF) {editingGuideId && <span className="text-xs text-amber-500 font-normal ml-2">Опционально</span>}
                            </label>
                            <label className={`relative flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition overflow-hidden ${file || existingPdf ? 'border-primary bg-emerald-50' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                                {file ? (
                                    <div className="flex flex-col items-center p-2 text-center z-10">
                                        <UploadCloud className="w-6 h-6 mb-1 text-primary" />
                                        <p className="text-xs font-medium text-gray-700 truncate w-full px-2">{file.name}</p>
                                    </div>
                                ) : existingPdf ? (
                                    <div className="flex flex-col items-center p-2 text-center z-10">
                                        <CheckCircle className="w-6 h-6 mb-1 text-primary" />
                                        <p className="text-xs font-bold text-emerald-800 line-clamp-1 w-full px-2">{existingPdfName}</p>
                                        <p className="text-xs font-bold text-emerald-800">PDF загружен</p>
                                        <p className="text-[10px] text-emerald-600 mt-1">Нажмите для замены</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center p-2 text-center z-10">
                                        <UploadCloud className="w-6 h-6 mb-1 text-gray-400" />
                                        <p className="text-xs font-medium text-gray-500">Выбрать PDF</p>
                                    </div>
                                )}
                                <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files[0])} />
                            </label>
                        </div>

                        {/* ОБЛОЖКА JPG/PNG */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Обложка (Картинка) {editingGuideId && <span className="text-xs text-amber-500 font-normal ml-2">Опционально</span>}
                            </label>
                            <label className={`relative flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition overflow-hidden ${cover || existingCoverUrl ? 'border-blue-400 bg-blue-50' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                                {cover ? (
                                    <div className="flex flex-col items-center z-10 p-2 text-center">
                                        <ImageIcon className="w-6 h-6 mb-1 text-blue-500" />
                                        <p className="text-xs font-medium text-gray-700 truncate w-full px-2">{cover.name}</p>
                                    </div>
                                ) : existingCoverUrl ? (
                                    <>
                                        <img src={existingCoverUrl} className="absolute inset-0 w-full h-full object-cover opacity-30" alt="Cover preview" />
                                        <div className="flex flex-col items-center z-10 p-2 text-center">
                                            <ImageIcon className="w-6 h-6 mb-1 text-blue-600" />
                                            <p className="text-xs font-bold text-blue-800 bg-white/70 px-2 py-1 rounded">Текущая обложка</p>
                                            <p className="text-[10px] text-blue-700 mt-1 bg-white/70 px-2 rounded">Нажмите для замены</p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center p-2 text-center z-10">
                                        <ImageIcon className="w-6 h-6 mb-1 text-gray-400" />
                                        <p className="text-xs font-medium text-gray-500">Загрузить фото</p>
                                    </div>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={e => setCover(e.target.files[0])} />
                            </label>
                        </div>
                    </div>

                    <button type="submit" disabled={loadingGuide} className={`w-full text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition mt-4 disabled:opacity-50 ${editingGuideId ? 'bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20' : 'bg-primary hover:bg-emerald-600 shadow-md shadow-emerald-500/20'}`}>
                        {loadingGuide ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingGuideId ? "Сохранить изменения" : "Опубликовать гайд")}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}