import HuxHero from '@/components/hux/HuxHero'
import dictionary from '@/dictionaries/zh-TW.json'

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  const { about } = dictionary

  return (
    <>
      <HuxHero
        variant="home"
        title={about.title}
        subtitle={about.description}
        headerImg={about.headerImg}
        headerMask={about.headerMask}
      />
      {children}
    </>
  )
}
