import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Placeholder metric cards. Replace the title/value/footer with real metrics
// once the data model is defined.
const cards = [
  { label: "Metric one" },
  { label: "Metric two" },
  { label: "Metric three" },
  { label: "Metric four" },
]

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-muted-foreground @[250px]/card:text-3xl">
              —
            </CardTitle>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">No data yet</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
