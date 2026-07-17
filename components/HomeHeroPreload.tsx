'use client'

import ReactDOM from 'react-dom'

export default function HomeHeroPreload() {
  ReactDOM.preload('/img/home-bg.avif', {
    as: 'image',
    type: 'image/avif',
    fetchPriority: 'high',
  })

  return null
}
