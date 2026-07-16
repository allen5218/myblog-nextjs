'use client'

import { useEffect, useState } from 'react'

export default function BackTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 250)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      className={`hux-elevator-control ${visible ? 'hux-elevator-control-visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      type="button"
    >
      <span aria-hidden="true">↑</span>
      <span className="sr-only">Back to top</span>
    </button>
  )
}
