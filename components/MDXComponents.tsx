import TOCInline from 'pliny/ui/TOCInline'
import Pre from 'pliny/ui/Pre'
import BlogNewsletterForm from 'pliny/ui/BlogNewsletterForm'
import type { MDXComponents } from 'mdx/types'
import Image from './Image'
import CustomLink from './Link'
import MDXRuntimeEnhancers from './hux/MDXRuntimeEnhancers'
import ResponsiveIframe from './hux/ResponsiveIframe'
import ResponsiveTable from './hux/ResponsiveTable'

export const components: MDXComponents = {
  Image,
  TOCInline,
  a: CustomLink,
  iframe: ResponsiveIframe,
  pre: Pre,
  table: ResponsiveTable,
  wrapper: MDXRuntimeEnhancers,
  BlogNewsletterForm,
}
