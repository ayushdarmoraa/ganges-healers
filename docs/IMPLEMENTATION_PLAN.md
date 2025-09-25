# Implementation Plan
## Ganges Healers - Complete Development Roadmap

---

## 1. Executive Summary

### Implementation Overview
This document provides a detailed 24-week implementation plan for Ganges Healers, broken down into 12 two-week sprints with specific deliverables, task assignments, and success criteria. The plan follows an agile methodology with continuous integration and iterative development.

### Key Deliverables Timeline
- **Week 4**: Development environment and CI/CD pipeline
- **Week 8**: Core authentication and user management
- **Week 12**: Booking system and service marketplace (MVP)
- **Week 16**: Payment integration and VIP membership
- **Week 20**: Community platform and content management
- **Week 24**: Production deployment and launch

---

## 2. Pre-Implementation Phase (Week 0)

### 2.1 Team Formation & Onboarding

#### Required Team Members
```
Immediate Hires (Week 0):
1. Technical Lead/Architect (1)
   - Skills: Node.js, AWS, System Design
   - Responsibility: Architecture decisions, code reviews
   
2. Senior Backend Engineers (2)
   - Skills: Node.js, PostgreSQL, Microservices
   - Responsibility: API development, database design
   
3. Senior Frontend Engineer (1)
   - Skills: React, Next.js, TypeScript
   - Responsibility: UI implementation, state management
   
4. Full-Stack Developer (1)
   - Skills: JavaScript, React, Node.js
   - Responsibility: Feature development, integration
   
5. DevOps Engineer (1)
   - Skills: AWS, Docker, Kubernetes, CI/CD
   - Responsibility: Infrastructure, deployment
   
6. QA Engineer (1)
   - Skills: Test automation, Manual testing
   - Responsibility: Quality assurance, test plans
   
7. UI/UX Designer (1)
   - Skills: Figma, Design systems
   - Responsibility: Design, prototypes
   
8. Project Manager (1)
   - Skills: Agile, Scrum, JIRA
   - Responsibility: Sprint planning, coordination
```

### 2.2 Development Environment Setup

#### Local Development Setup
```bash
# Repository Structure
ganges-healers/
├── apps/
│   ├── web/                 # Next.js frontend
│   ├── admin/               # Admin panel
│   └── mobile-web/          # PWA
├── services/
│   ├── auth/                # Auth service
│   ├── booking/             # Booking service
│   ├── payment/             # Payment service
│   ├── content/             # Content service
│   ├── notification/        # Notification service
│   ├── user/                # User service
│   ├── community/           # Community service
│   └── analytics/           # Analytics service
├── packages/
│   ├── ui/                  # Shared UI components
│   ├── utils/               # Shared utilities
│   ├── types/               # TypeScript types
│   └── config/              # Shared configs
├── infrastructure/
│   ├── docker/              # Docker configs
│   ├── kubernetes/          # K8s manifests
│   └── terraform/           # IaC scripts
├── scripts/
│   ├── setup/               # Setup scripts
│   └── deploy/              # Deployment scripts
└── docs/                    # Documentation
```

#### Tools & Software Requirements
```yaml
Development Tools:
  IDEs:
    - VS Code with extensions
    - WebStorm (optional)
  
  Version Control:
    - Git
    - GitHub (repository hosting)
  
  Package Managers:
    - Node.js 18+
    - npm/yarn/pnpm
    - Docker Desktop
  
  Database Tools:
    - pgAdmin 4
    - MongoDB Compass
    - Redis Commander
  
  API Testing:
    - Postman/Insomnia
    - Thunder Client (VS Code)
  
  Design Tools:
    - Figma (design files)
    - Storybook (component library)
```

### 2.3 Project Setup Checklist

```markdown
## Week 0 Checklist

### Infrastructure Setup
- [ ] Create AWS account and set up billing alerts
- [ ] Set up GitHub organization and repositories
- [ ] Configure GitHub Actions for CI/CD
- [ ] Set up JIRA/Linear for project management
- [ ] Create Slack workspace for team communication
- [ ] Set up shared Google Drive for documentation

### Development Setup
- [ ] Create monorepo with Nx/Turborepo
- [ ] Set up ESLint and Prettier configurations
- [ ] Configure TypeScript for all projects
- [ ] Set up Husky for git hooks
- [ ] Create Docker Compose for local development
- [ ] Set up environment variable management

### Documentation
- [ ] Create README files for each service
- [ ] Set up API documentation with Swagger
- [ ] Create coding standards document
- [ ] Write git workflow documentation
- [ ] Create onboarding guide for new developers
```

---

## 3. Sprint Planning (12 Sprints × 2 Weeks)

## Sprint 1: Foundation & Infrastructure (Weeks 1-2)

### Sprint Goals
- Set up complete development infrastructure
- Configure CI/CD pipelines
- Establish database schemas
- Create base project structure

### Task Breakdown

#### 3.1.1 Infrastructure Tasks (DevOps Engineer)

**Week 1 - AWS Infrastructure**
```yaml
Day 1-2: AWS Account Setup
  Tasks:
    - Create AWS organization structure
    - Set up IAM roles and policies
    - Configure AWS CLI and credentials
    - Set up cost allocation tags
  Deliverable: AWS account ready for development

Day 3-4: Network Infrastructure
  Tasks:
    - Create VPC with public/private subnets
    - Configure security groups
    - Set up NAT Gateway
    - Configure Route 53 for DNS
  Deliverable: Network infrastructure provisioned

Day 5: Container Registry & Storage
  Tasks:
    - Set up ECR repositories
    - Configure S3 buckets for assets
    - Set up CloudFront distribution
    - Configure backup S3 buckets
  Deliverable: Storage infrastructure ready
```

