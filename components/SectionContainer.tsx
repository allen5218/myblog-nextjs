import { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/**
 * 全站外殼:滿版、不加橫向 padding、不設 max-width。
 *
 * 這裡刻意不放 `mx-auto max-w-3xl px-4 sm:px-6`(上游模板的寫法)。Hux 外殼裡的
 * `.hux-full-bleed`(navbar / hero / footer)不再用 `-50vw` 逃脫容器,而是直接填滿
 * 自己的 containing block(理由見 css/tailwind.css 的 .hux-full-bleed 註解:vw 含
 * 傳統捲軸寬,會溢出半個捲軸)。因此「滿版」現在等價於「本容器必須剛好等於
 * documentElement.clientWidth」——這裡一旦加上橫向 padding 或 max-width,
 * navbar / hero / footer 就會跟著內縮,不再貼齊視窗兩端。
 *
 * 需要窄欄與邊距的頁面請自己包一層(見 app/tags、app/offline、app/not-found);
 * 其餘頁面已由 .hux-home-layout / .post-shell / .archive-wrap 自行管理寬度。
 */
export default function SectionContainer({ children }: Props) {
  return <section className="flex w-full flex-1 flex-col">{children}</section>
}
