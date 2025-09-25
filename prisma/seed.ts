import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting MVP seed...')

  // Hash passwords
  const adminHashedPassword = await bcrypt.hash('admin123', 10)
  const userHashedPassword = await bcrypt.hash('password123', 10)
  const healerHashedPassword = await bcrypt.hash('healer123', 10)

  // Create users
  await prisma.user.upsert({
    where: { email: 'admin@ganges-healers.com' },
    update: {},
    create: {
      email: 'admin@ganges-healers.com',
      name: 'Admin User',
      password: adminHashedPassword,
      role: 'ADMIN',
      vip: true,
      freeSessionCredits: 5,
    },
  })

  await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      name: 'John Doe',
      password: userHashedPassword,
      role: 'USER',
      vip: false,
      freeSessionCredits: 2,
    },
  })

  console.log('Users created')

  // Create 5 healers
  const healers = []
  
  const healerData = [
    {
      email: 'priya@ganges-healers.com',
      name: 'Priya Sharma',
      bio: 'Experienced yoga therapist and Reiki master with 12+ years of practice. Specializes in stress relief and spiritual healing.',
      experienceYears: 12,
      rating: 4.9,
      certifications: [
        { name: 'Certified Yoga Therapist', year: 2012 },
        { name: 'Reiki Master Level III', year: 2015 }
      ],
      availability: {
        monday: { start: '09:00', end: '17:00' },
        tuesday: { start: '09:00', end: '17:00' },
        wednesday: { start: '10:00', end: '18:00' },
        thursday: { start: '09:00', end: '17:00' },
        friday: { start: '09:00', end: '16:00' }
      }
    },
    {
      email: 'raj@ganges-healers.com',
      name: 'Raj Patel',
      bio: 'Professional hypnotherapist and past life regression specialist. Helps clients overcome limiting beliefs and heal emotional trauma.',
      experienceYears: 8,
      rating: 4.7,
      certifications: [
        { name: 'Certified Clinical Hypnotherapist', year: 2016 },
        { name: 'Past Life Regression Therapy', year: 2019 }
      ],
      availability: {
        monday: { start: '10:00', end: '18:00' },
        wednesday: { start: '10:00', end: '18:00' },
        friday: { start: '10:00', end: '18:00' },
        saturday: { start: '09:00', end: '15:00' }
      }
    },
    {
      email: 'maya@ganges-healers.com',
      name: 'Maya Singh',
      bio: 'Intuitive tarot reader and spiritual guide with deep knowledge of various divination systems. Provides clarity and insight for life decisions.',
      experienceYears: 10,
      rating: 4.8,
      certifications: [
        { name: 'Professional Tarot Certification', year: 2014 },
        { name: 'Astrology Diploma', year: 2017 }
      ],
      availability: {
        tuesday: { start: '11:00', end: '19:00' },
        thursday: { start: '11:00', end: '19:00' },
        saturday: { start: '10:00', end: '18:00' },
        sunday: { start: '12:00', end: '17:00' }
      }
    },
    {
      email: 'arjun@ganges-healers.com',
      name: 'Arjun Khanna',
      bio: 'Movement therapy specialist and somatic healer. Uses body-based approaches to release trauma and restore natural movement patterns.',
      experienceYears: 6,
      rating: 4.6,
      certifications: [
        { name: 'Somatic Movement Educator', year: 2018 },
        { name: 'Trauma-Informed Movement Therapy', year: 2020 }
      ],
      availability: {
        monday: { start: '08:00', end: '16:00' },
        tuesday: { start: '08:00', end: '16:00' },
        thursday: { start: '08:00', end: '16:00' },
        friday: { start: '08:00', end: '14:00' }
      }
    },
    {
      email: 'kavya@ganges-healers.com',
      name: 'Kavya Reddy',
      bio: 'Art therapist and creative healing facilitator. Combines traditional art techniques with therapeutic practices for emotional expression and healing.',
      experienceYears: 7,
      rating: 4.8,
      certifications: [
        { name: 'Registered Art Therapist', year: 2017 },
        { name: 'Expressive Arts Therapy', year: 2019 }
      ],
      availability: {
        tuesday: { start: '10:00', end: '18:00' },
        wednesday: { start: '10:00', end: '18:00' },
        friday: { start: '10:00', end: '18:00' },
        saturday: { start: '09:00', end: '15:00' }
      }
    }
  ]

  const healerSpecializationsMap: string[][] = [
    ["Yoga", "Reiki"],            // Priya
    ["Hypnotherapy", "Prana Healing"], // Raj
    ["Tarot", "Reiki"],          // Maya
    ["Movement Therapy"],         // Arjun
    ["Art Therapy"],              // Kavya
  ]

  for (const [index, data] of healerData.entries()) {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {},
      create: {
        email: data.email,
        name: data.name,
        password: healerHashedPassword,
        role: 'HEALER',
        vip: true,
        freeSessionCredits: 0,
      },
    })

    const healer = await prisma.healer.upsert({
      where: { userId: user.id },
      update: {
        bio: data.bio,
        experienceYears: data.experienceYears,
        rating: data.rating,
        certifications: data.certifications,
        availability: data.availability,
        specializations: healerSpecializationsMap[index],
        isVerified: true,
      },
      create: {
        userId: user.id,
        bio: data.bio,
        experienceYears: data.experienceYears,
        rating: data.rating,
        isVerified: true,
        certifications: data.certifications,
        availability: data.availability,
        specializations: healerSpecializationsMap[index],
      },
    })

    healers.push(healer)
  }

  console.log('Healers created')

  // Create 7 MVP services
  const services = []
  
  const serviceData = [
    {
      name: 'Yoga Therapy',
      slug: 'yoga-therapy',
      description: 'Therapeutic yoga sessions designed to address specific physical and mental health concerns. Combines traditional yoga poses with modern therapeutic techniques.',
      tagline: 'Healing through mindful movement and breath',
      category: 'Movement & Body',
      price: 8000, // ₹80 in paise
      duration: 75, // minutes
  mode: 'BOTH',
      benefits: [
        'Improves flexibility and strength',
        'Reduces chronic pain and tension',
        'Enhances mental clarity and focus',
        'Supports emotional regulation',
        'Promotes better sleep quality'
      ]
    },
    {
      name: 'Art Therapy',
      slug: 'art-therapy',
      description: 'Creative expression therapy using various art mediums to explore emotions, reduce stress, and promote healing. No artistic experience required.',
      tagline: 'Healing through creative expression',
      category: 'Creative Arts',
      price: 7500, // ₹75 in paise
      duration: 90,
  mode: 'BOTH',
      benefits: [
        'Processes emotions through creativity',
        'Reduces anxiety and depression',
        'Enhances self-awareness',
        'Improves communication skills',
        'Builds confidence and self-esteem'
      ]
    },
    {
      name: 'Reiki Healing',
      slug: 'reiki-healing',
      description: 'Traditional Japanese energy healing technique that promotes relaxation, reduces stress, and supports the body\'s natural healing processes.',
      tagline: 'Universal life energy for healing and balance',
      category: 'Energy Healing',
      price: 7000, // ₹70 in paise
      duration: 60,
  mode: 'BOTH',
      benefits: [
        'Deep relaxation and stress relief',
        'Balances energy centers (chakras)',
        'Supports physical healing',
        'Enhances emotional well-being',
        'Improves sleep and reduces fatigue'
      ]
    },
    {
      name: 'Tarot Reading',
      slug: 'tarot-reading',
      description: 'Intuitive tarot card readings to gain insights into life situations, relationships, and future possibilities. Provides guidance and clarity.',
      tagline: 'Divine guidance for life\'s questions',
      category: 'Divination',
      price: 5000, // ₹50 in paise
      duration: 45,
  mode: 'BOTH',
      benefits: [
        'Clarity on life decisions',
        'Insight into relationships',
        'Understanding of life patterns',
        'Guidance for personal growth',
        'Connection to intuitive wisdom'
      ]
    },
    {
      name: 'Hypnotherapy',
      slug: 'hypnotherapy',
      description: 'Professional hypnotherapy sessions for habit change, trauma healing, and personal transformation. Safe and effective therapeutic approach.',
      tagline: 'Transform your mind, transform your life',
      category: 'Therapy',
      price: 9000, // ₹90 in paise
      duration: 90,
      mode: 'BOTH',
      benefits: [
        'Overcome limiting beliefs',
        'Break unwanted habits',
        'Heal emotional trauma',
        'Improve confidence and motivation',
        'Access subconscious resources'
      ]
    },
    {
      name: 'Movement Therapy',
      slug: 'movement-therapy',
      description: 'Somatic movement therapy to release physical tension, improve body awareness, and restore natural movement patterns.',
      tagline: 'Free your body, free your mind',
      category: 'Movement & Body',
      price: 8500, // ₹85 in paise
      duration: 75,
  mode: 'OFFLINE',
      benefits: [
        'Releases chronic tension patterns',
        'Improves posture and alignment',
        'Enhances body awareness',
        'Reduces pain and stiffness',
        'Restores natural movement'
      ]
    },
    {
      name: 'Prana Healing',
      slug: 'prana-healing',
      description: 'Ancient energy healing system that works with life force energy (prana) to cleanse, energize, and balance the energy body.',
      tagline: 'Harness your life force for healing',
      category: 'Energy Healing',
      price: 7500, // ₹75 in paise
      duration: 60,
  mode: 'BOTH',
      benefits: [
        'Cleanses and energizes chakras',
        'Accelerates physical healing',
        'Improves emotional stability',
        'Enhances mental clarity',
        'Strengthens the energy body'
      ]
    }
  ]

  type ServiceModeType = 'ONLINE' | 'OFFLINE' | 'BOTH'

  for (const data of serviceData) {
    const createInput = {
      name: data.name,
      slug: data.slug,
      description: data.description,
      tagline: data.tagline,
      category: data.category,
      price: data.price,
      duration: data.duration,
  mode: data.mode as ServiceModeType,
      benefits: data.benefits
    }
    const service = await prisma.service.upsert({
      where: { slug: data.slug },
      update: {},
      create: createInput,
    })
    services.push(service)
  }

  console.log('Services created')

  // Junction removed: healer specializations now drive service association
  console.log('Healer specializations assigned (junction removed)')
  console.log('✅ MVP seed completed successfully!')
  console.log(`
📊 Created:
- 2 Users (1 admin, 1 regular user)
- 5 Healers with availability JSON
- 7 Services (your MVP list)
-- Specializations arrays assigned to healers
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })