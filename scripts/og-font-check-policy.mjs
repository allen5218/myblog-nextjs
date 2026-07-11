export function canSkipMissingHarfBuzz(env) {
  return env.VERCEL === '1'
}
