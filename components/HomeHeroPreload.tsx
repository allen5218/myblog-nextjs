'use client'

import ReactDOM from 'react-dom'

export default function HomeHeroPreload() {
  ReactDOM.preload('/img/home-bg.webp', { as: 'image', type: 'image/webp' })

  return null
}
