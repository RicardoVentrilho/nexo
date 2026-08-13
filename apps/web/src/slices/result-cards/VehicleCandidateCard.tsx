import type { VehicleCandidate } from "@nexo/contracts/tools";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function VehicleCandidateCard({ candidate, onSelect }: { candidate: VehicleCandidate; onSelect?: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{candidate.description}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <div className="space-y-1 text-muted-foreground">
          <p>{candidate.year_text ?? "Ano aberto"}</p>
          <p>{candidate.part_count} pecas</p>
        </div>
        <Button variant="outline" onClick={() => onSelect?.(candidate.application_id)}>
          Escolher
        </Button>
      </CardContent>
    </Card>
  );
}