**Week 2 - CI/CD Pipeline**
```yaml
Day 6-7: GitHub Actions Setup
  Tasks:
    - Create workflow templates
    - Set up branch protection rules
    - Configure secret management
    - Create deployment workflows
  Deliverable: CI/CD pipeline operational

Day 8-9: Monitoring Setup
  Tasks:
    - Install Prometheus and Grafana
    - Configure CloudWatch dashboards
    - Set up log aggregation
    - Create alert rules
  Deliverable: Monitoring infrastructure ready

Day 10: Documentation
  Tasks:
    - Document infrastructure setup
    - Create runbooks
    - Write deployment guides
  Deliverable: Infrastructure documentation
```

#### 3.1.2 Database Setup (Senior Backend Engineer 1)

**Week 1 - Database Design**
```sql
-- Day 1-2: Core Schema Creation
CREATE DATABASE ganges_healers;

-- Users and Authentication
CREATE SCHEMA auth;
CREATE TABLE auth.users (...);
CREATE TABLE auth.sessions (...);
CREATE TABLE auth.refresh_tokens (...);

-- Services and Bookings
CREATE SCHEMA services;
CREATE TABLE services.services (...);
CREATE TABLE services.healers (...);
CREATE TABLE services.appointments (...);

-- Payments
CREATE SCHEMA payments;
CREATE TABLE payments.transactions (...);
CREATE TABLE payments.invoices (...);

-- Day 3-4: Indexes and Constraints
CREATE INDEX idx_users_email ON auth.users(email);
CREATE INDEX idx_appointments_date ON services.appointments(scheduled_at);
CREATE INDEX idx_healers_service ON services.healers(service_id);

-- Day 5: Stored Procedures and Functions
CREATE FUNCTION check_availability(...);
CREATE FUNCTION calculate_commission(...);
CREATE PROCEDURE book_appointment(...);
```

**Week 2 - MongoDB Setup**
```javascript
// Day 6-7: Collections and Schemas
db.createCollection("audio_library", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["title", "category", "file_url"],
      properties: {...}
    }
  }
});

db.createCollection("blog_posts", {...});
db.createCollection("activity_logs", {...});

// Day 8-9: Indexes
db.audio_library.createIndex({ category: 1, created_at: -1 });
db.blog_posts.createIndex({ slug: 1 }, { unique: true });
db.activity_logs.createIndex({ user_id: 1, timestamp: -1 });

// Day 10: Data Migration Scripts
// Import sample data
// Test backup and restore procedures
```

#### 3.1.3 Base Application Setup (Tech Lead + Frontend Engineer)

**Week 1 - Frontend Foundation**
```typescript
// Day 1-2: Next.js Setup
npx create-next-app@latest ganges-healers-web --typescript --tailwind --app

// Configure folder structure
src/
├── app/
├── components/
│   ├── ui/           // Base UI components
│   ├── features/     // Feature components
│   └── layouts/      // Layout components
├── lib/
│   ├── api/         // API client
│   ├── hooks/       // Custom hooks
│   └── utils/       // Utilities
└── styles/

// Day 3-4: Component Library Setup
// Install Shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card form input

// Create base components
export const Button = (...);
export const Card = (...);
export const Form = (...);

// Day 5: State Management Setup
// Install Redux Toolkit
npm install @reduxjs/toolkit react-redux

// Configure store
const store = configureStore({
  reducer: {
    auth: authSlice,
    booking: bookingSlice,
    ui: uiSlice
  }
});
```

**Week 2 - Backend Foundation**
```javascript
// Day 6-7: Microservice Template
// Create base service structure
class BaseService {
  constructor(name) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }
  
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(express.json());
  }
}

// Day 8-9: Shared Libraries
// Create shared packages
@ganges-healers/logger
@ganges-healers/auth-middleware
@ganges-healers/database
@ganges-healers/queue

// Day 10: Service Communication
// Set up RabbitMQ
const amqp = require('amqplib');
const connection = await amqp.connect('amqp://localhost');
const channel = await connection.createChannel();
```

### Sprint 1 Deliverables
- ✅ Complete AWS infrastructure provisioned
- ✅ CI/CD pipeline operational
- ✅ Database schemas created and indexed
- ✅ Base application structure established
- ✅ Development environment fully configured

---

## Sprint 2: Authentication & User Management (Weeks 3-4)

### Sprint Goals
- Implement complete authentication system
- Build user management features
- Create user profile functionality
- Set up email/SMS verification

### Task Breakdown

#### 3.2.1 Auth Service Implementation (Senior Backend Engineer 1)

**Week 3 - Core Authentication**
```javascript
// Day 11-12: JWT Implementation
class AuthService {
  generateTokens(userId) {
    const accessToken = jwt.sign(
      { sub: userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { sub: userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    
    return { accessToken, refreshToken };
  }
  
  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { valid: true, userId: decoded.sub };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

// Day 13-14: Registration Flow
async function register(req, res) {
  const { email, password, phone, firstName, lastName } = req.body;
  
  // Validate input
  const validation = await validateRegistration(req.body);
  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }
  
  // Check existing user
  const existingUser = await User.findOne({ 
    $or: [{ email }, { phone }] 
  });
  if (existingUser) {
    return res.status(409).json({ 
      error: 'User already exists' 
    });
  }
  
  // Hash password
  const hashedPassword = await argon2.hash(password);
  
  // Create user
  const user = await User.create({
    email,
    phone,
    password: hashedPassword,
    firstName,
    lastName
  });
  
  // Send verification email
  await sendVerificationEmail(user);
  
  // Generate tokens
  const tokens = generateTokens(user.id);
  
  return res.status(201).json({
    user: sanitizeUser(user),
    tokens
  });
}

// Day 15: Login Implementation
async function login(req, res) {
  const { email, password } = req.body;
  
  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ 
      error: 'Invalid credentials' 
    });
  }
  
  // Verify password
  const validPassword = await argon2.verify(
    user.password, 
    password
  );
  if (!validPassword) {
    return res.status(401).json({ 
      error: 'Invalid credentials' 
    });
  }
  
  // Update last login
  await User.updateOne(
    { _id: user.id },
    { lastLoginAt: new Date() }
  );
  
  // Generate tokens
  const tokens = generateTokens(user.id);
  
  // Create session
  await Session.create({
    userId: user.id,
    token: tokens.refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  
  return res.json({
    user: sanitizeUser(user),
    tokens
  });
}
```

