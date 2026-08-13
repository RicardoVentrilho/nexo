import type { z } from "zod";
import type { FindCrossReferenceOutput } from "@nexo/contracts/tools";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

type CrossReferenceResult = z.infer<typeof FindCrossReferenceOutput>;

export function CrossReferenceCard({ result }: { result: CrossReferenceResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Referencia cruzada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {result.matches.length === 0 ? <p className="text-muted-foreground">Nada registrado para esse numero.</p> : null}
        {result.matches.map((match) => (
          <div className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0" key={`${match.foreign_manufacturer_name}-${match.foreign_number}-${match.part_id}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{match.part_number}</span>
              {match.is_obsolete ? <Badge className="border-destructive text-destructive">Descontinuada</Badge> : null}
            </div>
            <p>{match.description}</p>
            <p className="text-xs text-muted-foreground">{match.foreign_manufacturer_name}: {match.foreign_number}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
