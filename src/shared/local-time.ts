function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = twoDigits(date.getMonth() + 1);
  const day = twoDigits(date.getDate());
  const hour = twoDigits(date.getHours());
  const minute = twoDigits(date.getMinutes());
  const second = twoDigits(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function withLocalTimestamp(message: string, date: Date = new Date()): string {
  return `[${formatLocalTimestamp(date)}] ${message}`;
}
