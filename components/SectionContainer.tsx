import { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

/**
 * 全站外殼:滿版、不加橫向 padding、不設 max-width。
 *
 * 這裡刻意不放 `mx-auto max-w-3xl px-4 sm:px-6`(上游模板的寫法)。Hux 外殼裡的
 * `.hux-full-bleed`(navbar / hero / footer)靠 `left: 50%` + `margin-left: -50vw`
 * 撐到 viewport 兩端,前提是「它的 containing block 在 viewport 中置中」。而
 * `.hux-home-layout` / `.post-shell` 的 `width: min(1170px, 100vw)` 是個確定寬度,
 * 會成為本容器 min-content 的下限;一旦這裡有橫向 padding,min-content 就變成
 * 「100vw + padding」,Safari 會據此把本容器撐得比 viewport 寬,`<main>` 於是靠左
 * 而非置中,full-bleed 整組偏移一個 padding 的量,並產生水平捲軸。
 *
 * 需要窄欄與邊距的頁面請自己包一層(見 app/tags、app/offline、app/not-found);
 * 其餘頁面已由 .hux-home-layout / .post-shell / .archive-wrap 自行管理寬度。
 */
export default function SectionContainer({ children }: Props) {
  return <section className="flex w-full flex-1 flex-col">{children}</section>
}
