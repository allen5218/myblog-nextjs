import { defineDocumentType, ComputedFields, makeSource } from 'contentlayer2/source-files'
import { writeFileSync } from 'fs'
import readingTime from 'reading-time'
import { slug } from 'github-slugger'
import path from 'path'
import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
// Remark packages
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { remarkAlert } from 'remark-github-blockquote-alert'
import {
  remarkExtractFrontmatter,
  remarkCodeTitles,
  remarkImgToJsx,
  extractTocHeadings,
} from 'pliny/mdx-plugins/index.js'
// Rehype packages
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypeKatexNoTranslate from 'rehype-katex-notranslate'
import rehypeCitation from 'rehype-citation'
import rehypeMermaid from './lib/rehype-mermaid.mjs'
import rehypePrismPlus from 'rehype-prism-plus'
import rehypePresetMinify from 'rehype-preset-minify'
import { visit } from 'unist-util-visit'
import siteMetadata from './data/siteMetadata'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer.js'
import prettier from 'prettier'
import { legacyPathFromDateAndSlug, stripPostDatePrefix } from './lib/legacy-url'
import { isResponsiveIframeSrc } from './lib/iframe'

const root = process.cwd()
const isProduction = process.env.NODE_ENV === 'production'

// 舊站(Jekyll)用 AnchorJS 的 icon: '#' 選項,標題錨點就是一個純文字 #,
// 不是圖示字型也不是 SVG——比照移植,樣式交給 css/tailwind.css 的 .content-header-link。
const icon = fromHtmlIsomorphic('<span class="content-header-link">#</span>', {
  fragment: true,
})

const computedFields: ComputedFields = {
  readingTime: { type: 'json', resolve: (doc) => readingTime(doc.body.raw) },
  slug: {
    type: 'string',
    resolve: (doc) => stripPostDatePrefix(doc._raw.sourceFileName),
  },
  path: {
    type: 'string',
    resolve: (doc) =>
      legacyPathFromDateAndSlug(doc.date, stripPostDatePrefix(doc._raw.sourceFileName)),
  },
  legacyPath: {
    type: 'string',
    resolve: (doc) =>
      legacyPathFromDateAndSlug(doc.date, stripPostDatePrefix(doc._raw.sourceFileName)),
  },
  url: {
    type: 'string',
    resolve: (doc) =>
      `/${legacyPathFromDateAndSlug(doc.date, stripPostDatePrefix(doc._raw.sourceFileName))}/`,
  },
  filePath: {
    type: 'string',
    resolve: (doc) => doc._raw.sourceFilePath,
  },
  toc: { type: 'json', resolve: (doc) => extractTocHeadings(doc.body.raw) },
  listed: { type: 'boolean', resolve: (doc) => doc.hidden !== true },
}

/**
 * Count the occurrences of all tags across blog posts and write to json file
 */
async function createTagCount(allBlogs) {
  const tagCount: Record<string, number> = {}
  allBlogs.forEach((file) => {
    if (file.tags && file.listed !== false && (!isProduction || file.draft !== true)) {
      file.tags.forEach((tag) => {
        const formattedTag = slug(tag)
        if (formattedTag in tagCount) {
          tagCount[formattedTag] += 1
        } else {
          tagCount[formattedTag] = 1
        }
      })
    }
  })
  const formatted = await prettier.format(JSON.stringify(tagCount, null, 2), { parser: 'json' })
  writeFileSync('./app/tag-data.json', formatted)
}

function createSearchIndex(allBlogs) {
  if (
    siteMetadata?.search?.provider === 'kbar' &&
    siteMetadata.search.kbarConfig.searchDocumentsPath
  ) {
    writeFileSync(
      `public/${path.basename(siteMetadata.search.kbarConfig.searchDocumentsPath)}`,
      JSON.stringify(allCoreContent(sortPosts(allBlogs.filter((post) => post.listed !== false))))
    )
    console.log('Local search index generated...')
  }
}

function excerptFromMarkdown(raw: string, maxLength = 200) {
  const text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

function classNames(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean)
  return []
}

function mdxAttribute(name: string, value: string | boolean | null = null) {
  return {
    type: 'mdxJsxAttribute',
    name,
    value,
  }
}

function mdxAttributeValue(node, name: string) {
  return node.attributes?.find(
    (attribute) => attribute.type === 'mdxJsxAttribute' && attribute.name === name
  )?.value
}

function setMdxAttribute(node, name: string, value: string | boolean | null) {
  const attributes = (node.attributes || []).filter(
    (attribute) =>
      !(attribute.type === 'mdxJsxAttribute' && [name, name.toLowerCase()].includes(attribute.name))
  )
  attributes.push(mdxAttribute(name, value))
  node.attributes = attributes
}

