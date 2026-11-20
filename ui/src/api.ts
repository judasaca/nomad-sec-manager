export async function request(path: string, options?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, options)
  } catch (error) {
    if (options?.signal?.aborted) throw error
    throw new Error('Could not connect to the backend.')
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    const detail = Array.isArray(problem?.detail)
      ? problem.detail[0]?.msg?.replace(/^Value error, /, '')
      : problem?.detail
    throw new Error(
      typeof detail === 'string' ? detail : 'The backend could not complete the request.',
    )
  }

  return response
}

export async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  return (await request(path, options)).json()
}
