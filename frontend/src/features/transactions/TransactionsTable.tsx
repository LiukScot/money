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
import type { Transaction } from "@/types";

type Props = {
  rows: Transaction[];
  onEdit: (row: Transaction) => void;
  onDelete: (id: string) => void;
};

export function TransactionsTable({ rows, onEdit, onDelete }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Current</TableHead>
          <TableHead>PnL</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.txDate}</TableCell>
            <TableCell>{row.asset}</TableCell>
            <TableCell>{row.tipo}</TableCell>
            <TableCell>{formatCurrency(row.currentValue)}</TableCell>
            <TableCell>{formatCurrency(row.pnl)}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(row.id)}>
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
