import { NewsletterAPI } from 'pliny/newsletter'
import { NextResponse } from 'next/server'
import siteMetadata from '@/data/siteMetadata'

export const dynamic = 'force-static'

const provider = siteMetadata.newsletter?.provider?.trim()

const handler = provider
  ? NewsletterAPI({
      // @ts-ignore
      provider,
    })
  : async () => NextResponse.json({ error: 'Newsletter is not configured' }, { status: 404 })

export { handler as GET, handler as POST }
