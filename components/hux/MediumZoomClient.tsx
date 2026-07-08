'use client'

import mediumZoom, { Zoom } from 'medium-zoom'
import { useEffect } from 'react'

const selector = '.post-container img'

declare global {
  interface Window {
    updateMediumZoomTheme?: () => void
  }
}

function isDarkTheme() {
  return document.documentElement.classList.contains('dark')
}

function zoomBackground() {
  return isDarkTheme() ? 'rgba(0, 0, 0, 0.92)' : 'rgba(255, 255, 255, 0.95)'
}

export default function MediumZoomClient() {
  useEffect(() => {
    let zoom: Zoom | undefined

    const attach = () => {
      zoom?.detach()
      zoom = mediumZoom(selector, {
        background: zoomBackground(),
        margin: 24,
        scrollOffset: 0,
      })
    }

    const updateTheme = () => {
      zoom?.update({ background: zoomBackground() })
    }

    attach()
    window.addEventListener('storage', updateTheme)
    window.updateMediumZoomTheme = updateTheme

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => {
      window.removeEventListener('storage', updateTheme)
      delete window.updateMediumZoomTheme
      observer.disconnect()
      zoom?.detach()
    }
  }, [])

  return null
}
