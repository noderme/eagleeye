# Eagle Eye Deployment Guide

This guide provides step-by-step instructions for deploying Eagle Eye to production.

## Prerequisites

Before deploying, ensure you have:

1. **Supabase Project**: Create a new Supabase project at https://supabase.com
2. **GitHub OAuth App**: Create an OAuth app at https://github.com/settings/developers
3. **Anthropic API Key**: Get your API key from https://console.anthropic.com
4. **Hosting Platform**: Choose between Vercel, Railway, Heroku, or self-hosted
5. **Domain Name**: Optional but recommended for production

## Environment Variables

Create a `.env.production` file with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Encryption
ENCRYPTION_KEY=your-64-char-hex-key

# QStash (optional, for background jobs)
QSTASH_URL=https://qstash.upstash.io
QSTASH_TOKEN=your-qstash-token
QSTASH_CURRENT_SIGNING_KEY=your-signing-key
QSTASH_NEXT_SIGNING_KEY=your-next-signing-key

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_USE_MOCK_DATA=false
NEXT_PUBLIC_USE_LOCAL_MODEL=false
NODE_ENV=production
```

## Step 1: Database Setup

### Create Supabase Project

1. Go to https://supabase.com and sign up
2. Create a new project
3. Wait for the project to be provisioned
4. Go to SQL Editor and run the migration script

### Run Database Migrations

```bash
# Copy the migration SQL
cat supabase-migration.sql

# Paste into Supabase SQL Editor and execute
```

This will create the necessary tables:
- `user_github_tokens` - Encrypted GitHub tokens
- `user_repos` - Selected repositories
- `user_api_keys` - Encrypted provider API keys
- `scan_results` - Scan results and analysis
- `scan_history` - Historical scan data

### Set Up Row-Level Security (RLS)

Ensure RLS policies are properly configured:

```sql
-- Enable RLS on all tables
ALTER TABLE user_github_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;

-- Create policies (these are in the migration script)
```

## Step 2: GitHub OAuth Setup

### Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Eagle Eye
   - **Homepage URL**: https://your-domain.com
   - **Authorization callback URL**: https://your-domain.com/auth/callback
4. Copy the Client ID and Client Secret
5. Add to environment variables

### Scopes Required

The app requests these GitHub scopes:
- `repo` - Read repository information
- `read:user` - Read user profile
- `read:org` - Read organization information (optional)

## Step 3: Anthropic API Setup

### Get API Key

1. Go to https://console.anthropic.com
2. Create an API key
3. Copy the key (starts with `sk-ant-`)
4. Add to environment variables as `ANTHROPIC_API_KEY`

### Rate Limits

Be aware of Anthropic's rate limits:
- Requests per minute: 100
- Tokens per minute: 40,000
- Tokens per day: 1,000,000

## Step 4: Encryption Key Setup

Generate a secure encryption key for encrypting API keys in the database:

```bash
# Generate a 64-character hex key
openssl rand -hex 32
```

Add this to `ENCRYPTION_KEY` environment variable.

## Step 5: Choose Hosting Platform

### Option A: Vercel (Recommended)

**Advantages**: Automatic deployments, built-in analytics, edge functions

1. Push code to GitHub
2. Go to https://vercel.com and sign in with GitHub
3. Import the repository
4. Add environment variables
5. Deploy

```bash
# Deploy from CLI
npm install -g vercel
vercel --prod
```

### Option B: Railway

**Advantages**: Simple deployment, good for Next.js, affordable

1. Go to https://railway.app
2. Create new project
3. Connect GitHub repository
4. Add environment variables
5. Deploy

### Option C: Self-Hosted

**Advantages**: Full control, no vendor lock-in

```bash
# Build the application
npm run build

# Start the server
npm start

# Or use PM2 for process management
npm install -g pm2
pm2 start npm --name "eagle-eye" -- start
pm2 save
pm2 startup
```

## Step 6: Domain Setup

### Configure Custom Domain

1. Purchase domain from registrar (GoDaddy, Namecheap, etc.)
2. Update DNS records to point to your hosting platform
3. Configure SSL/TLS certificate (automatic on Vercel)
4. Update `NEXT_PUBLIC_APP_URL` environment variable

### SSL Certificate

- **Vercel**: Automatic
- **Railway**: Automatic
- **Self-hosted**: Use Let's Encrypt with Certbot

## Step 7: Monitoring & Logging

### Set Up Error Tracking

**Option A: Sentry**

```bash
npm install @sentry/nextjs
```

Configure in `next.config.js`:

```javascript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

