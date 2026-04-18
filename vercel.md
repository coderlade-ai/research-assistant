# Vercel Deployment Guide

This guide covers deploying the Research Agent application to Vercel.

## Prerequisites

- A Vercel account (sign up at [vercel.com](https://vercel.com))
- Git repository connected to GitHub/GitLab/Bitbucket
- Node.js 18+ and npm installed locally

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/girishlade111/research-assistant)

Click the button above to deploy directly from the GitHub repository.

## Manual Deployment Steps

### 1. Connect Repository

1. Log into [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository (girishlade111/research-assistant)
4. Click "Continue"

### 2. Configure Environment Variables

Add the following environment variables in the Vercel project settings:

#### Required Variables

- `OPENAI_API_KEY` - OpenAI API key for AI model access
  - Get from: https://platform.openai.com/api-keys

#### Optional Variables (for enhanced functionality)

- `ANTHROPIC_API_KEY` - Anthropic Claude API key (optional)
- `GOOGLE_API_KEY` - Google Gemini API key (optional)
- `TAVILY_API_KEY` - Tavily search API key for web search functionality
- `REDIS_URL` - Redis connection string for caching (optional)
- `NEXT_PUBLIC_APP_URL` - Public application URL (auto-set by Vercel)

### 3. Build Configuration

Vercel automatically detects Next.js projects and applies optimal settings:

- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

### 4. Deploy

1. Click "Deploy" in the Vercel dashboard
2. Wait for the build to complete (typically 2-5 minutes)
3. Your app will be available at `https://<your-project-name>.vercel.app`

## Project Structure

```
research-agent/
├── app/                    # Next.js app directory
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page component
├── components/            # React components
├── lib/                  # Utility libraries
├── public/               # Static assets
├── package.json          # Dependencies
├── next.config.js        # Next.js configuration
├── tailwind.config.js    # Tailwind CSS configuration
└── tsconfig.json         # TypeScript configuration
```

## Features Enabled on Vercel

### ✅ Automatic HTTPS
All Vercel deployments include free SSL/TLS certificates.

### ✅ CDN Edge Network
Static assets are cached globally for optimal performance.

### ✅ Serverless Functions
API routes run as serverless functions with automatic scaling.

### ✅ Analytics
Built-in analytics available in the Vercel dashboard.

### ✅ Preview Deployments
Every PR creates a preview deployment for testing.

### ✅ Branch Deployments
Each git branch can have its own deployment.

### ✅ Zero-Config CI/CD
Automatic deployments on every push to main branch.

## Environment-Specific Configurations

### Development vs Production

The app automatically detects the environment via `NODE_ENV`:

- `development` - Dev mode with hot reload
- `production` - Optimized production build

Vercel sets `NODE_ENV=production` automatically.

### API Route Handling

API routes are deployed as serverless functions:

```typescript
// Example API route
export async function POST(request: Request) {
  const body = await request.json();
  // Handle request
  return NextResponse.json({ result: 'success' });
}
```

## Database Configuration (Optional)

If using a database (PostgreSQL, Redis, etc.):

1. **Vercel Postgres** (recommended)
   - Add via Vercel Integrations
   - Connection URL auto-provided as `POSTGRES_URL`

2. **External Database**
   - Add connection string as environment variable
   - Use connection pooling for serverless functions

## Caching Strategy

### Static Assets
- Images, fonts, and static files cached at edge
- Configured via `next.config.js`

### API Responses
- Response caching configured per-route
- Redis caching available via `REDIS_URL`

## Domain Configuration

1. Go to Project Settings → Domains
2. Add custom domain
3. Update DNS records as instructed
4. Wait for SSL certificate issuance (automatic)

## Monitoring & Logs

### Vercel Logs
- Access via dashboard or CLI: `vercel logs <deployment>`
- Real-time logs available
- 90-day retention

### Error Tracking
- Built-in error reporting
- Integrations with Sentry, LogRocket available

### Analytics Dashboard
- Visitor metrics
- Performance data
- Bandwidth usage

## Troubleshooting

### Build Fails

Common issues:
1. **Missing environment variables**
   - Check all required API keys are set
   - Variables must be added before first build

2. **Dependency conflicts**
   - Ensure `package-lock.json` is committed
   - Clear cache and redeploy

3. **TypeScript errors**
   - Run `npm run build` locally first
   - Fix type errors before deploying

### Runtime Errors

1. **API route timeouts**
   - Increase timeout in `vercel.json`:
   ```json
   {
     "functions": {
       "api/**/*.ts": {
         "maxDuration": 30
       }
     }
   }
   ```

2. **Memory issues**
   - Monitor memory usage in logs
   - Optimize large data processing

### Preview Deployment Issues

If preview deployments fail:
1. Check branch protection rules
2. Verify repository permissions
3 - Ensure Vercel has write access to repo

## Performance Optimization

### Image Optimization
Next.js automatically optimizes images:
```typescript
import Image from 'next/image';
```

### Font Optimization
Google Fonts auto-optimized when using `next/font/google`.

### Code Splitting
Automatic via Next.js `app` directory structure.

## Security

### API Key Protection
- All environment variables encrypted at rest
- Never expose secrets in client-side code
- Use server-side functions for sensitive operations

### Rate Limiting
Consider implementing rate limiting for API routes.

### CORS Configuration
API routes have appropriate CORS headers by default.

## Custom Configuration (`vercel.json`)

Optional configuration file:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ],
  "redirects": [
    { "source": "/old-path", "destination": "/new-path", "permanent": true }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ],
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 10,
      "memory": 256
    }
  }
}
```

## Rollbacks

To rollback to a previous deployment:

1. Go to Deployments tab in dashboard
2. Find the previous deployment
3. Click "Promote to Production"

Or via CLI:
```bash
vercel rollback <deployment-url>
```

## Cost & Resource Limits

### Free Tier
- 100 GB bandwidth/month
- 100 serverless function invocations/day
- Unlimited static sites
- SSL certificates included

### Pro Tier ($20/month per member)
- 1 TB bandwidth/month
- Unlimited serverless invocations
- Priority support
- Advanced analytics

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Community](https://vercel.com/community)
- GitHub Issues: Report bugs in repository

## Additional Notes

- First deployment may take longer due to cold starts
- Serverless functions have a 10-second timeout on free tier (60s on Pro)
- Edge Functions have 1MB payload limit
- File uploads limited to 4.5MB per request on serverless functions

## Related Documentation

- [README.md](./README.md) - Project overview and local setup
- [AGENTS.md](./AGENTS.md) - Agent system documentation
- [CLAUDE.md](./CLAUDE.md) - Claude integration guide

---

**Last Updated**: 2026-04-19
**Vercel Region**: Default (auto-selected)
