import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useStylesMutation, useStylesQuery } from "./useStylesMutation";

const stylesInputSchema = z.record(
  z.string(),
  z.object({ colorHex: z.string().nullable(), riskLevel: z.string().nullable() })
);

export function AssetStylesCard() {
  const stylesQuery = useStylesQuery(true);
  const stylesMutation = useStylesMutation();
  const [styleJson, setStyleJson] = useState("{}");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Asset styles (JSON)</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStyleJson(JSON.stringify(stylesQuery.data ?? {}, null, 2))}
        >
          Load current
        </Button>
        <Textarea rows={10} value={styleJson} onChange={(e) => setStyleJson(e.target.value)} />
        <Button
          size="sm"
          onClick={() => {
            try {
              const parsed = stylesInputSchema.parse(JSON.parse(styleJson));
              stylesMutation.mutate(parsed);
            } catch {
              alert("Invalid JSON");
            }
          }}
        >
          Save styles
        </Button>
      </CardContent>
    </Card>
  );
}
