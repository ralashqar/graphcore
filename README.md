# GraphCore

An AI-powered game content authoring platform that transforms natural language prompts into structured game content using specialized AI agents. Built with React, TypeScript, Supabase, and Three.js.

## 🚀 Features

- **AI-Powered Content Generation**: Convert natural language prompts into game-ready content patches
- **Visual Asset Creation**: Generate concept art, character portraits, and environment visualizations
- **Cinematic Script Generation**: Create UGC-optimized video content with psychological hooks
- **World Building**: Procedurally generate interconnected game worlds and environments
- **3D Visualization**: Interactive 3D preview of generated content using Three.js
- **Real-time Collaboration**: Live workspace sharing and content editing
- **UGC Psychology**: Viral content optimization using research-backed psychological principles

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **3D Graphics**: Three.js, React Three Fiber, React Three Drei
- **Backend**: Supabase (PostgreSQL, Edge Functions, Real-time)
- **AI Providers**: OpenAI (GPT-4, o1 models), Fal.ai (image generation)
- **State Management**: Zustand
- **UI Components**: Custom components with GSAP animations
- **Build Tools**: Vite, TypeScript
- **Testing**: Node.js test runner

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Docker Desktop** (for local Supabase development)
- **Git**

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd graphcore
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # For local development
   cp .env.local.example .env.local

   # For hosted development
   cp .env.example .env
   ```

4. **Start Supabase locally**
   ```bash
   npm run supabase:start
   ```

5. **Configure environment variables**
   ```bash
   # Get the local Supabase keys
   npm run supabase:status

   # Update .env.local with the keys from the status output
   ```

6. **Set up AI provider secrets** (optional, for AI features)
   ```bash
   # Set local secrets for AI functions
   npx supabase secrets set OPENAI_API_KEY=your_openai_key
   npx supabase secrets set FAL_KEY=your_fal_key
   ```

7. **Start the development server**
   ```bash
   npm run dev
   ```

8. **Open your browser** and navigate to `http://localhost:5173`

## 🔧 Development Setup

### Local Supabase Development

GraphCore uses Supabase for its backend. For local development:

```bash
# Start the local Supabase stack
npm run supabase:start

# Check status and get connection details
npm run supabase:status

# Reset the database (after schema changes)
npm run supabase:db:reset

# Serve edge functions locally
npm run supabase:functions:serve
```

### Environment Variables

#### Local Development (`.env.local`)
```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-local-anon-key
```

#### Hosted Development (`.env`)
```bash
VITE_SUPABASE_URL=https://znwdatidqdkzidempvkt.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_5EkU5knI16oAgqxPMYPxnw_Sb8QOgdS
```

### AI Provider Setup

To enable AI-powered features, set up the following secrets:

```bash
# For local development
npx supabase secrets set OPENAI_API_KEY=your_openai_key
npx supabase secrets set FAL_KEY=your_fal_key

# For hosted deployment
npx supabase secrets set --project-ref znwdatidqdkzidempvkt OPENAI_API_KEY=your_openai_key
npx supabase secrets set --project-ref znwdatidqdkzidempvkt FAL_KEY=your_fal_key
```

## 📜 Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build

# Testing
npm run test             # Run all tests

