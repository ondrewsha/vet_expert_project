import { ShieldAlert, FileText, CheckCircle } from 'lucide-react';

export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold text-gray-900">Пользовательское соглашение</h1>
        <p className="mt-2 text-gray-500">Редакция от 2 марта 2026 г.</p>
      </div>

      <div className="prose prose-emerald max-w-none bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100">
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-8 rounded-r-xl flex gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 m-0">
            <strong>Важно:</strong> Онлайн-консультация носит информационно-рекомендательный характер. В экстренных случаях, угрожающих жизни питомца, немедленно обратитесь в ближайшую очную ветеринарную клинику!
          </p>
        </div>

        <h3 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-primary"/> 1. Общие положения</h3>
        <p>
          Настоящее Соглашение определяет условия использования сервиса «ВетЭксперт» (далее — «Сервис»). Используя Сервис, Вы подтверждаете, что прочитали, поняли и согласны с условиями данного документа.
        </p>

        <h3 className="text-xl font-bold flex items-center gap-2 mt-8"><CheckCircle className="w-5 h-5 text-primary"/> 2. Услуги и Оплата</h3>
        <ul className="space-y-2">
          <li><strong>Консультации:</strong> Сервис предоставляет возможность бронирования времени врача для проведения видеоконсультации. Оплата производится в размере 100% предоплаты через интегрированный платежный шлюз (ЮKassa) или с использованием внутреннего баланса.</li>
          <li><strong>Цифровые товары (Гайды):</strong> После оплаты цифрового руководства пользователь получает бессрочный доступ к скачиванию файла. В связи с природой цифровых товаров, возврат средств за них не производится.</li>
        </ul>

        <h3 className="text-xl font-bold flex items-center gap-2 mt-8"><CheckCircle className="w-5 h-5 text-primary"/> 3. Правила отмены записей</h3>
        <p>Мы ценим время наших специалистов и клиентов, поэтому применяем следующие правила:</p>
        <ul>
          <li>При отмене записи <strong>более чем за 4 часа</strong> до ее начала: 100% средств возвращается на внутренний баланс пользователя в виде 1 консультации, которую можно использовать в любое время.</li>
          <li>При отмене записи <strong>менее чем за 4 часа</strong> или неявке: услуга считается оказанной, возврат средств на баланс не производится, так как время врача было забронировано.</li>
        </ul>

        <h3 className="text-xl font-bold flex items-center gap-2 mt-8"><CheckCircle className="w-5 h-5 text-primary"/> 4. Ответственность</h3>
        <p>
          Ветеринарный врач ставит предварительный диагноз и дает рекомендации на основании предоставленных Вами данных (фото, видео, анализы, анамнез). Сервис не несет ответственности за ухудшение состояния животного, если владелец скрыл важную информацию или не последовал рекомендациям.
        </p>
      </div>
    </div>
  );
}