import type { SocialCardBackground } from '@/lib/social-card'

type SocialCardProps = {
  siteName: string
  title: string
  summary: string
  background: SocialCardBackground
  overlayOpacity?: number
}

export default function SocialCard({
  siteName,
  title,
  summary,
  background,
  overlayOpacity,
}: SocialCardProps) {
  const isPhoto = background.kind === 'image'
  const usesBackgroundImage = isPhoto || background.kind === 'gradient-image'
  const brandName = siteName.endsWith(' Blog') ? siteName.slice(0, -5) : siteName
  const brandSuffix = siteName.endsWith(' Blog') ? 'Blog' : ''

  return (
    <div
      style={{
        alignItems: 'stretch',
        backgroundImage: usesBackgroundImage ? `url(${background.value})` : background.value,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        color: '#f8fafc',
        display: 'flex',
        fontFamily: 'Chiron Sung HK',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          backgroundColor: `rgba(2, 6, 23, ${overlayOpacity ?? (isPhoto ? 0.58 : 0.16)})`,
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
        <div style={{ alignItems: 'baseline', display: 'flex', fontSize: 48 }}>
          <span style={{ color: '#f8fafc', fontWeight: 700 }}>{brandName}</span>
          {brandSuffix ? (
            <span style={{ color: '#67e8f9', fontWeight: 400, marginLeft: 12 }}>{brandSuffix}</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 980 }}>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 42 ? 62 : title.length > 28 ? 72 : 82,
              fontWeight: 700,
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
                fontSize: 36,
                fontWeight: 400,
                lineHeight: 1.42,
                marginTop: 28,
                maxHeight: 104,
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
