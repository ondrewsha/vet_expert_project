import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { UserCircle, Download, Book, Loader2, Save, Check } from 'lucide-react';

export default function Profile() {
  const { user, checkAuth } = useAuthStore();
  const [guides, setGuides] = useState([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  
  // Состояния для редактирования имени
  const [name, setName] = useState(user?.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [saved, setSaved] = useState(false);

  // Загружаем купленные гайды
  useEffect(() => {
    apiClient.get('/users/me/guides')
      .then(res => setGuides(res.data))
      .catch(err => console.error("Ошибка загрузки купленных гайдов", err))
      .finally(() => setLoadingGuides(false));
  },[]);

  // Сохранение имени
  const handleSaveName = async () => {
    setSavingName(true);
    try {
      await apiClient.patch('/users/me', { full_name: name });
      await checkAuth(); // Обновляем данные в сторе
      setSaved(true);
      setTimeout(() => setSaved(false), 2000); // Прячем галочку через 2 сек
    } catch (error) {
      console.error("Ошибка сохранения имени", error);
    } finally {
      setSavingName(false);
    }
  };

  // Логика скачивания PDF
  const handleDownload = async (guide) => {
    try {
      // Запрашиваем файл как Blob (бинарные данные)
      const res = await apiClient.get(`/guides/${guide.id}/download`, {
        responseType: 'blob' 
      });
      
      // Создаем временную ссылку в браузере и кликаем по ней
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${guide.title}.pdf`); // Имя файла при скачивании
      document.body.appendChild(link);
      link.click();
      
      // Убираем мусор
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert("Не удалось скачать файл. Попробуйте позже.");
      console.error("Ошибка скачивания файла", error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Личный кабинет</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
            <UserCircle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Мои данные</h2>
            <p className="text-gray-500 text-sm">Телефон: {user?.phone}</p>
          </div>
        </div>

        {/* Форма имени */}
        <div className="max-w-md flex gap-3">
          <input
            type="text"
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
          <button
            onClick={handleSaveName}
            disabled={savingName || name === user?.full_name}
            className="bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {savingName ? <Loader2 className="w-5 h-5 animate-spin" /> : 
             saved ? <Check className="w-5 h-5 text-emerald-400" /> : <Save className="w-5 h-5" />}
            <span>Сохранить</span>
          </button>
        </div>
      </div>

      {/* Мои гайды */}
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Купленные гайды</h2>
      
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