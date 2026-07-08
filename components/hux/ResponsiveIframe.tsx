import type { IframeHTMLAttributes } from 'react'

const responsiveHosts = ['youtube.com', 'youtube-nocookie.com', 'youtu.be', 'vimeo.com']

function isResponsiveEmbed(src?: string) {
  if (!src) {
    return false
  }

  return responsiveHosts.some((host) => src.includes(host))
}

export default function ResponsiveIframe(props: IframeHTMLAttributes<HTMLIFrameElement>) {
  const iframe = (
    <iframe
      {...props}
      className={['h-full w-full', props.className].filter(Boolean).join(' ')}
      title={props.title || 'Embedded content'}
      allowFullScreen={props.allowFullScreen ?? true}
    />
  )

  if (!isResponsiveEmbed(props.src)) {
    return iframe
  }

  return <div className="my-6 aspect-video w-full overflow-hidden">{iframe}</div>
}
