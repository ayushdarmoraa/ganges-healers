import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export default async function ServicesPreview() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { popularity: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      price: true,
      duration: true,
    },
  })

  if (services.length === 0) return null

  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-4">
        Most Popular Healing Services
      </h2>
      <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
        Explore healing services and choose the approach that fits your needs.
      </p>
      <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
        {services.map((service) => (
          <Link key={service.id} href={`/services/${service.slug}`}>
            <Card className="hover:shadow-lg hover:border-primary/40 transition-all group h-full">
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="secondary" className="text-xs">
                    {(service.category ?? "General").replace(/_/g, " ")}
                  </Badge>
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                  {service.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {service.description}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>₹{service.price}</span>
                  <span>{service.duration} min</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="text-center mt-10">
        <Button asChild size="lg" className="focus-ring">
          <Link href="/services">Explore All Services</Link>
        </Button>
      </div>
    </section>
  )
}