**Week 4 - Advanced Authentication**
```javascript
// Day 16-17: OAuth Implementation
// Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ 
      googleId: profile.id 
    });
    
    if (!user) {
      user = await User.create({
        googleId: profile.id,
        email: profile.emails[0].value,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        avatar: profile.photos[0].value,
        emailVerified: true
      });
    }
    
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Day 18-19: Password Reset
async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if user exists
    return { success: true };
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Save token
  await PasswordReset.create({
    userId: user.id,
    token: hashedToken,
    expiresAt: new Date(Date.now() + 3600000) // 1 hour
  });
  
  // Send email
  await sendPasswordResetEmail(user.email, resetToken);
  
  return { success: true };
}

// Day 20: Two-Factor Authentication
async function enable2FA(userId) {
  const secret = speakeasy.generateSecret({
    name: 'Ganges Healers'
  });
  
  await User.updateOne(
    { _id: userId },
    { 
      twoFactorSecret: secret.base32,
      twoFactorEnabled: false
    }
  );
  
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  
  return { qrCode, secret: secret.base32 };
}
```

#### 3.2.2 Frontend Auth Implementation (Frontend Engineer)

**Week 3 - Auth UI Components**
```typescript
// Day 11-12: Login Form
export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });
  
  async function onSubmit(data: LoginInput) {
    setIsLoading(true);
    try {
      const response = await authApi.login(data);
      
      // Store tokens
      tokenStorage.setAccessToken(response.tokens.accessToken);
      tokenStorage.setRefreshToken(response.tokens.refreshToken);
      
      // Update Redux state
      dispatch(setUser(response.user));
      
      // Redirect
      router.push('/dashboard');
    } catch (error) {
      toast.error('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  }
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input 
                  type="email" 
                  placeholder="you@example.com"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input 
                  type="password" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </Form>
  );
}

// Day 13-14: Registration Form
export function RegistrationForm() {
  const [step, setStep] = useState(1);
  
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      acceptTerms: false
    }
  });
  
  return (
    <div className="space-y-6">
      {step === 1 && (
        <StepOne form={form} onNext={() => setStep(2)} />
      )}
      
      {step === 2 && (
        <StepTwo form={form} onNext={() => setStep(3)} />
      )}
      
      {step === 3 && (
        <StepThree form={form} onSubmit={handleSubmit} />
      )}
      
      <ProgressIndicator currentStep={step} totalSteps={3} />
    </div>
  );
}

// Day 15: Protected Routes
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  return user ? <>{children}</> : null;
}
```

**Week 4 - User Profile**
```typescript
// Day 16-17: Profile Management
export function ProfileSettings() {
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  
  const form = useForm({
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
      bio: user?.bio || ''
    }
  });
  
  async function updateProfile(data: ProfileInput) {
    setIsUpdating(true);
    try {
      const updated = await userApi.updateProfile(data);
      dispatch(updateUser(updated));
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(updateProfile)}>
            {/* Form fields */}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Day 18-19: Avatar Upload
export function AvatarUpload() {
  const [uploading, setUploading] = useState(false);
  
  async function handleUpload(file: File) {
    setUploading(true);
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData
      });
      
      const { avatarUrl } = await response.json();
      dispatch(updateUser({ avatarUrl }));
      
      toast.success('Avatar updated');
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }
  
  return (
    <div className="flex flex-col items-center space-y-4">
      <Avatar className="h-24 w-24">
        <AvatarImage src={user?.avatarUrl} />
        <AvatarFallback>
          {user?.firstName?.[0]}
          {user?.lastName?.[0]}
        </AvatarFallback>
      </Avatar>
      
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleUpload(e.target.files[0]);
          }
        }}
        disabled={uploading}
      />
    </div>
  );
}

// Day 20: Email/Phone Verification
export function VerificationModal() {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  async function verifyCode() {
    setIsVerifying(true);
    try {
      await authApi.verifyEmail(code);
      toast.success('Email verified successfully');
      onClose();
    } catch (error) {
      toast.error('Invalid verification code');
    } finally {
      setIsVerifying(false);
    }
  }
  
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify Your Email</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p>Enter the 6-digit code sent to your email</p>
          
          <OTPInput
            value={code}
            onChange={setCode}
            numInputs={6}
            separator={<span>-</span>}
          />
          
          <Button 
            onClick={verifyCode}
            disabled={code.length !== 6 || isVerifying}
          >
            Verify
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Sprint 2 Deliverables
- ✅ Complete authentication system with JWT
- ✅ User registration and login flows
- ✅ Password reset functionality
- ✅ Email/SMS verification
- ✅ User profile management
- ✅ OAuth integration (Google)

---

## Sprint 3: Service Marketplace & Booking System (Weeks 5-6)

### Sprint Goals
- Build service catalog and discovery
- Implement booking system
- Create healer profiles
- Build availability management

### Task Breakdown

#### 3.3.1 Service Management (Senior Backend Engineer 2)

**Week 5 - Service Catalog**
```javascript
// Day 21-22: Service CRUD Operations
class ServiceController {
  async getServices(req, res) {
    const { category, search, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (category) query.category = category;
    if (search) {
      query.$text = { $search: search };
    }
    
    const services = await Service
      .find(query)
      .populate('healers')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ popularity: -1 });
    
    const total = await Service.countDocuments(query);
    
