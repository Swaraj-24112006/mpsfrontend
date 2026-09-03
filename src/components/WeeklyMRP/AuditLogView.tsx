import React from 'react';
import {
  VendorDeliveryScheduleChangeLog,
  UserRole,
  FGPlanFreezeItem
} from '../../types';
import { History, Search, Filter } from 'lucide-react';

interface AuditLogViewProps {
  deliveryScheduleChangeLogs: VendorDeliveryScheduleChangeLog[];
  planFreezeList: FGPlanFreezeItem[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  deliveryScheduleChangeLogs,
  planFreezeList
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">System Audit Log</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Timestamp</th>
                <th className="px-3 py-2.5">User Role</th>
                <th className="px-3 py-2.5">Change Type</th>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-3 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveryScheduleChangeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{log.changedAt}</td>
                  <td className="px-3 py-2.5 text-slate-600">{log.changedBy}</td>
                  <td className="px-3 py-2.5 text-indigo-700 font-medium">Delivery Schedule</td>
                  <td className="px-3 py-2.5 text-slate-900 font-mono">{log.poNumber}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    <span className="font-semibold text-slate-900">{log.fieldChanged}</span>: {log.oldValue} → {log.newValue}
                  </td>
                </tr>
              ))}
              {planFreezeList.filter(item => item.frozenAt).map((item) => (
                <tr key={item.fgCode + item.weekId} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{item.frozenAt}</td>
                  <td className="px-3 py-2.5 text-slate-600">{item.frozenBy}</td>
                  <td className="px-3 py-2.5 text-emerald-700 font-medium">FG Plan Freeze</td>
                  <td className="px-3 py-2.5 text-slate-900 font-mono">{item.fgCode}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    Freeze Status: {item.status} ({item.freezeNotes})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
