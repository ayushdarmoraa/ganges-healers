// app/api/availability/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getHealerAvailability } from '@/lib/availability'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const healerId = searchParams.get('healerId')
    const date = searchParams.get('date')
    
    // Validation
    if (!healerId) {
      return NextResponse.json(
        { error: 'healerId is required' },
        { status: 400 }
      )
    }
    
    if (!date) {
      return NextResponse.json(
        { error: 'date is required (YYYY-MM-DD format)' },
        { status: 400 }
      )
    }
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }
    
    // Check if date is not in the past
    const targetDate = new Date(date + 'T00:00:00.000Z')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (targetDate < today) {
      return NextResponse.json(
        { error: 'Cannot get availability for past dates' },
        { status: 400 }
      )
    }
    
    // Get availability
    const availability = await getHealerAvailability(healerId, date)
    
    return NextResponse.json({
      success: true,
      data: availability
    })
    
  } catch (error) {
    console.error('Availability API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}