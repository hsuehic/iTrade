import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = (
  dateInput: string | number | Date | undefined,
  locale: string,
) => {
  if (!dateInput) return '-';

  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    const dateStr = dateInput.toString();
    // If the date string doesn't have a timezone indicator, treat it as UTC
    const normalizedDateStr =
      dateStr.endsWith('Z') || dateStr.includes('+')
        ? dateStr
        : dateStr.includes('T')
          ? `${dateStr}Z`
          : `${dateStr.replace(' ', 'T')}Z`;
    date = new Date(normalizedDateStr);
  }

  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatFullDate = (
  dateInput: string | number | Date | undefined,
  locale: string,
) => {
  if (!dateInput) return '-';

  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    const dateStr = dateInput.toString();
    const normalizedDateStr =
      dateStr.endsWith('Z') || dateStr.includes('+')
        ? dateStr
        : dateStr.includes('T')
          ? `${dateStr}Z`
          : `${dateStr.replace(' ', 'T')}Z`;
    date = new Date(normalizedDateStr);
  }

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};
