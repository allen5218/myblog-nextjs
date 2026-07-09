import type { IframeHTMLAttributes } from 'react'
import { isResponsiveIframeSrc } from '@/lib/iframe'

export default function ResponsiveIframe(props: IframeHTMLAttributes<HTMLIFrameElement>) {
  const iframe = (
    <iframe
      {...props}
      className={['h-full w-full', props.className].filter(Boolean).join(' ')}
      title={props.title || 'Embedded content'}
      allowFullScreen={props.allowFullScreen ?? true}
    />
  )

  if (!isResponsiveIframeSrc(props.src)) {
    return iframe
  }

  return <div className="my-6 aspect-video w-full overflow-hidden">{iframe}</div>
}
