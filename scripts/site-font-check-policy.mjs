export function canSkipDynamicSiteFontChecks(env, missingCommands) {
  return env.VERCEL === '1' && missingCommands.length > 0
}
