/**
 * Run an alpha-access check that must never take the page down with it.
 *
 * /maintenance is where proxy.ts sends the whole site during site maintenance,
 * which is exactly when the session cookie may be missing and the database the
 * check consults may be slow or gone. Whatever happens (a throw, a rejection,
 * a hang) the answer falls back to `false`, so the viewer gets the legacy
 * page.
 */
export async function alphaOrLegacy(
  check: () => Promise<boolean>,
  timeoutMs = 1500,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  try {
    return (await Promise.race([Promise.resolve().then(check), timeout])) === true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
