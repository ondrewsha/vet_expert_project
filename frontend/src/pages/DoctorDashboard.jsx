import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../api/client';
import { BookOpen, UploadCloud, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function DoctorDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [snippet, setSnippet] = useState('');
  const [price, setPrice] = useState('');
  const [file, setFile] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const[success, setSuccess] = useState(false);

  // Защита роута (если вдруг зайдет обычный юзер)
  if (user?.role !== 'doctor' && user?.role !== 'superadmin') {
    return <div className="text-center py-20 text-red-500">Доступ запрещен</div>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Пожалуйста, выберите PDF файл.");
      return;
    }

    setLoading(true);
    
    // Для отправки файлов нужно использовать FormData
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
      
      setSuccess(true);
      // Очищаем форму
      setTitle(''); setDescription(''); setSnippet(''); setPrice(''); setFile(null);
      setTimeout(() => {
        setSuccess(false);
        navigate('/'); // Возвращаем на витрину
      }, 2000);
      
    } catch (err) {
      toast.error("Ошибка при загрузке гайда.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8 flex items-center gap-3">
        <BookOpen className="w-8 h-8 text-primary" />
        Опубликовать новый Гайд
      </h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Название и Цена */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Название гайда</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Уход за котенком" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary focus:border-primary outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₽)</label>
              <input type="number" required min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="500" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary focus:border-primary outline-none" />
            </div>
          </div>

          {/* Описание */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Полное описание (для витрины)</label>
            <textarea required rows="3" value={description} onChange={e => setDescription(e.target.value)} placeholder="О чем этот гайд? Кому он подойдет?" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary focus:border-primary outline-none resize-none"></textarea>
          </div>

          {/* Фрагмент */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Бесплатный фрагмент (Тизер)</label>
            <textarea rows="4" value={snippet} onChange={e => setSnippet(e.target.value)} placeholder="Вставьте сюда полезный кусок текста из гайда, чтобы привлечь покупателей..." className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-primary focus:border-primary outline-none resize-none bg-emerald-50/30"></textarea>
          </div>

          {/* Файл */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PDF Файл (Полная версия)</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer bg-gray-50 border-gray-300 hover:bg-gray-100 transition">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 font-medium">
                    {file ? file.name : "Нажмите для выбора файла (только PDF)"}
                  </p>
                </div>
                <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files[0])} />
              </label>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || success}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-emerald-600 transition disabled:opacity-50 shadow-md"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 
             success ? <CheckCircle className="w-6 h-6" /> : "Опубликовать гайд"}
          </button>

        </form>
      </div>
    </div>
  );
}