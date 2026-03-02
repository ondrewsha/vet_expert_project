import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Умный форматтер телефона
export const formatPhone = (value) => {
  if (!value) return value;
  // Оставляем только цифры
  const phoneNumber = value.replace(/\D/g, "");
  
  // Если пусто
  if (phoneNumber.length === 0) return "";

  // Если первая цифра 7, 8 или 9 - считаем это российским номером
  if (["7", "8", "9"].indexOf(phoneNumber[0]) > -1) {
    // Если начали с 9, добавим 7
    let clean = phoneNumber[0] === "9" ? "7" + phoneNumber : phoneNumber;
    // Если начали с 8, заменим на 7
    if (clean[0] === "8") clean = "7" + clean.slice(1);

    // Формируем маску
    // +7 (999) 123-45-67
    let output = "+7";
    if (clean.length > 1) output += " (" + clean.substring(1, 4);
    if (clean.length >= 5) output += ") " + clean.substring(4, 7);
    if (clean.length >= 8) output += "-" + clean.substring(7, 9);
    if (clean.length >= 10) output += "-" + clean.substring(9, 11);
    
    return output;
  } 
  
  // Если другой код страны - просто возвращаем + и цифры
  return "+" + phoneNumber;
};