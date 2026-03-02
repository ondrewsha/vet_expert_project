import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, KeyRound, Bot, ArrowRight, Loader2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const [step, setStep] = useState(1); // 1 - ввод телефона, 2 - ввод кода
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needBotReg, setNeedBotReg] = useState(false); // Нужно ли идти в бота
  const [agreed, setAgreed] = useState(false);

  const loginUser = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  // Шаг 1: Отправка телефона
  const handleSendCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNeedBotReg(false);

    try {
      // Форматируем телефон: заменяем 8 на +7, удаляем пробелы
      let formattedPhone = phone.replace(/\s+/g, '');
      if (formattedPhone.startsWith('8')) {
        formattedPhone = '+7' + formattedPhone.slice(1);
      } else if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }
      setPhone(formattedPhone);

      const res = await apiClient.post('/auth/send-code', { phone: formattedPhone });
      
      // Смотрим, что ответил бэкенд
      if (res.data.dev_info.includes("Смотри консоль")) {
        // Значит юзер новый, ТГ нет
        setNeedBotReg(true);
      } else {
        // Код ушел в телеграм!
        setStep(2);
      }
    } catch (err) {
      setError('Ошибка при отправке кода. Проверьте номер.');
      console.error("Ошибка при отправке кода", err);
    } finally {
      setLoading(false);
    }
  };

  // Шаг 2: Проверка кода
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await apiClient.post('/auth/verify-code', { phone, code });
      await loginUser(res.data.access_token);
      navigate('/profile'); // После входа кидаем в ЛК
    } catch (err) {
      setError('Неверный код. Попробуйте еще раз.');
      console.error("Ошибка при проверке кода", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg space-y-8">
        
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Вход в ВетЭксперт
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {step === 1 ? 'Введите номер телефона для получения кода' : 'Код отправлен в наш Telegram бот'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {/* --- ШАГ 1: ТЕЛЕФОН --- */}
        {step === 1 && (
          <form className="mt-8 space-y-6" onSubmit={handleSendCode}>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="tel"
                required
                className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                placeholder="+7 (999) 000-00-00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {/* ЮРИДИЧЕСКАЯ ГАЛОЧКА */}
            <div className="flex items-start gap-3 mt-4">
              <input
                type="checkbox"
                id="terms"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary"
              />
              <label htmlFor="terms" className="text-xs text-gray-500">
                Я соглашаюсь с{' '}
                <a href="/terms" target="_blank" className="text-primary hover:underline">Пользовательским соглашением</a>
                {' '}и{' '}
                <a href="/privacy" target="_blank" className="text-primary hover:underline">Политикой обработки персональных данных</a>.
              </label>
            </div>

            {needBotReg && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 flex flex-col items-center text-center space-y-3">
                <Bot className="w-8 h-8 text-blue-600" />
                <p>
                  Похоже, вы у нас впервые! Чтобы мы могли отправлять вам коды входа и напоминания, пожалуйста, <b>зарегистрируйтесь через нашего бота</b>.
                </p>
                <a
                  href="https://t.me/VetExpert_TestBot"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium transition"
                >
                  Перейти в Telegram
                </a>
                <p className="text-xs text-blue-600 mt-2">
                  После регистрации в боте нажмите кнопку ниже.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !agreed}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-white bg-primary hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary font-medium transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Получить код'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>
        )}

        {/* --- ШАГ 2: КОД --- */}
        {step === 2 && (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyCode}>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                required
                className="w-full pl-10 pr-3 py-3 text-center tracking-widest text-xl border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                placeholder="0000"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} // Только цифры
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 4}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-white bg-primary hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary font-medium transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Войти'}
            </button>
            
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-sm text-gray-500 hover:text-gray-900"
            >
              Изменить номер телефона
            </button>
          </form>
        )}
      </div>
    </div>
  );
}