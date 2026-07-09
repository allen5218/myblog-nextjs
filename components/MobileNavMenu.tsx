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
        <MenuItems className="ring-opacity-5 absolute right-0 z-50 mt-2 w-40 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black focus:outline-hidden dark:bg-gray-800">
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
