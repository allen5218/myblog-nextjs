'use client'

import { useEffect } from 'react'

// Pliny 的 KBarModal 把 kbar 搜尋框的 placeholder 寫死為 "Type a command or search…",
// 且未透過 props 暴露 defaultPlaceholder,無法用設定覆寫。
// 這裡在 KBar 彈窗開啟(搜尋 input 被插入 DOM)時,用 MutationObserver 直接改寫其 placeholder。
// React 只在 placeholder prop 值改變時才會回寫 DOM,頂層搜尋狀態下此覆寫會持續有效。
const PLACEHOLDER = '$ grep...'

export default function KBarSearchPlaceholder() {
  useEffect(() => {
    const apply = () => {
      const input = document.querySelector<HTMLInputElement>('input[aria-controls="kbar-listbox"]')
      if (input && input.getAttribute('placeholder') !== PLACEHOLDER) {
        input.setAttribute('placeholder', PLACEHOLDER)
      }
    }
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    apply()
    return () => observer.disconnect()
  }, [])

  return null
}
