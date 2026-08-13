import type { ManufacturerRef } from "@nexo/contracts/tools";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function ManufacturerCard({ manufacturer, onSelect }: { manufacturer: ManufacturerRef; onSelect?: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{manufacturer.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{manufacturer.application_count} aplicacoes</span>
        <Button variant="outline" onClick={() => onSelect?.(manufacturer.manufacturer_id)}>
          Escolher
        </Button>
      </CardContent>
    </Card>
  );
}
