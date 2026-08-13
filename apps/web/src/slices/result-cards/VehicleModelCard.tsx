import type { VehicleModelRef } from "@nexo/contracts/tools";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function VehicleModelCard({ model, onSelect }: { model: VehicleModelRef; onSelect?: (manufacturerId: string, description: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{model.description}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <div className="space-y-1 text-muted-foreground">
          <p>{model.application_count} aplicacoes</p>
          {model.year_span_text ? <p>{model.year_span_text}</p> : null}
        </div>
        {model.manufacturer_id ? (
          <Button variant="outline" onClick={() => onSelect?.(model.manufacturer_id ?? "", model.description)}>
            Escolher
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
