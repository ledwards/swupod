/** Retry the same reserved game; never generate a new request identity on retry. */
export async function requestGameLaunch(url: string, body: object) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw Object.assign(new Error(data?.error ?? 'Unable to start the game.'), {status:response.status,code:data?.code})
      if (typeof data?.launchUrl !== 'string' || !data.launchUrl) throw new Error('The game did not return a launch link. Please retry.')
      return data as {launchUrl:string}
    } catch (error) {
      const temporary = error instanceof TypeError || error instanceof Error &&
        ('status' in error && Number(error.status) >= 500 || 'code' in error && error.code === 'runtime_not_found')
      if (!temporary || attempt >= 2) throw error
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
}
