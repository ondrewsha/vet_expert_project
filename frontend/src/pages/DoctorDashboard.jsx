import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { BookOpen, UploadCloud, Loader2, CheckCircle, Calendar, Clock, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function DoctorDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('guides'); // 'guides' | 'schedule'

  // --- Стейты Гайда ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [snippet, setSnippet] = useState('');
  const [price, setPrice] = useState('');
  const [file, setFile] = useState(null);
  const [loadingGuide, setLoadingGuide] = useState(false);

  // --- Стейты Блокировки ---
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  const defaultDate = new Date(today.getTime() - offset).toISOString().split('T')[0];
  
  const [blockDate, setBlockDate] = useState(defaultDate);
  const [blockTime, setBlockTime] = useState('10:00');
  const [loadingBlock, setLoadingBlock] = useState(false);

  if (user?.role !== 'doctor' && user?.role !== 'superadmin') {
    return <div className="text-center py-20 text-red-500 font-bold">Доступ запрещен</div>;
  }

  // Публикация гайда
  const handleGuideSubmit = async (e) => {
    e.preventDefault();
    if (!file) return toast.error("Выберите PDF файл");

    setLoadingGuide(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('free_snippet', snippet);
    formData.append('price', price);
    formData.append('file', file);

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

  // Блокировка слота
  const handleBlockSlot = async (e) => {
    e.preventDefault();
    setLoadingBlock(true);
    
    // Собираем дату и время в ISO
    const dateTimeString = `${blockDate}T${blockTime}:00`;
    
    try {
      await apiClient.post('/appointments/block-slot', {
        start_time: dateTimeString,
        duration_minutes: 60 // Блокируем на час
      });
      toast.success(`Время ${blockTime} заблокировано!`);
    } catch (error) {
      toast.error("Ошибка блокировки. Возможно, слот уже занят.");
      console.error(error);
    } finally {
      setLoadingBlock(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Панель управления врача</h1>

      {/* ТАБЫ */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl mb-8 w-fit">
        <button
          onClick={() => setActiveTab('guides')}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'guides' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2"><BookOpen className="w-4 h-4"/> Публикация гайдов</div>
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition ${
            activeTab === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2"><Calendar className="w-4 h-4"/> Мое расписание</div>
        </button>
      </div>

      {/* --- ВКЛАДКА 1: ГАЙДЫ --- */}
      {activeTab === 'guides' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in">
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

      {/* --- ВКЛАДКА 2: РАСПИСАНИЕ (БЛОКИРОВКА) --- */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-in fade-in">
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-red-50 p-3 rounded-full text-red-500">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Заблокировать время</h2>
              <p className="text-gray-500 text-sm">
                Выберите дату и время, когда вы не сможете принимать пациентов. 
                Это время исчезнет из доступных слотов на сайте.
              </p>
            </div>
          </div>

          <form onSubmit={handleBlockSlot} className="max-w-md space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="date" 
                  required 
                  value={blockDate} 
                  onChange={e => setBlockDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Время начала (на 1 час)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select 
                  value={blockTime}
                  onChange={e => setBlockTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-primary outline-none bg-white appearance-none"
                >
                  {Array.from({ length: 9 }).map((_, i) => {
                    const hour = 10 + i; // c 10 до 18
                    const time = `${hour}:00`;
                    return <option key={time} value={time}>{time}</option>;
                  })}
                </select>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loadingBlock}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition disabled:opacity-50"
            >
              {loadingBlock ? <Loader2 className="w-5 h-5 animate-spin" /> : "Заблокировать слот"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}