export type ToastTone = 'info' | 'error' | 'success';

export function toast(message: string, tone: ToastTone = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('mp-toast', { detail: { message, tone } }));
}

export function toastError(err: unknown) {
  const msg = typeof err === 'string' ? err : (err as any)?.message || 'Something went wrong';
  toast(msg, 'error');
}
