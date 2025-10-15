import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <section className="text-center py-16">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Welcome to Ganges Healers
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Your trusted healthcare partner providing comprehensive medical services
          with compassion and excellence.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg" className="focus-ring">
            <Link href="/services">Our Services</Link>
          </Button>
          <Button variant="outline" size="lg" asChild className="focus-ring">
            <Link href="/dashboard">Get Started</Link>
          </Button>
        </div>
      </section>

      <section className="py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Why Choose Ganges Healers?
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Expert Care</CardTitle>
              <CardDescription>
                Experienced healthcare professionals dedicated to your wellbeing
              </CardDescription>
            </CardHeader>
            <CardContent>
              Our team of qualified doctors and healthcare providers offer
              personalized treatment plans tailored to your specific needs.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modern Technology</CardTitle>
              <CardDescription>
                State-of-the-art medical equipment and digital health solutions
              </CardDescription>
            </CardHeader>
            <CardContent>
              We leverage cutting-edge technology to provide accurate diagnoses
              and effective treatments for better health outcomes.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compassionate Service</CardTitle>
              <CardDescription>
                Patient-centered care with empathy and understanding
              </CardDescription>
            </CardHeader>
            <CardContent>
              We believe in treating not just the illness, but the whole person
              with dignity, respect, and compassionate care.
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}