function responsiveIframeTransform() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (
        node.tagName !== 'iframe' ||
        typeof index !== 'number' ||
        !parent ||
        !Array.isArray(parent.children)
      ) {
        return
      }

      const src = String(node.properties?.src || '')
      if (!isResponsiveIframeSrc(src)) {
        return
      }

      const parentClasses = classNames(parent.properties?.className)
      if (parent.tagName === 'div' && parentClasses.includes('aspect-video')) {
        return
      }

      node.properties = {
        ...node.properties,
        frameBorder: node.properties?.frameborder ?? node.properties?.frameBorder,
        allowFullScreen: node.properties?.allowfullscreen ?? node.properties?.allowFullScreen,
        referrerPolicy: node.properties?.referrerpolicy ?? node.properties?.referrerPolicy,
        className: Array.from(
          new Set([...classNames(node.properties?.className), 'h-full', 'w-full'])
        ),
      }
      delete node.properties.frameborder
      delete node.properties.allowfullscreen
      delete node.properties.referrerpolicy
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['my-6', 'aspect-video', 'w-full', 'overflow-hidden'] },
        children: [node],
      }
    })

    visit(tree, 'mdxJsxFlowElement', (node, index, parent) => {
      if (
        node.name !== 'iframe' ||
        typeof index !== 'number' ||
        !parent ||
        !Array.isArray(parent.children)
      ) {
        return
      }

      const src = String(mdxAttributeValue(node, 'src') || '')
      if (!isResponsiveIframeSrc(src)) {
        return
      }

      const parentClasses =
        parent.type === 'mdxJsxFlowElement' && parent.name === 'div'
          ? classNames(mdxAttributeValue(parent, 'className'))
          : []
      if (parentClasses.includes('aspect-video')) {
        return
      }

      setMdxAttribute(node, 'className', 'h-full w-full')
      setMdxAttribute(node, 'frameBorder', String(mdxAttributeValue(node, 'frameborder') || 0))
      if (mdxAttributeValue(node, 'allowfullscreen') !== undefined) {
        setMdxAttribute(node, 'allowFullScreen', null)
      }
      if (mdxAttributeValue(node, 'referrerpolicy') !== undefined) {
        setMdxAttribute(
          node,
          'referrerPolicy',
          String(mdxAttributeValue(node, 'referrerpolicy') || '')
        )
      }
      node.attributes = node.attributes.filter(
        (attribute) =>
          !(
            attribute.type === 'mdxJsxAttribute' &&
            ['frameborder', 'allowfullscreen', 'referrerpolicy'].includes(attribute.name)
          )
      )

      parent.children[index] = {
        type: 'mdxJsxFlowElement',
        name: 'div',
        attributes: [mdxAttribute('className', 'my-6 aspect-video w-full overflow-hidden')],
        children: [node],
      }
    })
  }
}

export const Blog = defineDocumentType(() => ({
  name: 'Blog',
  filePathPattern: 'blog/**/*.{md,markdown}',
  contentType: 'mdx',
  fields: {
    title: { type: 'string', required: true },
    date: { type: 'date', required: true },
    tags: { type: 'list', of: { type: 'string' }, default: [] },
    update: { type: 'date' },
    draft: { type: 'boolean' },
    subtitle: { type: 'string' },
    images: { type: 'json' },
    authors: { type: 'list', of: { type: 'string' } },
    author: { type: 'string' },
    layout: { type: 'string' },
    bibliography: { type: 'string' },
    canonicalUrl: { type: 'string' },
    headerImg: { type: 'string' },
    headerBgCss: { type: 'string' },
    headerMask: { type: 'json' },
    catalog: { type: 'boolean' },
    mathjax: { type: 'boolean' },
    mermaid: { type: 'boolean' },
    iframe: { type: 'string' },
    hidden: { type: 'boolean' },
  },
  computedFields: {
    ...computedFields,
    lastmod: {
      type: 'date',
      resolve: (doc) => doc.update || doc.lastmod || doc.date,
    },
    summary: {
      type: 'string',
      resolve: (doc) => doc.summary || doc.subtitle || '',
    },
    preview: {
      type: 'string',
      resolve: (doc) => excerptFromMarkdown(doc.body.raw),
    },
    heroImage: {
      type: 'string',
      resolve: (doc) => doc.headerImg || '',
    },
    structuredData: {
      type: 'json',
      resolve: (doc) => ({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: doc.title,
        datePublished: doc.date,
        dateModified: doc.update || doc.lastmod || doc.date,
        description: doc.summary || doc.subtitle,
        image: doc.headerImg || (doc.images ? doc.images[0] : siteMetadata.socialBanner),
        url: `${siteMetadata.siteUrl}/${legacyPathFromDateAndSlug(
          doc.date,
          stripPostDatePrefix(doc._raw.sourceFileName)
        )}`,
      }),
    },
  },
}))

export const Authors = defineDocumentType(() => ({
  name: 'Authors',
  filePathPattern: 'authors/**/*.mdx',
  contentType: 'mdx',
  fields: {
    name: { type: 'string', required: true },
    avatar: { type: 'string' },
    occupation: { type: 'string' },
    company: { type: 'string' },
    email: { type: 'string' },
    twitter: { type: 'string' },
    bluesky: { type: 'string' },
    linkedin: { type: 'string' },
    github: { type: 'string' },
    layout: { type: 'string' },
  },
  computedFields,
}))

export default makeSource({
  contentDirPath: 'data',
  documentTypes: [Blog, Authors],
  mdx: {
    cwd: process.cwd(),
    remarkPlugins: [
      remarkExtractFrontmatter,
      remarkGfm,
      remarkCodeTitles,
      remarkMath,
      remarkImgToJsx,
      remarkAlert,
      responsiveIframeTransform,
    ],
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          headingProperties: {
            className: ['content-header'],
          },
          content: icon,
        },
      ],
      rehypeKatex,
      rehypeKatexNoTranslate,
      [rehypeCitation, { path: path.join(root, 'data') }],
      rehypeMermaid, // 務必在 rehypePrismPlus 之前:Prism 會把 <pre><code> 重寫成
      // <span class="code-line"> 結構,mermaid fence 一旦被 Prism 處理過就再也
      // 認不出來,只會靜默 fallback 成一般 code block(不會報錯)。
      [rehypePrismPlus, { defaultLanguage: 'js', ignoreMissing: true }],
      responsiveIframeTransform,
      rehypePresetMinify,
    ],
  },
  onSuccess: async (importData) => {
    const { allBlogs } = await importData()
    createTagCount(allBlogs)
    createSearchIndex(allBlogs)
  },
})
