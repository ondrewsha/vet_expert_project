import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Clock, Info, Loader2, ArrowRight, UserPlus, Stethoscope } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

export default function Consultation() {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  const defaultDate = new Date(today.getTime() - offset).toISOString().split('T')[0];

  // Стейты
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState(null); // null = "Не важно к кому"
  
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [petInfo, setPetInfo] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  // 1. Загрузка списка врачей ПРИ СМЕНЕ ДАТЫ
  useEffect(() => {
    setLoadingDoctors(true);
    apiClient.get(`/appointments/doctors?target_date=${selectedDate}`)
      .then(res => {
        setDoctors(res.data);
        // Если выбранный ранее врач в этот день не работает - сбрасываем выбор
        if (selectedDoctorId && !res.data.find(d => d.id === selectedDoctorId)) {
            setSelectedDoctorId(null);
        }
      })
      .catch(err => console.error("Ошибка загрузки врачей", err))
      .finally(() => setLoadingDoctors(false));
  }, [selectedDate, selectedDoctorId]);

  // 2. Загрузка слотов при смене даты ИЛИ смене врача
  useEffect(() => {
    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        let url = `/appointments/available?target_date=${selectedDate}`;
        if (selectedDoctorId) {
          url += `&doctor_id=${selectedDoctorId}`;
        }
        const res = await apiClient.get(url);
        setSlots(res.data.available_slots);
      } catch (err) {
        console.error("Ошибка загрузки слотов:", err);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate, selectedDoctorId]);

  // Обработчики
  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedSlot(null);
  };

  const handleDoctorSelect = (docId) => {
    setSelectedDoctorId(docId);
    setSelectedSlot(null);
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const handleBook = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!selectedSlot) return;

    setIsBooking(true);
    try {
      const res = await apiClient.post('/appointments/book', {
        start_time: selectedSlot,
        pet_info: petInfo,
        doctor_id: selectedDoctorId
      });
      
      if (!res.data.payment_url) {
        toast.success("Запись успешно оформлена! Средства списаны с вашего баланса.");
        navigate('/profile');
      } else {
        window.location.assign(res.data.payment_url);
      }
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error("Извините, этот слот только что заняли. Выберите другое время.");
        setSelectedDate({...selectedDate}); 
      } else {
        toast.error("Ошибка при бронировании. Попробуйте позже.");
      }
      setIsBooking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Онлайн-консультация
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
          Получите квалифицированную помощь ветеринара, не выходя из дома.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* ЛЕВАЯ КОЛОНКА: Выбор врача и даты (Занимает 7 колонок) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Блок выбора врача */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              Специалист
            </h2>
            
            {loadingDoctors ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : doctors.length === 0 ? (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-center text-sm">
                    В выбранный день ({new Date(selectedDate).toLocaleDateString('ru-RU')}) нет принимающих специалистов. 
                    Пожалуйста, выберите другую дату в календаре ниже.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Карточка "Любой врач" */}
                  <div 
                    onClick={() => handleDoctorSelect(null)}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center text-center col-span-2 ${
                      selectedDoctorId === null 
                        ? 'border-primary bg-emerald-50' 
                        : 'border-gray-100 hover:border-emerald-200 bg-white'
                    }`}
                  >
                    <div className={`p-3 rounded-full mb-3 ${selectedDoctorId === null ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                      <UserPlus className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-gray-900">Ближайшее время</h3>
                    <p className="text-xs text-gray-500 mt-1">Не важно, к кому</p>
                  </div>

                  {/* Карточки конкретных врачей */}
                  {doctors.map(doc => (
                    <div 
                      key={doc.id}
                      onClick={() => handleDoctorSelect(doc.id)}
                      className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start gap-4 ${
                        selectedDoctorId === doc.id 
                          ? 'border-primary bg-emerald-50' 
                          : 'border-gray-100 hover:border-emerald-200 bg-white'
                      }`}
                    >
                      {doc.doctor_profile?.photo_url ? (
                        <img src={doc.doctor_profile.photo_url ? `/api/users/${doc.id}/photo` : null} alt={doc.full_name} className="w-14 h-14 rounded-full object-cover shadow-sm border border-gray-200" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gray-200 flex shrink-0 items-center justify-center text-gray-400 font-bold text-xl">
                          {doc.full_name ? doc.full_name[0].toUpperCase() : 'В'}
                        </div>
                      )}
                      
                      <div>
                        <h3 className="font-bold text-gray-900 leading-tight">{doc.full_name || 'Специалист'}</h3>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {doc.doctor_profile?.description || 'Ветеринарный врач'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>

          {/* Блок выбора даты и времени */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row gap-6">
              
              {/* Дата */}
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-primary" />
                  Дата
                </h2>
                <input 
                  type="date" 
                  min={new Date().toISOString().split('T')[0]} 
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition cursor-pointer bg-white"
                />
              </div>

              {/* Время */}
              <div className="flex-2">
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Время
                </h2>
                
                {loadingSlots || loadingDoctors ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : doctors.length === 0 ? (
                  // ИСПРАВЛЕНИЕ: Если врачей нет, явно пишем об этом и не даем выбрать слоты
                  <div className="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    В этот день приемов нет.
                  </div>
                ) : slots.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    Нет свободного времени.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-2 px-1 rounded-lg text-sm font-medium transition-all ${
                          selectedSlot === slot 
                            ? 'bg-primary text-white shadow-md' 
                            : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-primary hover:text-primary hover:bg-emerald-50'
                        }`}
                      >
                        {formatTime(slot)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: О питомце и Оплата (Занимает 5 колонок) */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col sticky top-24 h-fit">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            Данные пациента
          </h2>

          <div className="grow mb-6">
            {selectedSlot ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-sm border border-emerald-100">
                  Запись на: <b>{new Date(selectedDate).toLocaleDateString('ru-RU')} в {formatTime(selectedSlot)}</b>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Что беспокоит питомца? (Порода, возраст, симптомы)
                  </label>
                  <textarea
                    rows="6"
                    value={petInfo}
                    onChange={(e) => setPetInfo(e.target.value)}
                    placeholder="Например: Собака корги, 3 года. Второй день чешет ухо и трясет головой..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition resize-none"
                  ></textarea>
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-center px-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Сначала выберите специалиста и время приема
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-gray-100 mt-auto">
            <div className="flex justify-between items-end mb-4">
              <span className="text-gray-500 font-medium">К оплате:</span>
              <span className="text-3xl font-black text-gray-900 tracking-tight">2 000 ₽</span>
            </div>
            
            <button
              onClick={handleBook}
              disabled={!selectedSlot || isBooking}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isBooking ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  {user?.unused_consultations > 0 ? "Оплатить с баланса" : "Перейти к оплате"}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">
              Время бронируется на 15 минут. Вы будете перенаправлены на защищенную страницу оплаты.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}