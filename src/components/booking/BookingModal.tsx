// components/booking/BookingModal.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar, User, CheckCircle, AlertCircle } from 'lucide-react'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Healer {
  id: string
  user: {
    name: string
    image?: string
  }
  experienceYears: number
  rating: number
}

interface TimeSlot {
  time: string
  available: boolean
}

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  healer: Healer
  serviceId: string
  serviceName: string
  programSlug?: string
  productSlug?: string
}

export default function BookingModal({
  isOpen,
  onClose,
  healer,
  serviceId,
  serviceName,
  programSlug,
  productSlug,
}: BookingModalProps) {
  const { data: session } = useSession()
  const router = useRouter()
  
  const [step, setStep] = useState<'date' | 'time' | 'confirm' | 'processing' | 'success'>('date')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  // Track created booking id locally (if needed for future UI)
  const [, setCreatedBookingId] = useState<string | null>(null)
  const verifyingRef = useRef(false)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const dateId = useId()
  const titleId = useId()

  // (Replaced by shared helper openRazorpayCheckout)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('date')
      setSelectedDate('')
      setSelectedTime('')
      setAvailableSlots([])
      setError('')
      // Focus the date input when opening
      setTimeout(() => {
        dateInputRef.current?.focus()
      }, 0)
    }
  }, [isOpen])

  const fetchAvailability = useCallback(async () => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(
        `/api/availability?healerId=${healer.id}&date=${selectedDate}`
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch availability')
      }

      const data = await response.json()
      setAvailableSlots(data.data.slots.filter((slot: TimeSlot) => slot.available))
      
      if (data.data.slots.filter((slot: TimeSlot) => slot.available).length === 0) {
        setError('No available slots for this date. Please select another date.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability')
    } finally {
      setLoading(false)
    }
  }, [healer.id, selectedDate])

  // Fetch availability when date is selected
  useEffect(() => {
    if (selectedDate && healer.id) {
      fetchAvailability()
    }
  }, [selectedDate, healer.id, fetchAvailability])

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    setSelectedTime('')
    setStep('time')
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time)
    setStep('confirm')
  }

  const handleBooking = async () => {
    if (!session) {
      router.push('/auth/signin')
      return
    }

    setLoading(true)
    setError('')

    try {
      const scheduledAt = new Date(`${selectedDate}T${selectedTime}:00.000Z`)

      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          healerId: healer.id,
          serviceId,
          scheduledAt: scheduledAt.toISOString(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create booking')
      }
      const data = await response.json()
  const newBookingId = data?.data?.id as string
  setCreatedBookingId(newBookingId)

      // Decide payment path
  const vip = session.user?.vip
  const credits = session.user?.freeSessionCredits ?? 0

      if (vip && credits > 0) {
        // Use VIP credit path
        setStep('processing')
        const creditRes = await fetch(`/api/bookings/${newBookingId}/confirm-with-credits`, { method: 'POST' })
        if (!creditRes.ok) {
          const errJ = await creditRes.json().catch(() => ({}))
          throw new Error(errJ.error || 'Failed to confirm with credits')
        }
        setStep('success')
      } else {
        // Razorpay path
        setStep('processing')
        const orderRes = await fetch('/api/payments/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: newBookingId }),
        })
        if (!orderRes.ok) {
          const errJ = await orderRes.json().catch(() => ({}))
            
          throw new Error(errJ.error || 'Failed to create payment order')
        }
        const order = await orderRes.json()

        try {
          const result = await openRazorpayCheckout({
            orderId: order.orderId,
            amountPaise: order.amountPaise || order.amount || 0,
            key: order.key || order.key_id || (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''),
            notes: { bookingId: newBookingId },
            prefill: { email: session.user?.email || '', name: session.user?.name || '' },
            description: 'Session payment'
          })
          if (verifyingRef.current) return
          verifyingRef.current = true
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: result.razorpay_order_id,
              paymentId: result.razorpay_payment_id,
              signature: result.razorpay_signature,
            })
          })
          if (!verifyRes.ok) {
            const vErr = await verifyRes.json().catch(() => ({}))
            throw new Error(vErr.error || 'Verification failed')
          }
          setStep('success')
          router.refresh()
        } catch (gatewayErr) {
          setError(gatewayErr instanceof Error ? gatewayErr.message : 'Payment cancelled')
          setStep('confirm')
        } finally {
          verifyingRef.current = false
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    // Reset after modal closes
    setTimeout(() => {
      setStep('date')
      setSelectedDate('')
      setSelectedTime('')
      setAvailableSlots([])
      setError('')
    }, 300)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (timeStr: string) => {
    return new Date(`2000-01-01T${timeStr}:00`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>Book {serviceName}</DialogTitle>
          {(programSlug || productSlug) ? (
            <div className="mt-1">
              {programSlug ? (<span className="text-xs text-muted-foreground">Context: program {programSlug}</span>) : null}
              {productSlug ? (<span className="ml-2 text-xs text-muted-foreground">Context: product {productSlug}</span>) : null}
            </div>
          ) : null}
        </DialogHeader>
        <DialogDescription className="sr-only">
          Select a date and time, then confirm your booking.
        </DialogDescription>

        <div className="space-y-6">
          {/* Healer Info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold">{healer.user.name}</h3>
              <p className="text-sm text-gray-600">
                {healer.experienceYears} years experience • ⭐ {healer.rating}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Date Selection */}
          {step === 'date' && (
            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor={dateId}>Select Date</label>
              <div className="flex items-center gap-2 p-3 border rounded-lg">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateSelect(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  max={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  className="flex-1 outline-none"
                  ref={dateInputRef}
                  id={dateId}
                />
              </div>
            </div>
          )}

          {/* Step 2: Time Selection */}
          {step === 'time' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Available times for {formatDate(selectedDate)}
                </label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setStep('date')}
                >
                  Change Date
                </Button>
              </div>
              
              {loading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                  <p className="text-sm text-gray-600 mt-2">Loading available times...</p>
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot.time}
                      variant="outline"
                      className="text-sm"
                      onClick={() => handleTimeSelect(slot.time)}
                    >
                      {formatTime(slot.time)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="font-medium">Confirm Booking</h3>
              <div className="space-y-2 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Service:</span>
                  <span className="font-medium">{serviceName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Healer:</span>
                  <span className="font-medium">{healer.user.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Date:</span>
                  <span className="font-medium">{formatDate(selectedDate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Time:</span>
                  <span className="font-medium">{formatTime(selectedTime)}</span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setStep('time')} 
                  className="flex-1"
                  disabled={loading}
                >
                  Back
                </Button>
                <Button onClick={handleBooking} disabled={loading} className="flex-1">
                  {loading ? 'Processing...' : 'Confirm & Pay'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Processing Payment / Credits */}
          {step === 'processing' && (
            <div className="text-center space-y-4 py-8">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Processing...</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {session?.user?.vip && (session.user.freeSessionCredits ?? 0) > 0 ? 'Applying VIP credit' : 'Opening secure payment gateway'}
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 'success' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-700">Booking Confirmed!</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Your booking for {formatDate(selectedDate)} at {formatTime(selectedTime)} has been confirmed.
                </p>
              </div>
              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}

          {/* Cancel Button for date/time steps */}
          {(step === 'date' || step === 'time') && (
            <Button variant="outline" onClick={handleClose} className="w-full">
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}