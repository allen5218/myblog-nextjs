'use client'

import { Fragment } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import Link from './Link'
import SearchButton from './SearchButton'
import headerNavLinks from '@/data/headerNavLinks'

// 手機版導覽:漢堡按鈕點擊後彈出圓角卡片下拉,樣式與 ThemeSwitch 的彈窗一致
// (不再沿用 Hux 的整條深色下拉)。深淺切換已移到頂欄常駐,不放進這裡。
const MobileNavMenu = () => {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton aria-label="Toggle navigation" className="navbar-toggle">
        <span className="icon-bar" />
        <span className="icon-bar" />
        <span className="icon-bar" />
      </MenuButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        {/* 沒有明確指定 top 時,絕對定位的下拉在垂直方向會退回「原本沒被抽離文件流時
            應該在的位置」去估算,.navbar-toggle 是 52px 高的大圓形按鈕,這個估算跟正常
            的「貼在按鈕下方」對不上,導致下拉整個蓋住按鈕本身。明確加上 top-full,
            下拉頂端固定對齊到按鈕(這個 relative 容器)的下緣,正常顯示在按鈕正下方
            而不是蓋住它;right-0 貼齊漢堡按鈕自己的右緣,維持在按鈕正下方,不偏移。 */}
        <MenuItems className="ring-opacity-5 absolute top-full right-0 z-50 mt-2 w-40 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black focus:outline-hidden dark:bg-gray-800">
          <div className="p-1">
            {headerNavLinks.map((link) => (
              <MenuItem key={link.title}>
                {({ focus }) => (
                  <Link
                    href={link.href}
                    className={`${
                      focus ? 'bg-primary-600 text-white' : 'text-gray-700! dark:text-gray-200!'
                    } block rounded-md px-3 py-2 text-sm font-semibold tracking-wide`}
                  >
                    {link.title}
                  </Link>
                )}
              </MenuItem>
            ))}
            {/* 搜尋移入漢堡下拉,純文字列觸發 KBar */}
            <MenuItem>
              {({ focus }) => (
                <SearchButton
                  label="Search"
                  className={`${
                    focus ? 'bg-primary-600 text-white' : 'text-gray-700! dark:text-gray-200!'
                  } block w-full rounded-md px-3 py-2 text-left text-sm font-semibold tracking-wide`}
                />
              )}
            </MenuItem>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  )
}

export default MobileNavMenu
