import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Users, DollarSign, Activity, UserPlus, Power, Loader2, CheckCircle, RefreshCcw, Image as ImageIcon, Edit, X, Star } from 'lucide-react';
import { formatPhone } from '../lib/utils';
import { toast } from 'sonner';
import Modal from '../components/Modal';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Состояния Формы
  const [editingId, setEditingId] = useState(null); // Если null - режим создания
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [yandexEmail, setYandexEmail] = useState('');
  const [yandexPass, setYandexPass] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState(null); // Фото
  const [existingPhoto, setExistingPhoto] = useState(null);

  const [selectedDocStats, setSelectedDocStats] = useState(null);
  
  const [processing, setProcessing] = useState(false);

  const worksDaysMap = {0: 'Пн', 1: 'Вт', 2: 'Ср', 3: 'Чт', 4: 'Пт', 5: 'Сб', 6: 'Вс'};

  const fetchData = () => {
    Promise.all([
      apiClient.get('/superadmin/stats'),
      apiClient.get('/superadmin/doctors')
    ]).then(([statsRes, docRes]) => {
      setStats(statsRes.data);
      setDoctors(docRes.data);
    }).catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false));
  };

  const fetchDocStats = async (id) => {
    try {
        const res = await apiClient.get(`/superadmin/doctors/${id}/stats`);
        setSelectedDocStats(res.data);
    } catch(e) {
        toast.error("Не удалось получить статистику врача");
        console.error(e);
    }
  };

  useEffect(() => {
    if (user?.role === 'superadmin') fetchData();
  }, [user]);

  if (user?.role !== 'superadmin') return <div className="p-10 text-center text-red-500">Доступ запрещен</div>;
  if (loading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;

  // Заполнить форму для редактирования
  const startEdit = (doc) => {
    setEditingId(doc.id);
    setName(doc.full_name || '');
    setPhone(doc.phone || '');
    setDesc(doc.doctor_profile?.description || '');
    setYandexEmail(doc.doctor_profile?.yandex_email || '');
    setYandexPass(doc.doctor_profile?.yandex_password || ''); // Пароль лучше не светить, но для удобства оставим
    setLink(doc.doctor_profile?.telemost_link || '');
    setExistingPhoto(doc.doctor_profile?.photo_url ? `/api/users/${doc.id}/photo` : null);
    setFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName(''); setPhone(''); setDesc(''); setYandexEmail(''); setYandexPass(''); setLink(''); setFile(null);
    setExistingPhoto(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    
    const formData = new FormData();
    formData.append('phone', phone.replace(/[^\d+]/g, ''));
    formData.append('full_name', name);
    if (desc) formData.append('description', desc);
    if (yandexEmail) formData.append('yandex_email', yandexEmail);
    if (yandexPass) formData.append('yandex_password', yandexPass);
    if (link) formData.append('telemost_link', link);
    if (file) formData.append('file', file);

    try {
        if (editingId) {
            await apiClient.patch(`/superadmin/doctors/${editingId}`, formData);
            toast.success("Врач обновлен");
        } else {
            await apiClient.post('/superadmin/doctors', formData);
            toast.success("Врач создан");
        }
        cancelEdit();
        fetchData();
    } catch (e) {
        toast.error("Ошибка сохранения");
        console.error(e);
    } finally {
        setProcessing(false);
    }
  };

  const toggleDoctor = async (id) => {
      try {
          const res = await apiClient.patch(`/superadmin/doctors/${id}/toggle`);
          setDoctors(prev => prev.map(d => d.id === id ? {...d, doctor_profile: {...d.doctor_profile, is_active: res.data.is_active}} : d));
          toast.success("Статус обновлен");
      } catch (e) {
          toast.error("Ошибка обновления статуса");
          console.error(e);
      }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">Админ Панель</h1>
        <button onClick={fetchData} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"><RefreshCcw className="w-5 h-5 text-gray-600" /></button>
      </div>

      {/* СТАТИСТИКА */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <StatCard icon={<Users className="text-blue-500"/>} label="Пользователей" value={stats.total_users} />
        <StatCard icon={<Activity className="text-purple-500"/>} label="Врачей" value={stats.total_doctors} />
        <StatCard icon={<CheckCircle className="text-emerald-500"/>} label="Успешных приемов" value={stats.total_appointments} />
        <StatCard icon={<DollarSign className="text-amber-500"/>} label="Доход (примерно)" value={`${stats.total_income} ₽`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* СПИСОК ВРАЧЕЙ */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-xl font-bold mb-6">Управление врачами</h2>
            <div className="space-y-4">
                {doctors.map(doc => (
                    <div key={doc.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl transition gap-4 ${editingId === doc.id ? 'border-primary bg-emerald-50' : 'border-gray-100 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-4">
                            {doc.doctor_profile?.photo_url ? (
                                <img src={`/api/users/${doc.id}/photo`} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                            ) : (
                                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-gray-400">
                                    {doc.full_name?.[0]}
                                </div>
                            )}
                            <div>
                                <div className="font-bold text-gray-900">{doc.full_name}</div>
                                
                                <div className="flex items-center gap-2 mt-1">
                                    {/* БЛОК РЕЙТИНГА */}
                                    <div className="flex items-center gap-1 text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-md">
                                        <Star className="w-3 h-3 fill-current" />
                                        {doc.average_rating ? Number(doc.average_rating).toFixed(1) : "Нет оценок"}
                                    </div>
                                    
                                    {/* БЛОК ГРАФИКА */}
                                    <div className="text-xs text-gray-400">
                                        {doc.doctor_profile?.work_days ? doc.doctor_profile.work_days.split(',').map(d => worksDaysMap[d]).join(', ') : "График не настроен"}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-xs text-gray-400 hidden sm:block truncate max-w-37.5">
                                {doc.doctor_profile?.description || "Нет описания"}
                            </div>
                            <button onClick={() => startEdit(doc)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => toggleDoctor(doc.id)} className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
                                    doc.doctor_profile?.is_active 
                                    ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                                    : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                }`}>
                                <Power className="w-4 h-4" />
                                <span>{doc.doctor_profile?.is_active ? "Откл" : "Вкл"}</span>
                            </button>
                            <button 
                                onClick={() => fetchDocStats(doc.id)} 
                                className="p-2 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100"
                                title="Статистика за месяц"
                            >
                                <DollarSign className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* ФОРМА (СОЗДАНИЕ / РЕДАКТИРОВАНИЕ) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 h-fit relative">
            {editingId && (
                <button onClick={cancelEdit} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><X className="w-5 h-5"/></button>
            )}
            
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <UserPlus className="w-5 h-5" /> {editingId ? "Редактирование" : "Добавить врача"}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Основное</label>
                    <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary mb-3" placeholder="ФИО" />
                    <input required type="tel" value={formatPhone(phone)} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary" placeholder="Телефон" />
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Профиль</label>
                    <textarea rows="2" value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary resize-none mb-3" placeholder="Описание, регалии..." />
                    <input type="text" value={link} onChange={e => setLink(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary mb-3" placeholder="Ссылка на Телемост" />
                    
                    <label className={`relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition overflow-hidden ${file || existingPhoto ? 'border-blue-400 bg-blue-50' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                        {file ? (
                            <div className="flex flex-col items-center z-10 p-2 text-center">
                                <ImageIcon className="w-6 h-6 mb-1 text-blue-500" />
                                <p className="text-xs font-medium text-gray-700 truncate w-full px-2">{file.name}</p>
                                <p className="text-[10px] text-blue-600 mt-1">Новое фото выбрано</p>
                            </div>
                        ) : existingPhoto ? (
                            <>
                                <img src={existingPhoto} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="Avatar preview" />
                                <div className="flex flex-col items-center z-10 p-2 text-center bg-white/80 rounded-lg backdrop-blur-sm shadow-sm">
                                    <ImageIcon className="w-5 h-5 mb-1 text-blue-600" />
                                    <p className="text-xs font-bold text-blue-900">Текущее фото</p>
                                    <p className="text-[10px] text-blue-700">Нажмите для замены</p>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center p-2 text-center z-10">
                                <ImageIcon className="w-6 h-6 mb-1 text-gray-400" />
                                <p className="text-xs font-medium text-gray-500">Загрузить фото</p>
                            </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files[0])} />
                    </label>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Интеграция Яндекс</label>
                    <input type="email" value={yandexEmail} onChange={e => setYandexEmail(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary mb-3" placeholder="email@yandex.ru" />
                    <input type="password" value={yandexPass} onChange={e => setYandexPass(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary" placeholder="Пароль приложений" />
                </div>

                <button disabled={processing} className={`w-full text-white py-3 rounded-xl font-bold transition flex justify-center mt-4 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-gray-800'}`}>
                    {processing ? <Loader2 className="animate-spin"/> : (editingId ? "Сохранить" : "Добавить")}
                </button>
            </form>
        </div>

      </div>

      <Modal 
        isOpen={!!selectedDocStats} 
        onClose={() => setSelectedDocStats(null)} 
        title={`Статистика: ${selectedDocStats?.doctor_name}`}
      >
        {selectedDocStats && (
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-xl flex justify-between items-center">
                    <span className="text-gray-600">Приемов в этом месяце:</span>
                    <span className="font-bold text-lg">{selectedDocStats.total_appointments}</span>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl flex justify-between items-center border border-emerald-100">
                    <span className="text-emerald-800 font-medium">Заработано (за месяц):</span>
                    <span className="font-black text-xl text-emerald-900">{selectedDocStats.total_income} ₽</span>
                </div>
                <p className="text-xs text-gray-400 text-center">Расчет произведен по ставке 1490 ₽ / прием * 0,9</p>
            </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ icon, label, value }) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-gray-50 rounded-full">{icon}</div>
            <div>
                <div className="text-2xl font-black text-gray-900">{value}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider font-bold">{label}</div>
            </div>
        </div>
    )
}