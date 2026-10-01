import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/features/dashboard/dashboard-utils'
import { formatPeriod } from '../report-utils'
import type { ReportGroupBy, ReportSummaryData } from '../types/reports'

interface ReportSummaryProps {
  data: ReportSummaryData
  groupBy: ReportGroupBy
}

/** Tabla detallada por período de GET /admin/reports/summary, con fila de totales. */
export function ReportSummary({ data, groupBy }: ReportSummaryProps) {
  const { summary, byChannel } = data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalle por período</CardTitle>
        <CardDescription>
          Pedidos entregados, por canal. Un cliente que compró por los dos
          canales cuenta una sola vez en el total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead className="text-right">App</TableHead>
              <TableHead className="text-right">Teléfono</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">App</TableHead>
              <TableHead className="text-right">Teléfono</TableHead>
              <TableHead className="text-right">Clientes</TableHead>
              <TableHead className="text-right">App</TableHead>
              <TableHead className="text-right">Teléfono</TableHead>
              <TableHead className="text-right">Ticket prom.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((row) => (
              <TableRow key={row.period}>
                <TableCell>{formatPeriod(row.period, groupBy)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(row.revenue)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.revenueApp)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.revenuePhone)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {row.orders}
                </TableCell>
                <TableCell className="text-right">{row.ordersApp}</TableCell>
                <TableCell className="text-right">{row.ordersPhone}</TableCell>
                <TableCell className="text-right font-medium">
                  {row.customers}
                </TableCell>
                <TableCell className="text-right">{row.customersApp}</TableCell>
                <TableCell className="text-right">
                  {row.customersPhone}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.averageTicket)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">
                {formatCurrency(summary.totalRevenue)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(byChannel.app.revenue)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(byChannel.phone.revenue)}
              </TableCell>
              <TableCell className="text-right">
                {summary.totalOrders}
              </TableCell>
              <TableCell className="text-right">
                {byChannel.app.orders}
              </TableCell>
              <TableCell className="text-right">
                {byChannel.phone.orders}
              </TableCell>
              <TableCell className="text-right">
                {summary.totalCustomers}
              </TableCell>
              <TableCell className="text-right">
                {byChannel.app.customers}
              </TableCell>
              <TableCell className="text-right">
                {byChannel.phone.customers}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(summary.averageTicket)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}
