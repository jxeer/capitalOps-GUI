# CapitalOps Frontend

**A capital + governance operating layer for real estate development**

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)

---

## Overview

CapitalOps streamlines capital raising, project governance, and stakeholder communication for commercial real estate development. The platform provides:

- **Portfolio Management** - Track assets, projects, and capital allocations
- **Deal Management** - Monitor capital raising efforts and investor commitments
- **Project Execution** - Manage milestones, risk flags, and project phases
- **Vendor Control** - Manage vendors, work orders, and compliance
- **Investor Portal** - View allocations, track returns, and communicate
- **Professional Networking** - Connect with stakeholders and message directly

### Live Demo

**Backend URL:** https://capital-ops.replit.app  
**Default Login:** `admin` / `admin123`

---

## Features

### Capital Engine
- Deal pipeline tracking
- Investor alignment & profile management
- Allocation tracking (soft/hard commits)
- Return profile visualization

### Execution Control
- Project lifecycle management
- Milestone tracking with delays
- Risk flag monitoring with severity levels
- Budget vs. actual tracking

### Asset & Vendor Control
- Asset portfolio management
- Vendor performance tracking
- Work order assignment & tracking
- Maintenance & compliance scheduling

### Networking & Communication
- Professional connections system
- 1-on-1 messaging
- Connection request management
- Real-time conversation updates

### User Experience
- Dark/Light theme switching
- Responsive mobile design
- Profile customization (investor/vendor/developer)
- Profile image uploads via S3
- Real-time backend connection status

---

## Quick Start

### Prerequisites

- **Node.js 20+** (with npm)
- **Python 3.11+** (for Flask backend - optional)
- **npm** package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd capitalOps-frontend-GUI-main

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Development

```bash
# Start development server
npm run dev
```

This starts both:
- **Frontend:** Vite dev server on port 3000
- **Backend API:** Express proxy on port 3000

### Configuration

Create a `.env` file with:

```bash
# Backend connection
BACKEND_URL=http://localhost:3001

# Session management
SESSION_SECRET=change-me-in-production

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Frontend S3 upload (optional)
VITE_AWS_BUCKET_URL=http://localhost:3001
```

**Important:** The compat API key (`COMPAT_API_KEY`) must only be configured
server-side in the Express proxy (`server/.env`) or Railway environment
variables. It must **never** be exposed to the browser via `VITE_COMPAT_API_KEY`
or any other `VITE_*` prefix. The Express proxy injects `X-API-Key` on behalf
of authenticated requests — frontend code authenticates via httpOnly JWT
cookies only.

### Running the Flask Backend (Optional)

The frontend includes a fallback to in-memory storage if the Flask backend is unavailable.

```bash
# Navigate to backend directory
cd /Users/julianxeer/dev/work/freelance/capitalops/backend

# Install Python dependencies
pip install flask flask-sqlalchemy flask-cors flask-jwt-extended boto3 python-dotenv

# Create backend .env
cp .env.example .env
# Edit .env with your AWS credentials (or comment out for local dev)

# Run Flask backend
python -m flask run --host 0.0.0.0 --port 3001
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [PLAN.md](./PLAN.md) | Implementation phases and roadmap |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and API docs |
| [schema.ts](./shared/schema.ts) | Data model and TypeScript types |

---

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **TanStack Query** - Data fetching
- **Wouter** - Routing
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library ("new-york" style)

### Backend
- **Node.js 20** - Runtime
- **Express.js 5** - Web framework
- **Passport.js** - Authentication
- **scrypt** - Password hashing
- **JWT** - Session tokens
- **In-Memory Storage** - Fallback data
- **Flask Proxy** - External backend

---

## Pages

| Page | Description |
|------|-------------|
| `/` | Dashboard - Executive overview with KPIs |
| `/assets` | Asset portfolio management |
| `/projects` | Project tracking & milestones |
| `/deals` | Deal pipeline & capital raising |
| `/investors` | Investor profiles & alignment |
| `/allocations` | Commitment tracking |
| `/milestones` | Project milestones timeline |
| `/risk-flags` | Risk monitoring dashboard |
| `/vendors` | Vendor management |
| `/work-orders` | Maintenance & compliance tasks |
| `/profile` | User profile & preferences |
| `/connections` | Network & messaging |
| `/investor-portal` | Investor-specific view |
| `/auth` | Login & registration |

---

## Authentication

### Local Login

```bash
Username: admin
Password: admin123
```

### Google OAuth

Configure in `.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

