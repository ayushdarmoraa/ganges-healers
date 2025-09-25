# Ganges Healers - Healthcare Management System

A modern healthcare management system built with Next.js 14, TypeScript, and a comprehensive tech stack for managing medical services, appointments, and patient records.

> Project roadmap: See docs/IMPLEMENTATION_PLAN.md for the 24-week implementation plan and sprint breakdown.
> Engineering process: See docs/GUARDRAILS.md for change management and contribution rules.
> Authentication: See docs/AUTH_IMPLEMENTATION.md for NextAuth setup and testing guide.

## Tech Stack

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js with Google OAuth & Credentials
- **Form Management:** React Hook Form with Zod validation
- **Date Utilities:** date-fns
- **HTTP Client:** Axios
- **Toast Notifications:** Sonner

## Features

- 🔐 **Authentication System**
  - Google OAuth integration
  - Credentials-based login
  - Role-based access control (USER/ADMIN)
  - Session management

- 🏥 **Healthcare Services**
  - Service catalog with pricing
  - Appointment booking system
  - Patient dashboard
  - Medical records management

- 🎨 **Modern UI/UX**
  - Responsive design with Tailwind CSS
  - Accessible UI components from shadcn/ui
  - Dark/light mode support
  - Toast notifications

- 📊 **Dashboard Features**
  - Patient overview
  - Appointment management
  - Medical records access
  - Profile management

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Google OAuth credentials (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ganges-healers
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/ganges_healers"
   
   # NextAuth
   AUTH_SECRET="your-auth-secret-here"
   NEXTAUTH_URL="http://localhost:3000"
   
   # Google OAuth (optional)
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   
   # Razorpay (for payments - optional)
   RAZORPAY_KEY_ID="your-razorpay-key-id"
   RAZORPAY_KEY_SECRET="your-razorpay-key-secret"
   
   # Redis (optional)
   REDIS_URL="redis://localhost:6379"
   ```

4. **Set up the database**
   ```bash
   # Run database migrations
   npm run prisma:migrate
   
   # Generate Prisma client
   npx prisma generate
   
   # Seed the database with initial data
   npm run seed
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application for production
- `npm start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run seed` - Seed the database with initial data

## Database Schema

The application uses the following main models:

- **User** - User accounts with authentication
- **Account** - OAuth account linking
- **Session** - User sessions
- **VerificationToken** - Email verification tokens

### Default Admin Account

After running the seed script, you can log in with:
- **Email:** admin@ganges-healers.com
- **Password:** admin123

## Project Structure

```
ganges-healers/
├── src/
│   ├── app/                    # App Router pages
│   │   ├── api/               # API routes
│   │   ├── auth/              # Authentication pages
│   │   ├── dashboard/         # Dashboard pages
│   │   ├── services/          # Services pages
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Homepage
│   ├── components/            # Reusable components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── navbar.tsx        # Navigation component
│   │   └── providers.tsx     # Context providers
│   ├── lib/                  # Utility libraries
│   │   ├── auth.ts          # NextAuth configuration
│   │   ├── prisma.ts        # Prisma client
│   │   └── utils.ts         # Utility functions
│   └── types/               # TypeScript type definitions
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts             # Database seeding script
├── public/                 # Static assets
└── package.json           # Dependencies and scripts
```

## Authentication

The app supports two authentication methods:

1. **Google OAuth** - Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
2. **Credentials** - Email/password authentication with bcrypt hashing

## Deployment

### Environment Setup

1. Set up a PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Build and deploy the application

### Database Migration

```bash
# Run migrations in production
npm run prisma:migrate

# Generate Prisma client
npx prisma generate
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team

---

Built with ❤️ using Next.js 14 and modern web technologies.
