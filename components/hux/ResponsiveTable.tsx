import type { TableHTMLAttributes } from 'react'

export default function ResponsiveTable(props: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-responsive w-full overflow-x-auto">
      <table {...props} className={['table', props.className].filter(Boolean).join(' ')} />
    </div>
  )
}
