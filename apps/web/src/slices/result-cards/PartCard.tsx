import type { PartResult } from "@nexo/contracts/tools";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function PartCard({ part }: { part: PartResult }) {
  return (
    <Card id={`part-${part.part_id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{part.part_number}</CardTitle>
          {part.is_obsolete ? <Badge className="border-destructive text-destructive">Descontinuada</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{part.description}</p>
        <div className="flex flex-wrap gap-2 text-muted-foreground">
          {part.group ? <span>Grupo: {part.group}</span> : null}
          {part.subgroup ? <span>Subgrupo: {part.subgroup}</span> : null}
          {part.has_photo ? <span>Foto disponivel</span> : <span>Sem foto no catalogo</span>}
        </div>
      </CardContent>
    </Card>
  );
}
