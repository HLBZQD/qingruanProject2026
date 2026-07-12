declare type ESObject = Object;

export function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch (_e) {
    return fallback;
  }
}

export function safeJsonStringify(o: Object | undefined): string {
  try {
    const result = JSON.stringify(o);
    if (typeof result === 'string') {
      return result;
    }
    return '';
  } catch (_e) {
    return '';
  }
}

export function formatDate(timestamp: number, fmt: string): string {
  const date = new Date(timestamp);
  const y = String(date.getFullYear());
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const H = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  let result = fmt;
  result = result.split('yyyy').join(y);
  result = result.split('MM').join(M);
  result = result.split('dd').join(d);
  result = result.split('HH').join(H);
  result = result.split('mm').join(m);
  result = result.split('ss').join(s);
  return result;
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) {
    return formatDate(timestamp, 'yyyy-MM-dd');
  }
  if (diff < 60000) {
    return '刚刚';
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  if (diff < 2592000000) {
    return `${Math.floor(diff / 86400000)}天前`;
  }
  if (diff < 31536000000) {
    return `${Math.floor(diff / 2592000000)}月前`;
  }
  return formatDate(timestamp, 'yyyy-MM-dd');
}

export function debounce(fn: (...args: Object[]) => void, delay: number): (...args: Object[]) => void {
  let timerId: number | null = null;
  return (...args: Object[]): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export function truncateText(text: string, maxLen: number, suffix: string = '...'): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.substring(0, maxLen) + suffix;
}

export function imageUrl(path: string | null): string | null {
  if (path === null || path === undefined) {
    return null;
  }
  if (path.startsWith('http')) {
    return path;
  }
  return 'http://222.241.14.34:3000' + path;
}
