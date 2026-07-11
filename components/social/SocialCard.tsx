import type { SocialCardBackground } from '@/lib/social-card'

type SocialCardProps = {
  siteName: string
  title: string
  summary: string
  background: SocialCardBackground
}

export default function SocialCard({ siteName, title, summary, background }: SocialCardProps) {
  const isImage = background.kind === 'image'

  return (
    <div
      style={{
        alignItems: 'stretch',
        backgroundImage: isImage ? `url(${background.value})` : background.value,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        color: '#f8fafc',
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          background: isImage
            ? 'linear-gradient(90deg, rgba(2, 6, 23, 0.92) 0%, rgba(2, 6, 23, 0.72) 58%, rgba(2, 6, 23, 0.38) 100%)'
            : 'linear-gradient(180deg, rgba(2, 6, 23, 0.08) 0%, rgba(2, 6, 23, 0.38) 100%)',
          display: 'flex',
          inset: 0,
          position: 'absolute',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px 58px',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            color: '#67e8f9',
            display: 'flex',
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {siteName}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 980 }}>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 32 ? 58 : 68,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.16,
              textShadow: '0 3px 18px rgba(0, 0, 0, 0.38)',
            }}
          >
            {title}
          </div>
          {summary ? (
            <div
              style={{
                color: '#e2e8f0',
                display: 'flex',
                fontSize: 30,
                fontWeight: 500,
                lineHeight: 1.42,
                marginTop: 28,
                maxHeight: 86,
                overflow: 'hidden',
                textShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
              }}
            >
              {summary}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
