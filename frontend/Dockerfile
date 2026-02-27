FROM node:20-alpine

WORKDIR /app

# Копируем package.json и ставим зависимости
COPY package.json package-lock.json ./
RUN npm install

# Копируем остальной код
COPY . .

# Открываем порт Vite
EXPOSE 5173

# Запускаем в режиме разработки (с hot-reload)
CMD ["npm", "run", "dev", "--", "--host"]