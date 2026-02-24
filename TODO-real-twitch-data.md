# TODO: Add Real Follower/Subscriber Data

## What Works Now ✅
- Chat overlay (anonymous, works sometimes, quite flaky)
- Stream info (with API credentials)
- Demo follower/subscriber data for testing

## Goal 🎯
Replace demo data with real follower counts and recent followers/subscribers.

## Options Considered

| Approach | Time | Pros | Cons | Verdict |
|----------|------|------|------|---------|
| **OAuth + Your Server** | 3-4 hours | Official API, real-time, secure | Requires server setup | ⭐ **CHOSEN** |
| **Streamlabs Integration** | 4-6 hours | No OAuth needed | Third-party dependency, less reliable | ❌ Dismissed |
| **Complex Multi-User OAuth** | 15-20 hours | Enterprise-ready | Too complex for small team | ❌ Dismissed |

### Why We Chose OAuth

- ✅ You already have a server (makes it simple)
- ✅ Official Twitch API (most reliable long-term)
- ✅ Real-time EventSub webhooks
- ✅ Only 2-3 hours work for single-user setup
- ✅ Secure token-based system for OBS

## PR Strategy 🚀

### Branch Structure:
- `main` → Current static overlay (production)
- `docker-migration` → Phase 1 work (Docker infra)  
- `oauth-integration` → Phase 2 work (OAuth + real data)

### Pull Request Flow:
1. **PR #1**: `docker-migration` → `main` 
   - Docker infrastructure
   - Express server serving static files
   - **Same demo data** - zero functionality change
   - Deploy to `overlay-staging.touco.top`

2. **PR #2**: `oauth-integration` → `main`
   - OAuth flow + real Twitch API  
   - Multi-user support
   - Replace demo data with real data

### Benefits:
- ✅ **Risk isolation** - test Docker migration separately
- ✅ **Easier debugging** - separate infrastructure from feature changes  
- ✅ **Faster reviews** - smaller, focused PRs
- ✅ **Rollback safety** - can revert Docker or OAuth independently

## Recommended Solution ⭐

**Two-Phase Migration (6-8 hours total)**

Since you need multi-user support AND want to migrate from static files to Docker containers, this will be split into two successive PRs:

### **Phase 1: Docker Infrastructure Migration (3-4 hours)** 🐳
Migrate current overlay (with demo data) from static files to Docker container

### **Phase 2: OAuth + Real Data (3-4 hours)** 🔐  
Add multi-user OAuth and replace demo data with real Twitch API data

### Why This Approach?
- ✅ Official Twitch API (most reliable)
- ✅ Real-time events via EventSub
- ✅ Multi-user support (Toucotop + SThor + future users)
- ✅ Docker containerization (better deployment)
- ✅ Simple file-based storage (no database needed)
- ✅ Username allowlist security
- ✅ GitHub Actions deployment to Docker
- ✅ Parallel deployment (static current + Docker new)
- ✅ You control everything

### Implementation Plan

## **Phase 1: Docker Infrastructure Migration** 🐳

**Goal**: Migrate current overlay (with existing demo data) to Docker container

**1. Docker Setup (2-3 hours)**
- `Dockerfile` - Node.js container with Express serving built React app
- `docker-compose.yml` - Container config 
- Update GitHub Actions for Docker deployment
- New nginx config for Docker proxy
- Test deployment to `overlay-staging.touco.top`

**2. Express Server Setup (1-2 hours)**
- `src/server/index.js` - Express server serving static built files
- Update `package.json` with Express dependency
- **Keep existing demo data** - no API changes yet
- Verify overlay works identically in Docker

## **Phase 2: OAuth + Real Data** 🔐

**Goal**: Add multi-user OAuth and replace demo data with real Twitch API

**1. Backend OAuth (2-3 hours)**
- `src/server/auth.js` - OAuth flow (/auth, /callback, /admin)
- `src/server/storage.js` - File-based token management
- `src/server/overlay-api.js` - Token-protected data endpoints
- Docker volume for token storage

**2. Frontend Integration (1-2 hours)**
- Update `TwitchContext.tsx` to check for token in URL
- Connect to server's real-time EventSub stream
- Fallback to demo data if no/invalid token

**3. Infrastructure & Security**
- Environment variable allowlist: `ALLOWED_USERS=toucotop,sthor`
- Per-user JSON token files in Docker volume: `tokens/toucotop.json`, `tokens/sthor.json`
- File permissions for secure storage
- Server generates secret overlay token after OAuth
- Parallel deployment: `stream.touco.top` (current) + `stream-staging.touco.top` (new Docker)
- OBS uses: `stream-staging.touco.top/chat?token=overlay_toucotop_abc123`

### Files to Create/Modify
1. **Docker Infrastructure**
   - `Dockerfile` - Multi-stage build (Vite build + Express serve)
   - `docker-compose.yml` - Container orchestration with volumes
   - `.github/workflows/deploy-docker.yml` - New deployment workflow
   - `nginx/overlay-docker.conf` - Nginx config for Docker proxy

2. **Server code**
   - `src/server/` - New folder for backend routes
   - `src/server/index.js` - Main Express server
   - `src/server/storage.js` - File-based user token storage
   - `src/server/auth.js` - OAuth routes
   - `src/server/overlay-api.js` - Protected API endpoints
   - `package.json` - Add @twurple server dependencies

3. **Frontend updates**
   - `src/contexts/TwitchContext.tsx` - Add token validation
   - Connect to server API endpoints instead of demo data

### Deployment Strategy
1. **Current version**: Remains on `stream.touco.top` (static files, GitHub Actions)
2. **New version**: Deploy to `stream-staging.touco.top` (Docker container)
3. **Testing phase**: Both versions run in parallel
4. **Migration**: When ready, switch DNS/nginx to point to Docker version
5. **Rollback**: Easy fallback to static version if needed

### User Experience
1. **Admin setup**: Add usernames to `ALLOWED_USERS=toucotop,sthor` in Docker environment
2. **User auth**: Each user visits admin page, clicks "Connect Twitch", authorizes once
3. **Get personal token**: Server shows user their unique overlay token
4. **OBS setup**: Each user uses their token: `stream-staging.touco.top/chat?token=overlay_toucotop_abc123`
5. **Done**: Real data works automatically per user

### Dependencies by Phase

**Phase 1 (Docker Migration):**
```bash
npm install express
```

**Phase 2 (OAuth + Real Data):**
```bash  
npm install @twurple/auth @twurple/api @twurple/eventsub-http cors
```

### Development Setup

- **Local dev**: Vite dev server (port 5173) + Express server (port 3001)
- **Docker dev**: `docker-compose up` for full container testing
- **Production**: Single Docker container serves both frontend (built) and backend
- Environment variable: `ALLOWED_USERS=toucotop,sthor`
- Local testing: `localhost:5173/chat?token=overlay_toucotop_abc123`
- Docker testing: `stream-staging.touco.top/chat?token=overlay_toucotop_abc123`