**Option B: LogRocket**

```bash
npm install logrocket
```

### Set Up Performance Monitoring

Use Vercel Analytics or similar service to monitor:
- API response times
- Error rates
- Database query performance
- Provider fetch times

## Step 8: Backup & Disaster Recovery

### Database Backups

**Supabase automatic backups**:
- Daily backups are automatic
- Retained for 7 days on free tier
- 30 days on paid tier

**Manual backup**:

```bash
# Export database
pg_dump postgresql://user:password@host:port/database > backup.sql

# Restore database
psql postgresql://user:password@host:port/database < backup.sql
```

### Application Backups

- Store code in Git (GitHub)
- Keep environment variables in secure vault
- Document deployment process

## Step 9: Testing in Production

### Smoke Tests

After deployment, verify:

1. **Application loads**: https://your-domain.com
2. **GitHub OAuth works**: Click "Connect GitHub"
3. **API endpoints respond**: `curl https://your-domain.com/api/providers/list`
4. **Database connectivity**: Check scan results
5. **Analysis works**: Trigger a scan and verify results

### Load Testing

Test with multiple concurrent users:

```bash
# Using Apache Bench
ab -n 100 -c 10 https://your-domain.com/

# Using wrk
wrk -t12 -c400 -d30s https://your-domain.com/
```

## Step 10: Post-Deployment

### Monitor Logs

Check application logs for errors:

```bash
# Vercel
vercel logs

# Railway
railway logs

# Self-hosted
pm2 logs eagle-eye
```

### Monitor Performance

Track key metrics:
- API response times
- Error rates
- Provider fetch success rates
- Analysis generation time
- Database query performance

### Gather Feedback

- Monitor user feedback
- Track feature requests
- Identify pain points
- Plan improvements

## Troubleshooting

### Common Issues

**Issue**: GitHub OAuth fails
- **Solution**: Verify callback URL matches exactly in GitHub settings

**Issue**: Provider data not fetching
- **Solution**: Check API keys are encrypted correctly, verify provider APIs are accessible

**Issue**: Analysis not generating
- **Solution**: Verify Anthropic API key is valid, check rate limits

**Issue**: Database connection fails
- **Solution**: Verify Supabase URL and keys are correct, check network connectivity

**Issue**: High memory usage
- **Solution**: Check for memory leaks, optimize database queries, increase server resources

### Debug Mode

Enable debug logging:

```bash
export DEBUG=eagle-eye:*
npm start
```

## Scaling

### Horizontal Scaling

For high traffic:

1. Use load balancer (Vercel handles this automatically)
2. Scale database connections
3. Add caching layer (Redis)
4. Implement rate limiting

### Vertical Scaling

For heavy workloads:

1. Increase server resources (CPU, RAM)
2. Optimize database queries
3. Implement caching
4. Use background jobs for heavy processing

## Maintenance

### Regular Tasks

- Monitor error logs daily
- Review performance metrics weekly
- Update dependencies monthly
- Backup database weekly
- Review security logs monthly

### Updates

```bash
# Update dependencies
npm update

# Update Next.js
npm install next@latest

# Deploy updates
git push  # If using Vercel
npm run build && npm start  # If self-hosted
```

## Security Checklist

Before going live:

- [ ] All secrets are in environment variables (not in code)
- [ ] HTTPS is enabled
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] Input validation is in place
- [ ] SQL injection prevention is implemented
- [ ] XSS prevention is implemented
- [ ] CSRF protection is enabled
- [ ] Security headers are set
- [ ] Audit logs are enabled

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review logs and error messages
3. Consult the testing guide
4. Check GitHub issues
5. Contact support

## Next Steps

After successful deployment:

1. Monitor performance and errors
2. Gather user feedback
3. Plan feature enhancements
4. Optimize based on usage patterns
5. Consider additional providers
6. Implement advanced features

---

**Last Updated**: 2026-03-23
**Version**: 1.0
