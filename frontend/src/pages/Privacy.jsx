import { ShieldCheck, Database, Lock } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Политика конфиденциальности</h1>
        <p className="mt-2 text-gray-500">С заботой о ваших данных</p>
      </div>

      <div className="prose prose-emerald max-w-none bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100">
        <p>
          Мы в «ЗооМедика» серьезно относимся к конфиденциальности ваших персональных данных. Эта политика объясняет, как мы собираем, используем и защищаем вашу информацию.
        </p>

        <h3 className="text-xl font-bold flex items-center gap-2 mt-8"><Database className="w-5 h-5 text-primary"/> 1. Собираемые данные</h3>
        <p>Для корректной работы сервиса мы собираем:</p>
        <ul>
          <li><strong>Контактные данные:</strong> Номер телефона (используется как уникальный идентификатор) и Telegram ID (для отправки уведомлений и кодов авторизации).</li>
          <li><strong>Личные данные:</strong> Имя (для корректного обращения).</li>
          <li><strong>Медицинские данные:</strong> Информация о питомцах, загруженные фотографии и файлы анализов (строго для оказания консультационных услуг).</li>
        </ul>

        <h3 className="text-xl font-bold flex items-center gap-2 mt-8"><ShieldCheck className="w-5 h-5 text-primary"/> 2. Использование данных</h3>
        <p>Ваши данные используются исключительно в следующих целях:</p>
        <ol>
          <li>Создание личного кабинета и обеспечение безопасности аккаунта.</li>
          <li>Связь врача с клиентом и формирование медицинского заключения.</li>
          <li>Отправка системных уведомлений (напоминания о приеме, чеки об оплате).</li>
        </ol>

        <h3 className="text-xl font-bold flex items-center gap-2 mt-8"><Lock className="w-5 h-5 text-primary"/> 3. Защита и передача третьим лицам</h3>
        <p>
          Мы не продаем и не передаем ваши данные сторонним маркетинговым агентствам. Платежные данные обрабатываются исключительно на стороне защищенного сервиса ЮKassa, мы не храним номера ваших банковских карт.
        </p>
        <p>
          Хранение медицинских файлов (PDF, изображения) осуществляется в нашей защищенной базе данных. Доступ к ним имеете только вы и ваш лечащий врач.
        </p>
      </div>
    </div>
  );
}