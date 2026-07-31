import type { Locator, Page } from '@playwright/test'

/**
 * 真正用鍵盤 Tab 走到目標元素。
 *
 * 不要用 locator.focus() 取代:那是程式化 focus,規則若哪天收緊成 :focus-visible,
 * 程式化 focus 不會觸發,測試會靜默失去鑑別力而不是變紅。
 */
export async function focusWithKeyboard(page: Page, target: Locator) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let attempts = 0; attempts < 200; attempts += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => document.activeElement === element)) return
  }
  throw new Error('Target did not receive keyboard focus')
}