Register redirect URI: `http://localhost:3000/api/auth/google/callback`

### Profile Types

The system supports three user profile types:

| Type | Fields | Use Case |
|------|--------|----------|
| `investor` | geographicFocus, investmentStage, targetReturn, checkSize, riskTolerance | Investors raising capital |
| `vendor` | serviceTypes, certifications, yearsOfExperience, averageProjectSize | Contractors &Service providers |
| `developer` | developmentFocus, teamSize, portfolioValue, developmentType | Real estate developers |

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Register new user |
| POST | `/api/login` | Login with credentials |
| POST | `/api/logout` | Logout |
| GET | `/api/user` | Get current user |
| GET | `/api/auth/google/status` | Check if Google OAuth enabled |

### Data Endpoints

All entities support standard CRUD operations:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entities` | List all |
| GET | `/api/entities/:id` | Get one |
| POST | `/api/entities` | Create |
| PUT | `/api/entities/:id` | Update |
| DELETE | `/api/entities/:id` | Delete |

**Entities:**
- portfolios, assets, projects, deals, investors
- allocations, milestones, risk-flags, vendors, work-orders
- connection-requests, conversations, messages

### Backend Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backend-status` | Check Flask backend connection |

---

## Development

### Running Type Checks

```bash
npm run check
```

### Linting

```bash
npm run lint
```

### Building for Production

```bash
npm run build
```

### Starting Production Server

```bash
npm run start
```

---

## Project Structure

```
client/src/
├── components/         # UI components (shadcn/ui + custom)
├── pages/              # Route components
├── hooks/              # Custom React hooks
├── lib/                # Utilities (queryClient, formatters, s3)
├── App.tsx             # Main app component
└── main.tsx            # React entry point

server/
├── index.ts            # Express server entry
├── routes.ts           # API routes with proxy/fallback
├── storage.ts          # In-memory storage with seed data
├── auth.ts             # Passport setup & password hashing
└── vite.ts             # Vite dev server integration

shared/
└── schema.ts           # Zod schemas & TypeScript types
```

---

## Seed Data

The in-memory storage includes realistic seed data:

| Entity | Count | Description |
|--------|-------|-------------|
| Portfolios | 1 | Top-level containers |
| Assets | 3 | Real estate assets |
| Projects | 6 | Development projects |
| Deals | 5 | Capital raising deals |
| Investors | 10 | Investor profiles |
| Allocations | 8 | Investor commitments |
| Milestones | 8 | Project milestones |
| Vendors | 5 | Service providers |
| Work Orders | 6 | Maintenance tasks |
| Risk Flags | 8 | Risk monitoring items |

**Seed ID Pattern:** `asset-001`, `proj-001`, `deal-001`, etc.

---

## AWS S3 Integration

Profile images and media uploads use AWS S3 with local fallback:

```bash
# Frontend
VITE_AWS_BUCKET_URL=http://localhost:3001

# Backend (Flask)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_BUCKET_NAME=capitalops-images
AWS_REGION=us-east-1
```

---

## Troubleshooting

### I can't connect to the backend

**Error:** "Backend unavailable, using local storage"

**Solution:** The frontend includes a fallback to in-memory storage. For full functionality, ensure the Flask backend is running on `BACKEND_URL`.

### Login isn't working

**Solution:** Verify you're using correct credentials:
- Username: `admin`
- Password: `admin123`

If still broken, check browser console for errors and verify cookies are enabled.

### Environment variables aren't loading

**Solution:** Restart the dev server after changing `.env` files. Vite caches variables at startup.

### Google sign-in not working

**Solution:** Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env`.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary and confidential.  
Unauthorized use, modification, or distribution is prohibited.

---

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review [PLAN.md](./PLAN.md) for implementation status
3. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details

---

**Built with React, TypeScript, and Vite**  
**Backend powered by Express.js and Flask**  
**© 2026 CapitalOps Platform**
