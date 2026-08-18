/**
 * Shared launch options for specs that drive their own browser.
 *
 * These specs used to hardcode `headless: false, slowMo: 50` — leftovers from
 * local debugging. That made them impossible to run anywhere without an
 * XServer: in a container every one of them failed with "Looks like you
 * launched a headed browser without having a XServer running", which reads as
 * a broken test rather than a machine without a display.
 *
 * Headless is the default. Set HEADED=1 to watch a run, which also restores the
 * slow motion that makes it followable.
 */
export const headed = Boolean(process.env.HEADED || process.env.PWDEBUG)

export const launchOptions = {
  headless: !headed,
  slowMo: headed ? 50 : 0,
}
