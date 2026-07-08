import type { ReactNode } from 'react'
import MediumZoomClient from './MediumZoomClient'

type MDXRuntimeEnhancersProps = {
  children: ReactNode
}

export default function MDXRuntimeEnhancers({ children }: MDXRuntimeEnhancersProps) {
  return (
    <>
      <MediumZoomClient />
      {children}
    </>
  )
}
