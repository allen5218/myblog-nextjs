'use client'

import { useEffect } from 'react'

// 幫 <html> 加/減 user-is-tabbing:按下 Tab 鍵時加上,滑鼠/觸控點擊時移除。
// css/tailwind.css 的焦點框樣式只在這個 class 存在時才顯示,讓連結/按鈕的
// focus outline 只在鍵盤瀏覽時出現,滑鼠點擊不會留下框。
export default function FocusVisibleFix() {
  useEffect(() => {
    const root = document.documentElement

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') root.classList.add('user-is-tabbing')
    }
    const onPointerDown = () => root.classList.remove('user-is-tabbing')

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return null
}
