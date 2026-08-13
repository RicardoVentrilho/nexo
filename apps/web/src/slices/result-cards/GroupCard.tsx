import type { GroupRef } from "@nexo/contracts/tools";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function GroupCard({ group }: { group: GroupRef }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.description}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {group.part_count} pecas
      </CardContent>
    </Card>
  );
}
