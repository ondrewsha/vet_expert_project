import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Users, DollarSign, Activity, UserPlus, Power, Trash2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { formatPhone } from '../lib/utils';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Добавление врача
  const [newDocPhone, setNewDocPhone] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  const worksDaysMap = {
    0: 'Пн',
    1: 'Вт',
    2: 'Ср',
    3: 'Чт',
    4: 'Пт',
    5: 'Сб',
    6: 'Вс'
  };

  useEffect(() => {
    if (user?.role !== 'superadmin') return;
    
    Promise.all([
      apiClient.get('/superadmin/stats'),
      apiClient.get('/superadmin/doctors')
    ]).then(([statsRes, docRes]) => {
      setStats(statsRes.data);
      setDoctors(docRes.data);
    }).catch(() => toast.error("Ошибка загрузки данных"))
      .finally(() => setLoading(false));
  }, [user]);

  if (user?.role !== 'superadmin') return <div className="p-10 text-center text-red-500">Доступ запрещен</div>;
  if (loading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;

  const handleAddDoctor = async (e) => {
    e.preventDefault();
    setAddingDoc(true);
    try {
        await apiClient.post('/superadmin/doctors', { 
            phone: newDocPhone.replace(/[^\d+]/g, ''), 
            full_name: newDocName 
        });
        toast.success("Врач добавлен!");
        setNewDocPhone(''); setNewDocName('');
        // Обновляем список
        const res = await apiClient.get('/superadmin/doctors');
        setDoctors(res.data);
    } catch (e) {
        toast.error("Ошибка добавления врача");
        console.error(e);
    } finally {
        setAddingDoc(false);
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
      <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Административная панель</h1>

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
                    <div key={doc.id} className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-gray-300 transition">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${doc.doctor_profile?.is_active !== false ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                                {doc.full_name?.[0] || "D"}
                            </div>
                            <div>
                                <div className="font-bold text-gray-900">{doc.full_name}</div>
                                <div className="text-xs text-gray-500">
                                    {doc.doctor_profile?.work_days.split(',').map(day => worksDaysMap[day]).join(', ')}
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => toggleDoctor(doc.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                doc.doctor_profile?.is_active !== false 
                                ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                        >
                            <Power className="w-4 h-4" />
                            {doc.doctor_profile?.is_active !== false ? 'Отключить' : 'Включить'}
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* ДОБАВИТЬ ВРАЧА */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 h-fit">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <UserPlus className="w-5 h-5" /> Добавить врача
            </h2>
            <form onSubmit={handleAddDoctor} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ФИО</label>
                    <input required type="text" value={newDocName} onChange={e => setNewDocName(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary" placeholder="Иванов Иван" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                    <input required type="tel" value={formatPhone(newDocPhone)} onChange={e => setNewDocPhone(e.target.value)} className="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-primary" placeholder="+7..." />
                </div>
                <button disabled={addingDoc} className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition flex justify-center">
                    {addingDoc ? <Loader2 className="animate-spin"/> : "Добавить"}
                </button>
            </form>
        </div>

      </div>
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