# Supabase
npm run supabase:start   # Start local Supabase stack
npm run supabase:stop    # Stop local Supabase stack
npm run supabase:status  # Show Supabase status
npm run supabase:db:reset # Reset local database
npm run supabase:functions:serve # Serve edge functions locally
npm run supabase:link    # Link to hosted project
npm run supabase:db:push # Push migrations to hosted project
```

## 📁 Project Structure

```
graphcore/
├── docs/                    # Documentation
│   ├── 01-product-ir.md
│   ├── 09-current-architecture.md
│   ├── 10-current-data-model.md
│   └── ugc-mastery/         # UGC psychology research
├── public/                  # Static assets
├── scripts/                 # Build and utility scripts
├── src/
│   ├── application/         # Application services
│   │   └── services/
│   ├── core/                # Core business logic
│   │   ├── generationWorkflow.ts
│   │   └── providerQueue.ts
│   ├── data/                # Data access layer
│   │   ├── aiGateway.ts
│   │   ├── auth.ts
│   │   └── graphcoreRepository.ts
│   ├── domain/              # Domain models and logic
│   │   ├── assets.ts
│   │   ├── cinematics.ts
│   │   └── environmentAssembly.ts
│   ├── features/            # Feature modules
│   │   ├── content/
│   │   ├── graph/
│   │   └── world/
│   ├── infrastructure/      # Infrastructure adapters
│   ├── shared/              # Shared utilities
│   ├── state/               # Global state management
│   ├── utils/               # Utility functions
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # App entry point
│   └── style.css            # Global styles
├── supabase/
│   ├── config.toml          # Supabase configuration
│   ├── functions/           # Edge functions
│   │   ├── ai-openai/
│   │   └── ai-fal/
│   ├── migrations/          # Database migrations
│   └── seed.sql             # Database seed data
├── .env.example             # Environment variables template
├── .env.local.example       # Local environment template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── Agents.md                # AI agents documentation
```

## 🧪 Testing

Run the test suite:

```bash
npm run test
```

Tests cover:
- Provider queue functionality
- Generation workflows
- Domain logic (UGC presets, art styles, cinematics)
- Visual asset generation
- World presentation
- Content workspace presentation

## 🚀 Deployment

### Local Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Preview the build:
   ```bash
   npm run preview
   ```

### Production Deployment

1. Link to your Supabase project:
   ```bash
   npx supabase login
   npm run supabase:link
   ```

2. Push database changes:
   ```bash
   npm run supabase:db:push
   ```

3. Deploy edge functions:
   ```bash
   npx supabase functions deploy ai-openai --no-verify-jwt
   npx supabase functions deploy ai-fal --no-verify-jwt
   ```

4. Deploy the frontend to your preferred hosting platform (Vercel, Netlify, etc.)

## 📚 Documentation

- **[Current Architecture](./docs/09-current-architecture.md)** - System architecture and component organization
- **[Data Model](./docs/10-current-data-model.md)** - Database schema and data relationships
- **[Live Workspace Flow](./docs/11-live-workspace-and-game-flow.md)** - User interaction patterns
- **[AI Agents](./Agents.md)** - Comprehensive AI agent documentation
- **[UGC Mastery](./docs/ugc-mastery/README.md)** - UGC psychology and virality research

### Reading Order for New Developers

1. [Current Architecture](./docs/09-current-architecture.md)
2. [Current Data Model](./docs/10-current-data-model.md)
3. [Live Workspace and Game Flow](./docs/11-live-workspace-and-game-flow.md)
4. [AI Agents](./Agents.md)
5. [UGC Mastery](./docs/ugc-mastery/README.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and add tests
4. Run tests: `npm run test`
5. Commit your changes: `git commit -m 'Add some feature'`
6. Push to the branch: `git push origin feature/your-feature-name`
7. Open a pull request

### Development Guidelines

- Follow the existing code style and patterns
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PRs
- Use conventional commit messages

## 📄 License

This project is private and proprietary.

## 🆘 Troubleshooting

### Common Issues

**Supabase not starting:**
- Ensure Docker Desktop is running
- Check that ports 54321 and 54322 are available

**AI features not working:**
- Verify API keys are set in Supabase secrets
- Check function logs: `npx supabase functions logs ai-openai`

**Build errors:**
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npx tsc --noEmit`

**Environment variable issues:**
- Ensure `.env.local` exists for local development
- Restart the dev server after changing environment variables

### Getting Help

- Check the [documentation](./docs/) for detailed explanations
- Review the [AI agents documentation](./Agents.md) for AI feature setup
- Check Supabase function logs for backend issues

---

Built with ❤️ using modern web technologies and AI-powered content generation.</content>
<parameter name="filePath">/Users/ankit/GitHub/graphcore/README.md