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
        <span className="text-muted-foreground">{candidate.year_text ?? "Ano aberto"}</span>
        <Button variant="outline" onClick={() => onSelect?.(candidate.application_id)}>
          Escolher
        </Button>
      </CardContent>
    </Card>
  );
}
