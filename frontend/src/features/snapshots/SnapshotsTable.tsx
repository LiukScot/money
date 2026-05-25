import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatCurrency } from "@/lib";
import type { Snapshot } from "@/types";

type Props = {
  rows: Snapshot[];
  onDelete: (id: string) => void;
};

export function SnapshotsTable({ rows, onDelete }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Low</TableHead>
          <TableHead>Medium</TableHead>
          <TableHead>High</TableHead>
          <TableHead>Liquid</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.snapshotDate}</TableCell>
            <TableCell>{formatCurrency(row.lowRisk)}</TableCell>
            <TableCell>{formatCurrency(row.mediumRisk)}</TableCell>
            <TableCell>{formatCurrency(row.highRisk)}</TableCell>
            <TableCell>{formatCurrency(row.liquid)}</TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => onDelete(row.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
