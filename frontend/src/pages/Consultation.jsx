import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Clock, Info, Loader2, ArrowRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Consultation() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  const defaultDate = new Date(today.getTime() - offset).toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [petInfo, setPetInfo] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  // При изменении даты - запрашиваем свободные слоты у бэкенда
  useEffect(() => {
    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const res = await apiClient.get(`/appointments/available?target_date=${selectedDate}`);
        setSlots(res.data.available_slots);
      } catch (err) {
        console.error("Ошибка загрузки слотов:", err);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate]);

  // Функция для обработки смены даты
  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedSlot(null); // Сбрасываем слот здесь, а не в useEffect
  };

  // Форматирование времени (из 2026-03-01T10:00:00 в 10:00)
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  // Бронирование слота
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
        pet_info: petInfo
      });
      
      // ЕСЛИ ОПЛАТА С БАЛАНСА
      if (!res.data.payment_url) {
        alert("Запись успешно оформлена! Средства списаны с вашего баланса.");
        navigate('/profile');
      } else {
        // Идем в ЮKassa
        window.location.assign(res.data.payment_url);
      }
    } catch (error) {
      if (error.response?.status === 409) {
        alert("Извините, этот слот только что заняли. Выберите другое время.");
        setSelectedDate({...selectedDate}); 
      } else {
        alert("Ошибка при бронировании. Попробуйте позже.");
      }
      setIsBooking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      
      <div className="text-center mb-12">
        <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Онлайн-консультация
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          Выберите удобное время для видеозвонка с ведущим терапевтом.
        </p>
      </div>

      <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden flex flex-col md:flex-row">
        
        {/* ЛЕВАЯ ЧАСТЬ: Выбор даты и времени */}
        <div className="p-8 md:w-1/2 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            Выберите дату
          </h2>
          
          <input 
            type="date" 
            min={new Date().toISOString().split('T')[0]} // Нельзя выбрать прошлое
            value={selectedDate}
            onChange={handleDateChange}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition bg-white cursor-pointer"
          />

          <h2 className="text-xl font-bold text-gray-900 mt-10 mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Доступное время
          </h2>

          {loadingSlots ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : slots.length === 0 ? (
            <div className="text-gray-500 text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
              На этот день нет свободного времени. Выберите другую дату.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {slots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className={`py-2 rounded-lg font-medium transition-all ${
                    selectedSlot === slot 
                      ? 'bg-primary text-white shadow-md' 
                      : 'bg-white border border-gray-200 text-gray-700 hover:border-primary hover:text-primary'
                  }`}
                >
                  {formatTime(slot)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ПРАВАЯ ЧАСТЬ: Данные питомца и оплата */}
        <div className="p-8 md:w-1/2 bg-white flex flex-col">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            О питомце
          </h2>

          <div className="grow">
            {selectedSlot ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-sm border border-emerald-100">
                  Выбрано время: <b>{new Date(selectedDate).toLocaleDateString('ru-RU')} в {formatTime(selectedSlot)}</b>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Кратко опишите проблему, возраст и породу
                  </label>
                  <textarea
                    rows="5"
                    value={petInfo}
                    onChange={(e) => setPetInfo(e.target.value)}
                    placeholder="Например: Кот Мурзик, 5 лет. Третий день отказывается от еды..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition resize-none"
                  ></textarea>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-center px-6">
                Сначала выберите время слева, чтобы заполнить данные о питомце
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <span className="text-gray-600 font-medium">Стоимость приема:</span>
              <span className="text-2xl font-extrabold text-gray-900">2 000 ₽</span>
            </div>
            
            <button
              onClick={handleBook}
              disabled={!selectedSlot || isBooking}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
              Безопасная оплата картой или СБП. Слот бронируется на 15 минут.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}