    res.json({
      services,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  }
  
  async getServiceDetails(req, res) {
    const { slug } = req.params;
    
    const service = await Service
      .findOne({ slug })
      .populate({
        path: 'healers',
        select: 'user rating experience specializations',
        populate: {
          path: 'user',
          select: 'firstName lastName avatar'
        }
      })
      .populate('programs')
      .populate('reviews');
    
    if (!service) {
      return res.status(404).json({ 
        error: 'Service not found' 
      });
    }
    
    // Increment view count
    await Service.updateOne(
      { _id: service._id },
      { $inc: { viewCount: 1 } }
    );
    
    res.json(service);
  }
}

// Day 23-24: Healer Management
class HealerController {
  async createHealerProfile(req, res) {
    const { userId } = req.user;
    const {
      specializations,
      certifications,
      experience,
      bio,
      bankDetails
    } = req.body;
    
    // Validate certifications
    for (const cert of certifications) {
      const isValid = await verifyCertification(cert);
      if (!isValid) {
        return res.status(400).json({
          error: `Invalid certification: ${cert.name}`
        });
      }
    }
    
    // Encrypt bank details
    const encryptedBankDetails = await encrypt(bankDetails);
    
    const healer = await Healer.create({
      userId,
      specializations,
      certifications,
      experienceYears: experience,
      bio,
      bankDetails: encryptedBankDetails,
      status: 'pending'
    });
    
    // Notify admin for approval
    await notifyAdmin('NEW_HEALER_REGISTRATION', healer);
    
    res.status(201).json(healer);
  }
  
  async updateAvailability(req, res) {
    const { healerId } = req.params;
    const { availability } = req.body;
    
    // Validate healer ownership
    if (req.user.healerId !== healerId) {
      return res.status(403).json({ 
        error: 'Unauthorized' 
      });
    }
    
    // Update availability in Redis
    const key = `availability:${healerId}`;
    await redis.setex(
      key,
      86400, // 24 hours
      JSON.stringify(availability)
    );
    
    // Update database
    await Healer.updateOne(
      { _id: healerId },
      { availability }
    );
    
    res.json({ success: true });
  }
}

// Day 25: Search & Filtering
class SearchService {
  async searchServices(query, filters = {}) {
    const searchPipeline = [
      {
        $search: {
          index: "services_search",
          text: {
            query: query,
            path: ["name", "description", "tags"]
          }
        }
      }
    ];
    
    if (filters.category) {
      searchPipeline.push({
        $match: { category: filters.category }
      });
    }
    
    if (filters.priceRange) {
      searchPipeline.push({
        $match: {
          basePrice: {
            $gte: filters.priceRange.min,
            $lte: filters.priceRange.max
          }
        }
      });
    }
    
    if (filters.rating) {
      searchPipeline.push({
        $match: { 
          averageRating: { $gte: filters.rating } 
        }
      });
    }
    
    searchPipeline.push(
      {
        $lookup: {
          from: "healers",
          localField: "_id",
          foreignField: "serviceId",
          as: "healers"
        }
      },
      {
        $addFields: {
          score: { $meta: "searchScore" }
        }
      },
      {
        $sort: { score: -1 }
      }
    );
    
    return await Service.aggregate(searchPipeline);
  }
}
```

**Week 6 - Booking System**
```javascript
// Day 26-27: Booking Creation
class BookingService {
  async createBooking(bookingData) {
    const {
      userId,
      healerId,
      serviceId,
      scheduledAt,
      duration
    } = bookingData;
    
    // Check availability
    const isAvailable = await this.checkAvailability(
      healerId,
      scheduledAt,
      duration
    );
    
    if (!isAvailable) {
      throw new Error('Slot not available');
    }
    
    // Start transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Create booking
      const booking = await Appointment.create([{
        userId,
        healerId,
        serviceId,
        scheduledAt,
        durationMinutes: duration,
        status: 'pending'
      }], { session });
      
      // Block calendar slot
      await this.blockSlot(
        healerId,
        scheduledAt,
        duration,
        session
      );
      
      // Send confirmation email
      await this.sendConfirmation(booking[0]);
      
      // Create calendar event
      const meetingLink = await this.createMeeting(booking[0]);
      
      // Update booking with meeting link
      await Appointment.updateOne(
        { _id: booking[0]._id },
        { meetingLink },
        { session }
      );
      
      await session.commitTransaction();
      return booking[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  async checkAvailability(healerId, startTime, duration) {
    const endTime = new Date(
      startTime.getTime() + duration * 60000
    );
    
    // Check healer's availability rules
    const healer = await Healer.findById(healerId);
    const dayOfWeek = startTime.getDay();
    const timeSlot = healer.availability[dayOfWeek];
    
    if (!timeSlot || !timeSlot.available) {
      return false;
    }
    
    // Check for conflicts
    const conflicts = await Appointment.find({
      healerId,
      status: { $in: ['confirmed', 'scheduled'] },
      $or: [
        {
          scheduledAt: {
            $gte: startTime,
            $lt: endTime
          }
        },
        {
          $expr: {
            $and: [
              { $lte: ['$scheduledAt', startTime] },
              {
                $gt: [
                  {
                    $add: [
                      '$scheduledAt',
                      { $multiply: ['$durationMinutes', 60000] }
                    ]
                  },
                  startTime
                ]
              }
            ]
          }
        }
      ]
    });
    
    return conflicts.length === 0;
  }
}

// Day 28-29: Booking Management
class BookingController {
  async updateBooking(req, res) {
    const { bookingId } = req.params;
    const { scheduledAt } = req.body;
    
    const booking = await Appointment.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ 
        error: 'Booking not found' 
      });
    }
    
