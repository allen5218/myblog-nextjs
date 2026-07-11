import { expect, test } from '@playwright/test'

// 手機版從漢堡選單點 Search 開 kbar 後,漢堡選單必須跟著關閉。過去 Search 項
// 用 SearchButton 包 pliny 的 KBarButton,MenuItem 注入的 props(關閉選單的
// handler、role="menuitem")全被丟棄 —— 選單殘留在 kbar 底下,kbar 的第一次
// tap 被 HeadlessUI 的 outside-click 拿去關選單,click 被吞掉,使用者要按兩次
// 才會導覽。桌面滑鼠的 click 合成不受影響,所以只有觸控裝置看得到。
// 這些測試用觸控模擬把「選單關閉 + 一次 tap 就導覽」釘死。
test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
})

async function openKbarViaHamburger(page) {
  await page.getByLabel('Toggle navigation').tap()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Search' }).tap()
  await expect(page.locator('input[aria-controls="kbar-listbox"]')).toBeVisible()
  // 漢堡選單必須已關閉,否則 kbar 的第一次 tap 會被它的 outside-click 吃掉
  await expect(page.getByRole('menu')).toHaveCount(0)
}

test('kbar 未高亮的結果第一次 tap 就導覽', async ({ page }) => {
  await page.goto('/')
  await openKbarViaHamburger(page)

  // 挑一個「非目前高亮」的文章項 —— 這正是需要按兩次的那種項目。
  // 注意 kbar 連分組標題列都掛 role="option",不能用 aria-selected=false 的
  // 第一個(那會選到沒有 onClick 的「CONTENT」標題),要用文章標題定位。
  const inactiveItem = page.locator('[role="option"]').filter({ hasText: '你的防火牆很強' })
  await expect(inactiveItem).toBeVisible()
  await expect(inactiveItem).toHaveAttribute('aria-selected', 'false')

  await inactiveItem.tap()
  await page.waitForURL('**/2025/11/29/social-engineering-attacks-prevention/', {
    timeout: 10_000,
  })
})

test('kbar 預設高亮的第一項 tap 導覽(既有行為不退化)', async ({ page }) => {
  await page.goto('/')
  await openKbarViaHamburger(page)

  const activeItem = page.locator('[role="option"][aria-selected="true"]').first()
  await expect(activeItem).toBeVisible()

  await activeItem.tap()
  await page.waitForURL((url) => url.pathname !== '/', { timeout: 10_000 })
})
