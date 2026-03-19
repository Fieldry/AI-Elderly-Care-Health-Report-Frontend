const backendOrigin = (import.meta.env.VITE_BACKEND_ORIGIN || '').trim()

export function buildBackendUrl(path: string) {
  if (!backendOrigin) {
    return path
  }

  return `${backendOrigin}${path}`
}

export async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(buildBackendUrl(path), init)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

export function buildJsonHeaders(headers?: HeadersInit) {
  return {
    'Content-Type': 'application/json',
    ...headers
  }
}