    // Check if user owns the booking
    if (booking.userId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Unauthorized' 
      });
    }
    
    // Check if rescheduling is allowed
    const hoursUntilAppointment = 
      (booking.scheduledAt - Date.now()) / 3600000;
    
    if (hoursUntilAppointment < 24) {
      return res.status(400).json({
        error: 'Cannot reschedule within 24 hours'
      });
    }
    
    // Check new slot availability
    const isAvailable = await bookingService.checkAvailability(
      booking.healerId,
      scheduledAt,
      booking.durationMinutes
    );
    
    if (!isAvailable) {
      return res.status(409).json({
        error: 'New slot is not available'
      });
    }
    
    // Update booking
    booking.scheduledAt = scheduledAt;
    booking.status = 'rescheduled';
    await booking.save();
    
    // Notify healer
    await notificationService.notify(
      booking.healerId,
      'BOOKING_RESCHEDULED',
      booking
    );
    
    res.json(booking);
  }
  
  async cancelBooking(req, res) {
    const { bookingId } = req.params;
    const { reason } = req.body;
    
    const booking = await Appointment.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ 
        error: 'Booking not found' 
      });
    }
    
    // Check cancellation policy
    const hoursUntilAppointment = 
      (booking.scheduledAt - Date.now()) / 3600000;
    
    let refundAmount = 0;
    if (hoursUntilAppointment >= 48) {
      refundAmount = booking.price; // Full refund
    } else if (hoursUntilAppointment >= 24) {
      refundAmount = booking.price * 0.5; // 50% refund
    }
    
    // Process cancellation
    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();
    await booking.save();
    
    // Process refund if applicable
    if (refundAmount > 0) {
      await paymentService.processRefund(
        booking.paymentId,
        refundAmount
      );
    }
    
    // Free up the slot
    await bookingService.freeSlot(
      booking.healerId,
      booking.scheduledAt,
      booking.durationMinutes
    );
    
    // Send notifications
    await Promise.all([
      notificationService.notify(
        booking.userId,
        'BOOKING_CANCELLED',
        booking
      ),
      notificationService.notify(
        booking.healerId,
        'BOOKING_CANCELLED_BY_USER',
        booking
      )
    ]);
    
    res.json({
      success: true,
      refundAmount
    });
  }
}

