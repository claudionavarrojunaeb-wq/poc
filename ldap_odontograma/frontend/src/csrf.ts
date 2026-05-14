// Helper para leer la cookie de CSRF set por el backend (ssmm_csrf).
export function getCsrfToken(): string | null {
  // Prefer cookie when available
  try {
    if (typeof document !== 'undefined') {
      const name = 'ssmm_csrf='
      const parts = document.cookie.split('; ').find(p => p.startsWith(name))
      if (parts) return decodeURIComponent(parts.slice(name.length))
    }
  } catch {
    // ignore
  }
  // Fallback to localStorage (useful in dev when cookies are blocked)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('ssmm_csrf') || null
    }
  } catch {
    // ignore
  }
  return null
}
