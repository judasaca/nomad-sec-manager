export type Repository = {
  id: string
  github_id: number
  url: string
  full_name: string
  description: string | null
  default_branch: string
  language: string | null
  stars: number
  archived: boolean
  commit_count: number | null
  last_commit_sha: string | null
  last_commit_date: string | null
  last_commit_subject: string | null
  created_at: string
  metadata_updated_at: string
}

const repositoriesUrl = '/api/repositories'

async function request(path: string, options?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, options)
  } catch (error) {
    if (options?.signal?.aborted) throw error
    throw new Error('Could not connect to the repository service.')
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    const detail = Array.isArray(problem?.detail)
      ? problem.detail[0]?.msg?.replace(/^Value error, /, '')
      : problem?.detail
    throw new Error(
      typeof detail === 'string'
        ? detail
        : 'The repository service could not complete the request.',
    )
  }

  return response
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  return (await request(path, options)).json()
}

function saveRepository(method: 'POST' | 'PATCH', path: string, url?: string) {
  return requestJson<Repository>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export const repositoriesApi = {
  list: (signal: AbortSignal) =>
    requestJson<Repository[]>(repositoriesUrl, { signal }),
  create: (url: string) => saveRepository('POST', repositoriesUrl, url),
  update: (id: string, url?: string) =>
    saveRepository('PATCH', `${repositoriesUrl}/${id}`, url),
  async remove(id: string) {
    await request(`${repositoriesUrl}/${id}`, { method: 'DELETE' })
  },
}