// Day 30: Calendar Integration
class CalendarService {
  async createGoogleCalendarEvent(booking) {
    const event = {
      summary: `Healing Session - ${booking.service.name}`,
      description: `Session with ${booking.healer.name}`,
      start: {
        dateTime: booking.scheduledAt.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: new Date(
          booking.scheduledAt.getTime() + 
          booking.durationMinutes * 60000
        ).toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      attendees: [
        { email: booking.user.email },
        { email: booking.healer.email }
      ],
      conferenceData: {
        createRequest: {
          requestId: booking._id.toString(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };
    
    const calendar = google.calendar({ version: 'v3' });
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1
    });
    
    return response.data;
  }
}
```

#### 3.3.2 Frontend Service & Booking UI (Frontend Engineer + Full-Stack Developer)

**Week 5 - Service Catalog UI**
```typescript
// Day 21-22: Service Listing Page
export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [filters, setFilters] = useState({
    category: '',
    priceRange: { min: 0, max: 10000 },
    rating: 0
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchServices();
  }, [filters]);
  
  async function fetchServices() {
    setLoading(true);
    try {
      const data = await serviceApi.getServices(filters);
      setServices(data.services);
    } catch (error) {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex gap-8">
        {/* Filters Sidebar */}
        <aside className="w-64 space-y-6">
          <FilterSection
            filters={filters}
            onChange={setFilters}
          />
        </aside>
        
        {/* Services Grid */}
        <main className="flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map(service => (
              <ServiceCard 
                key={service.id}
                service={service}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

// Day 23-24: Service Detail Page
export function ServiceDetailPage() {
  const { slug } = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'healers' | 'programs'>('overview');
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="relative h-96 rounded-2xl overflow-hidden">
        <Image
          src={service?.imageUrl}
          alt={service?.name}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-8 left-8 text-white">
          <h1 className="text-4xl font-bold">{service?.name}</h1>
          <p className="text-xl mt-2">{service?.tagline}</p>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mt-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="healers">Healers</TabsTrigger>
          <TabsTrigger value="programs">Programs</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <ServiceOverview service={service} />
        </TabsContent>
        
        <TabsContent value="healers">
          <HealersGrid healers={service?.healers} />
        </TabsContent>
        
        <TabsContent value="programs">
          <ProgramsList programs={service?.programs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Day 25: Healer Profile Component
export function HealerProfile({ healer }: { healer: Healer }) {
  return (
    <Card className="p-6">
      <div className="flex items-start space-x-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={healer.avatar} />
          <AvatarFallback>
            {healer.firstName[0]}{healer.lastName[0]}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <h3 className="text-xl font-semibold">
            {healer.firstName} {healer.lastName}
          </h3>
          
          <div className="flex items-center mt-2">
            <StarRating rating={healer.rating} />
            <span className="ml-2 text-sm text-gray-600">
              ({healer.totalSessions} sessions)
            </span>
          </div>
          
          <div className="mt-3 space-y-2">
            <p className="text-sm">
              <strong>Experience:</strong> {healer.experienceYears} years
            </p>
            <p className="text-sm">
              <strong>Specializations:</strong> {healer.specializations.join(', ')}
            </p>
          </div>
          
          <p className="mt-4 text-gray-700">{healer.bio}</p>
          
          <div className="mt-6 flex space-x-3">
            <Button onClick={() => openBookingModal(healer)}>
              Book Session
            </Button>
            <Button variant="outline">
              View Full Profile
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
```

**Week 6 - Booking Flow**
```typescript
// Day 26-27: Booking Modal
export function BookingModal({ 
  healer, 
  service 
}: { 
  healer: Healer; 
  service: Service;
}) {
  const [step, setStep] = useState<'datetime' | 'confirm' | 'payment'>('datetime');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  
  async function fetchAvailability(date: Date) {
    try {
      const slots = await bookingApi.getAvailability(
        healer.id,
        date
      );
      setAvailableSlots(slots);
    } catch (error) {
      toast.error('Failed to fetch availability');
    }
  }
  
  useEffect(() => {
    if (selectedDate) {
      fetchAvailability(selectedDate);
    }
  }, [selectedDate]);
  
  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return;
    
    const booking = {
      healerId: healer.id,
      serviceId: service.id,
      scheduledAt: combineDateAndTime(selectedDate, selectedTime),
      duration: service.duration
    };
    
    try {
      const response = await bookingApi.createBooking(booking);
      setStep('payment');
    } catch (error) {
      toast.error('Failed to create booking');
    }
  }
  
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book {service.name} Session</DialogTitle>
        </DialogHeader>
        
        {step === 'datetime' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3">Select Date</h3>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => 
                  date < new Date() || 
                  date > addDays(new Date(), 30)
                }
              />
            </div>
            
            <div>
              <h3 className="font-semibold mb-3">Select Time</h3>
              <div className="grid grid-cols-3 gap-2">
                {availableSlots.map(slot => (
                  <Button
                    key={slot}
                    variant={selectedTime === slot ? 'default' : 'outline'}
                    onClick={() => setSelectedTime(slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {step === 'confirm' && (
          <BookingConfirmation
            healer={healer}
            service={service}
            date={selectedDate}
            time={selectedTime}
          />
        )}
        
        {step === 'payment' && (
          <PaymentForm
            amount={service.price}
            onSuccess={handlePaymentSuccess}
          />
        )}
        
        <DialogFooter>
          {step === 'datetime' && (
            <Button 
              onClick={() => setStep('confirm')}
              disabled={!selectedDate || !selectedTime}
            >
              Continue
            </Button>
          )}
          
          {step === 'confirm' && (
            <>
              <Button 
                variant="outline"
                onClick={() => setStep('datetime')}
              >
                Back
              </Button>
              <Button onClick={handleConfirm}>
                Confirm Booking
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Day 28-29: Booking Management Dashboard
export function BookingsDashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">My Bookings</h2>
        
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      <div className="space-y-4">
        {bookings.map(booking => (
          <BookingCard 
            key={booking.id}
            booking={booking}
            onReschedule={() => openRescheduleModal(booking)}
            onCancel={() => openCancelModal(booking)}
          />
        ))}
      </div>
    </div>
  );
}

// Day 30: Availability Calendar Component
export function AvailabilityCalendar({ 
  healerId 
}: { 
  healerId: string 
}) {
  const [availability, setAvailability] = useState({});
  const [editMode, setEditMode] = useState(false);
  
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Availability Calendar
        </h3>
        {isHealer && (
          <Button
            variant="outline"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? 'Save' : 'Edit'}
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center">
            <p className="font-medium mb-2">{day}</p>
            {editMode ? (
              <TimeSlotEditor 
                day={day}
                slots={availability[day]}
                onChange={(slots) => updateAvailability(day, slots)}
              />
            ) : (
              <TimeSlotDisplay slots={availability[day]} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
```

### Sprint 3 Deliverables
- ✅ Service catalog with search and filters
- ✅ Detailed service pages
- ✅ Healer profiles and ratings
- ✅ Complete booking flow
- ✅ Availability management
- ✅ Booking management dashboard

---

## Sprint 4: Payment Integration & Programs (Weeks 7-8)

### Sprint Goals
- Integrate Razorpay payment gateway
- Build program enrollment system
- Implement VIP membership
- Create payment management

### Task Breakdown

#### 3.4.1 Payment Service (Senior Backend Engineer 1)

**Week 7 - Payment Gateway Integration**
```javascript
// Day 31-32: Razorpay Setup
const Razorpay = require('razorpay');

class PaymentService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  
  async createOrder(amount, currency = 'INR', notes = {}) {
    const options = {
      amount: amount * 100, // Amount in paise
      currency,
      receipt: `order_${Date.now()}`,
      notes
    };
    
    try {
      const order = await this.razorpay.orders.create(options);
      
      // Save order in database
      await Payment.create({
        orderId: order.id,
        amount: amount,
        currency: currency,
        status: 'pending',
        metadata: notes
      });
      
      return order;
    } catch (error) {
      console.error('Razorpay order creation failed:', error);
      throw new Error('Payment order creation failed');
    }
  }
  
  async verifyPayment(orderId, paymentId, signature) {
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    
    if (generatedSignature !== signature) {
      throw new Error('Payment verification failed');
    }
    
    // Update payment status
    await Payment.updateOne(
      { orderId },
      { 
        paymentId,
        status: 'completed',
        completedAt: new Date()
      }
    );
    
    return true;
  }
  
  async processRefund(paymentId, amount, reason) {
    try {
      const refund = await this.razorpay.payments.refund(
        paymentId,
        {
          amount: amount * 100,
          notes: { reason }
        }
      );
      
      // Record refund
      await Refund.create({
        paymentId,
        refundId: refund.id,
        amount,
        reason,
        status: refund.status
      });
      
      return refund;
    } catch (error) {
      console.error('Refund failed:', error);
      throw new Error('Refund processing failed');
    }
  }
}

// Day 33-34: Payment Webhooks
app.post('/webhooks/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const { event, payload } = req.body;
  
  switch (event) {
    case 'payment.captured':
      await handlePaymentCaptured(payload.payment.entity);
      break;
    
    case 'payment.failed':
      await handlePaymentFailed(payload.payment.entity);
      break;
    
    case 'refund.processed':
      await handleRefundProcessed(payload.refund.entity);
      break;
    
    case 'subscription.activated':
      await handleSubscriptionActivated(payload.subscription.entity);
      break;
    
    case 'subscription.cancelled':
      await handleSubscriptionCancelled(payload.subscription.entity);
      break;
  }
  
  res.json({ status: 'ok' });
});

// Day 35: Invoice Generation
class InvoiceService {
  async generateInvoice(paymentId) {
    const payment = await Payment.findOne({ paymentId })
      .populate('user')
      .populate('booking');
    
    const invoice = {
      invoiceNumber: `INV-${Date.now()}`,
      date: new Date(),
      dueDate: new Date(),
      from: {
        name: 'Ganges Healers',
        address: 'Roorkee, Uttarakhand',
        gstin: 'XXXXXXXXXXXX'
      },
      to: {
        name: `${payment.user.firstName} ${payment.user.lastName}`,
        email: payment.user.email,
        phone: payment.user.phone
      },
      items: [{
        description: payment.booking.service.name,
        quantity: 1,
        rate: payment.amount,
        amount: payment.amount
      }],
      subtotal: payment.amount,
      tax: payment.amount * 0.18, // 18% GST
      total: payment.amount * 1.18
    };
    
    // Generate PDF
    const pdfBuffer = await this.generatePDF(invoice);
    
    // Upload to S3
    const url = await s3Service.upload(
      pdfBuffer,
      `invoices/${invoice.invoiceNumber}.pdf`
    );
    
    // Save invoice record
    await Invoice.create({
      ...invoice,
      pdfUrl: url,
      paymentId
    });
    
    // Send email
    await emailService.sendInvoice(
      payment.user.email,
      invoice,
      url
    );
    
    return invoice;
  }
}
```

**Week 8 - Subscription & Programs**
```javascript
// Day 36-37: VIP Membership
class MembershipService {
  async createMembership(userId, plan) {
    // Create Razorpay subscription
    const subscription = await this.razorpay.subscriptions.create({
      plan_id: this.getPlanId(plan),
      customer_notify: 1,
      total_count: plan === 'monthly' ? 12 : null,
      notes: { userId }
    });
    
    // Save membership
    const membership = await VIPMembership.create({
      userId,
      subscriptionId: subscription.id,
      plan,
      status: 'pending',
      startDate: new Date(),
      endDate: this.calculateEndDate(plan),
      benefits: {
        freeSessions: 2,
        communityAccess: true,
        priorityBooking: true,
        discountPercentage: 10
      }
    });
    
    return { subscription, membership };
  }
  
  async activateMembership(subscriptionId) {
    const membership = await VIPMembership.findOne({ 
      subscriptionId 
    });
    
    if (!membership) {
      throw new Error('Membership not found');
    }
    
    membership.status = 'active';
    membership.activatedAt = new Date();
    await membership.save();
    
    // Grant benefits
    await this.grantBenefits(membership);
    
    // Send welcome email
    await emailService.sendVIPWelcome(membership.userId);
    
    return membership;
  }
  
  async grantBenefits(membership) {
    const { userId, benefits } = membership;
    
    // Add free session credits
    await SessionCredit.create({
      userId,
      credits: benefits.freeSessions,
      expiresAt: membership.endDate,
      source: 'vip_membership'
    });
    
    // Grant community access
    await CommunityAccess.create({
      userId,
      level: 'vip',
      grantedAt: new Date()
    });
    
    // Update user role
    await User.updateOne(
      { _id: userId },
      { 
        $addToSet: { roles: 'vip' },
        vipStatus: true
      }
    );
  }
}

// Day 38-39: Program Enrollment
class ProgramEnrollmentService {
  async enrollInProgram(userId, programId, healerId) {
    const program = await Program.findById(programId);
    
    if (!program) {
      throw new Error('Program not found');
    }
    
    // Check if already enrolled
    const existingEnrollment = await ProgramEnrollment.findOne({
      userId,
      programId,
      status: { $in: ['active', 'paused'] }
    });
    
    if (existingEnrollment) {
      throw new Error('Already enrolled in this program');
    }
    
    // Start transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Create payment order
      const order = await paymentService.createOrder(
        program.price,
        'INR',
        { 
          type: 'program',
          programId,
          userId
        }
      );
      
      // Create enrollment
      const enrollment = await ProgramEnrollment.create([{
        userId,
        programId,
        healerId,
        status: 'pending_payment',
        startDate: new Date(),
        endDate: this.calculateEndDate(program),
        sessions: this.generateSessions(program),
        orderId: order.id
      }], { session });
      
      await session.commitTransaction();
      
      return {
        enrollment: enrollment[0],
        paymentOrder: order
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  generateSessions(program) {
    const sessions = [];
    const startDate = new Date();
    const { totalSessions, sessionsPerWeek, duration } = program;
    
    let currentDate = new Date(startDate);
    let sessionsScheduled = 0;
    
    while (sessionsScheduled < totalSessions) {
      for (let i = 0; i < sessionsPerWeek && sessionsScheduled < totalSessions; i++) {
        sessions.push({
          sessionNumber: sessionsScheduled + 1,
          scheduledDate: new Date(currentDate),
          status: 'upcoming',
          duration: duration
        });
        
        sessionsScheduled++;
        currentDate.setDate(currentDate.getDate() + Math.floor(7 / sessionsPerWeek));
      }
    }
    
    return sessions;
  }
  
  async completeSession(enrollmentId, sessionNumber) {
    const enrollment = await ProgramEnrollment.findById(enrollmentId);
    
    const session = enrollment.sessions.find(
      s => s.sessionNumber === sessionNumber
    );
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.status = 'completed';
    session.completedAt = new Date();
    
    // Update progress
    enrollment.progress = {
      completedSessions: enrollment.sessions.filter(
        s => s.status === 'completed'
      ).length,
      totalSessions: enrollment.sessions.length,
      percentComplete: Math.round(
        (enrollment.sessions.filter(s => s.status === 'completed').length / 
        enrollment.sessions.length) * 100
      )
    };
    
    await enrollment.save();
    
    // Check if program completed
    if (enrollment.progress.percentComplete === 100) {
      await this.completeProgram(enrollment);
    }
    
    return enrollment;
  }
}

// Day 40: Payment Reports
class PaymentReportService {
  async generateMonthlyReport(month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const payments = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' }
        }
      }
    ]);
    
    const refunds = await Refund.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    const report = {
      period: `${month}/${year}`,
      revenue: {
        gross: payments.reduce((sum, p) => sum + p.totalAmount, 0),
        refunds: refunds[0]?.totalAmount || 0,
        net: payments.reduce((sum, p) => sum + p.totalAmount, 0) - (refunds[0]?.totalAmount || 0)
      },
      transactions: {
        successful: payments.reduce((sum, p) => sum + p.count, 0),
        refunded: refunds[0]?.count || 0
      },
      breakdown: payments
    };
    
    return report;
  }
}
```

### Sprint 4 Deliverables
- ✅ Razorpay payment integration
- ✅ Payment verification and webhooks
- ✅ Invoice generation
- ✅ VIP membership subscription
- ✅ Program enrollment flow
- ✅ Payment reports and analytics

---

## Sprint 5: Community & Content Platform (Weeks 9-10)

[Continuing with similar detailed breakdown for remaining sprints...]

---

## 4. Testing Strategy Implementation

### 4.1 Unit Testing Setup

**Jest Configuration**
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### 4.2 Integration Testing

**API Testing with Supertest**
```javascript
describe('Booking API', () => {
  let app: Application;
  let authToken: string;
  
  beforeAll(async () => {
    app = await createApp();
    authToken = await getAuthToken();
  });
  
  describe('POST /api/bookings', () => {
    it('should create booking with valid data', async () => {
      const bookingData = {
        healerId: 'healer123',
        serviceId: 'service456',
        scheduledAt: '2024-01-15T10:00:00Z'
      };
      
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bookingData)
        .expect(201);
      
      expect(response.body).toHaveProperty('booking');
      expect(response.body.booking.status).toBe('pending');
    });
    
    it('should reject booking for unavailable slot', async () => {
      // Create existing booking
      await createBooking({
        healerId: 'healer123',
        scheduledAt: '2024-01-15T10:00:00Z'
      });
      
      // Try to book same slot
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          healerId: 'healer123',
          serviceId: 'service456',
          scheduledAt: '2024-01-15T10:00:00Z'
        })
        .expect(409);
      
      expect(response.body.error).toBe('Slot not available');
    });
  });
});
```

### 4.3 E2E Testing with Cypress

**Booking Flow E2E Test**
```javascript
describe('Complete Booking Flow', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'password123');
  });
  
  it('books a Reiki healing session', () => {
    // Navigate to services
    cy.visit('/services');
    
    // Select Reiki service
    cy.contains('Reiki Healing').click();
    
    // Select healer
    cy.get('[data-cy=healer-card]').first().click();
    cy.get('[data-cy=book-session]').click();
    
    // Select date and time
    cy.get('[data-cy=date-picker]').click();
    cy.get('[data-cy=date-15]').click();
    cy.get('[data-cy=time-slot]').contains('10:00 AM').click();
    
    // Confirm booking
    cy.get('[data-cy=confirm-booking]').click();
    
    // Payment
    cy.get('[data-cy=card-number]').type('4111111111111111');
    cy.get('[data-cy=card-expiry]').type('12/25');
    cy.get('[data-cy=card-cvv]').type('123');
    cy.get('[data-cy=pay-button]').click();
    
    // Verify success
    cy.contains('Booking Confirmed').should('be.visible');
    cy.url().should('include', '/bookings');
  });
});
```

---

## 5. Deployment Strategy

### 5.1 Environment Setup

**Development Environment**
```yaml
Environment: Development
URL: https://dev.gangeshealers.com
Database: dev-ganges-healers
Features:
  - Debug logging enabled
  - Mock payment gateway
  - Test data seeding
  - Hot reload
```

**Staging Environment**
```yaml
Environment: Staging
URL: https://staging.gangeshealers.com
Database: staging-ganges-healers
Features:
  - Production-like setup
  - Real payment gateway (test mode)
  - Performance monitoring
  - Load testing enabled
```

**Production Environment**
```yaml
Environment: Production
URL: https://gangeshealers.com
Database: prod-ganges-healers
Features:
  - Full monitoring and alerting
  - Auto-scaling enabled
  - CDN for assets
  - Backup automation
```

### 5.2 Deployment Process

**CI/CD Pipeline**
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          npm ci
          npm run test
          npm run test:e2e

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Build Docker images
        run: |
          docker build -t ganges-healers/api:${{ github.sha }} ./api
          docker build -t ganges-healers/web:${{ github.sha }} ./web
      
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker push $ECR_REGISTRY/ganges-healers/api:${{ github.sha }}
          docker push $ECR_REGISTRY/ganges-healers/web:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster ganges-healers-prod \
            --service api-service \
            --force-new-deployment
```

---

## 6. Quality Assurance Plan

### 6.1 Code Quality Standards

**ESLint Configuration**
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": "error",
    "no-unused-vars": "error",
    "prefer-const": "error",
    "react/prop-types": "off"
  }
}
```

### 6.2 Performance Monitoring

**Metrics to Track**
- API response times (p50, p95, p99)
- Database query performance
- Frontend Core Web Vitals
- Error rates
- User session analytics

---

## 7. Risk Mitigation During Implementation

### 7.1 Technical Risks

| Risk | Mitigation Strategy | Owner |
|------|-------------------|--------|
| Database performance issues | Implement caching, query optimization, read replicas | Backend Lead |
| Payment gateway failures | Implement retry logic, fallback payment methods | Backend Engineer |
| Security vulnerabilities | Regular security audits, penetration testing | DevOps Engineer |
| Scalability bottlenecks | Load testing, auto-scaling configuration | DevOps Engineer |

### 7.2 Project Risks

| Risk | Mitigation Strategy | Owner |
|------|-------------------|--------|
| Scope creep | Strict change control, regular reviews | Project Manager |
| Resource unavailability | Cross-training, documentation | Tech Lead |
| Integration delays | Early integration testing, API mocking | Full-Stack Developer |
| User adoption | Beta testing, user feedback loops | Product Manager |

---

## 8. Success Metrics

### 8.1 Development Metrics
- Sprint velocity: 40 story points per sprint
- Bug discovery rate: <5 critical bugs per sprint
- Code coverage: >80%
- Technical debt ratio: <15%

### 8.2 Business Metrics
- Time to market: 24 weeks
- Budget adherence: ±10%
- Feature completion: 95% MVP features
- System availability: 99.9% uptime

---

## 9. Post-Launch Activities

### 9.1 Week 25-26: Stabilization
- Bug fixes and performance optimization
- User feedback implementation
- Documentation completion
- Team knowledge transfer

### 9.2 Week 27-28: Growth Phase
- Feature enhancements
- Mobile app development kickoff
- International expansion planning
- Advanced analytics implementation

---

## Document Control

**Version**: 1.0  
**Last Updated**: September 2025  
**Author**: Implementation Team  
**Review Cycle**: Weekly during sprints  
**Distribution**: All team members, stakeholders

---

*This Implementation Plan provides a comprehensive roadmap for building Ganges Healers. Regular updates and adjustments should be made based on sprint retrospectives and stakeholder feedback.*
