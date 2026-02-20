"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, User, Users, ArrowLeft } from "lucide-react";

import { attendanceService } from "@/services/attendanceService";
import type { IntercomAttendance } from "@/types/intercom";
import { formatMinutes } from "@/lib/calculations";
import { processAttendanceRecords } from "@/lib/attendanceShifts";
import type { DailySummary } from "@/lib/attendanceShifts";
import { ThemeToggle } from "@/components/ThemeToggle";

type AttendantOption = {
  id_user: string;
  name: string;
};

type DailyRow = {
  dateKey: string; // YYYY-MM-DD
  label: string; // ex: Segunda - 06/01/2026
  weekday: string;
  totalPresentMinutes: number;
  totalAwayMinutes: number;
  firstEventTime: string | null;
  lastEventTime: string | null;
  currentStatus: "online" | "away" | "none";
  reasons: string[];
};

function formatFilterDate(dateStr: string): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function buildDailyRows(
  records: IntercomAttendance[],
  startDate: string,
  endDate: string,
): DailyRow[] {
  const byDay = records.reduce<Record<string, IntercomAttendance[]>>(
    (acc, rec) => {
      const d = new Date(rec.date);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!acc[key]) acc[key] = [];
      acc[key].push(rec);
      return acc;
    },
    {},
  );

  const rows: DailyRow[] = [];

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const dayRecords = byDay[key] ?? [];

    if (dayRecords.length === 0) continue;

    const dayDateForLabel = new Date(`${key}T12:00:00Z`);

    const sorted = [...dayRecords].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let totalPresent = 0;
    let totalAway = 0;
    let firstEventTime: string | null = null;
    let lastEventTime: string | null = null;
    const awayEventLabels: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      const currentDate = new Date(current.date);
      if (!firstEventTime) {
        firstEventTime = current.date.substring(11, 16); // HH:MM UTC
      }
      lastEventTime = current.date.substring(11, 16); // HH:MM UTC

      if (next) {
        const diffMinutes =
          (new Date(next.date).getTime() - currentDate.getTime()) / 60000;
        if (current.away_mode_enabled === 1) totalAway += diffMinutes;
        else totalPresent += diffMinutes;

        if (current.away_mode_enabled === 1) {
          const time = current.date.substring(11, 16);
          const reason = current.away_status_reason || "Ausente";
          awayEventLabels.push(`${time} ${reason} (${formatMinutes(diffMinutes)})`);
        }
      } else {
        if (current.away_mode_enabled === 1) {
          const time = current.date.substring(11, 16);
          const reason = current.away_status_reason || "Ausente";
          awayEventLabels.push(`${time} ${reason}`);
        }
      }
    }

    const anyRecord = sorted[sorted.length - 1];
    const weekday = dayDateForLabel.toLocaleDateString("pt-BR", {
      weekday: "long",
    });
    const formattedDate = dayDateForLabel.toLocaleDateString("pt-BR");

    rows.push({
      dateKey: key,
      label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${formattedDate}`,
      weekday,
      totalPresentMinutes: totalPresent,
      totalAwayMinutes: totalAway,
      firstEventTime,
      lastEventTime,
      currentStatus: anyRecord.away_mode_enabled === 1 ? "away" : "online",
      reasons: awayEventLabels,
    });
  }

  return rows;
}

export default function AttendantDailyReportPage() {
  const [attendants, setAttendants] = useState<AttendantOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [records, setRecords] = useState<IntercomAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(
    oneWeekAgo.toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const loadAttendants = async (start: string, end: string) => {
    // Limpa imediatamente para nenhum nome antigo aparecer enquanto carrega
    setAttendants([]);
    setSelectedUserId("");
    setRecords([]);
    try {
      const uniqueList = await attendanceService.getUniqueAttendantsByDateRange(start, end);
      const attendantOptions: AttendantOption[] = uniqueList.map((a) => ({
        id_user: a.id_user,
        name: a.name,
      }));
      setAttendants(attendantOptions);
      const firstId = attendantOptions[0]?.id_user ?? "";
      setSelectedUserId(firstId);
      // Carrega registros imediatamente com as datas certas (sem depender de closure)
      if (firstId) await loadRecords(firstId, start, end);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar atendentes";
      setError(msg);
    }
  };

  const loadRecords = async (userId: string, start: string, end: string) => {
    if (!userId) { setRecords([]); return; }
    try {
      setLoading(true);
      setError(null);
      const userRecords = await attendanceService.getByUser(userId, start, end);
      setRecords(userRecords);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar registros";
      console.error(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Compatibilidade removida — filtros já aplicam via useEffect

  // Recarrega lista de atendentes sempre que as datas mudarem
  useEffect(() => {
    loadAttendants(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // Carrega registros sempre que usuário ou datas mudarem
  useEffect(() => {
    if (selectedUserId) {
      loadRecords(selectedUserId, startDate, endDate);
    }
  }, [selectedUserId, startDate, endDate]);

  const dailySummaries: DailySummary[] = useMemo(
    () => processAttendanceRecords(records),
    [records],
  );

  const allShifts = useMemo(
    () => dailySummaries.flatMap((s) => s.shifts),
    [dailySummaries],
  );

  const dailyRows = useMemo(
    () => buildDailyRows(records, startDate, endDate),
    [records, startDate, endDate],
  );

  const selectedUser = useMemo(
    () => attendants.find((a) => a.id_user === selectedUserId) || null,
    [attendants, selectedUserId],
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Relatório Diário por Atendente
              </h1>
              <p className="text-sm text-gray-500">
                Visualize presença e ausências dia a dia para um atendente
                específico.
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 min-w-[260px]">
            <Users className="w-5 h-5 text-gray-400" />
            <div className="flex flex-col flex-1">
              <span className="text-sm text-gray-500">Atendente</span>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione um atendente</option>
                {attendants.map((a) => (
                  <option key={a.id_user} value={a.id_user}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div className="flex flex-col">
              <span className="text-sm text-gray-500">De</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-gray-500">Até</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* ---- PRESENÇA POR TURNO ---- */}
        {allShifts.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Presença por turno
              </h2>
              <span className="text-xs text-gray-400">
                Agrupado por data e turno · Período: {formatFilterDate(startDate)} – {formatFilterDate(endDate)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Atendente</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Turno</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Entrada</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Saída</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Presente</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Ausente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    const uniqueDates = [...new Set(allShifts.map((s) => s.date))];
                    const dateIndexMap = Object.fromEntries(uniqueDates.map((d, i) => [d, i]));
                    return allShifts.map((shift, idx) => {
                      const isEven = dateIndexMap[shift.date] % 2 === 0;
                      return (
                        <tr key={idx} className={isEven ? "hover:bg-blue-50" : "bg-blue-50 hover:bg-blue-100"}>
                          <td className="px-6 py-4 font-medium text-gray-900">{shift.name}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {new Date(shift.date + "T12:00:00Z").toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {shift.shiftIcon} {shift.shift}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-800">{shift.entryFormatted}</td>
                          <td className="px-6 py-4 text-gray-800">{shift.exitFormatted}</td>
                          <td className="px-6 py-4 text-green-600 font-medium">{shift.presentFormatted}</td>
                          <td className="px-6 py-4 text-red-600 font-medium">{shift.awayFormatted}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selectedUser && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                {selectedUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm text-gray-500">Atendente selecionado</p>
                <p className="font-semibold text-gray-900">{selectedUser.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <User className="w-4 h-4" />
                <span>ID: {selectedUser.id_user}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>
                  Período: {formatFilterDate(startDate)} - {formatFilterDate(
                    endDate,
                  )} ({dailyRows.length} dia(s))
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Dias da semana e detalhes
            </h2>
            {loading && (
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                Carregando...
              </span>
            )}
          </div>

          {error && (
            <div className="px-6 py-3 bg-red-50 text-sm text-red-700 border-b border-red-100">
              {error}
            </div>
          )}

          {!selectedUserId ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              Selecione um atendente e um período para visualizar o relatório.
            </div>
          ) : dailyRows.length === 0 && !loading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              Nenhum registro encontrado para o período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Dia
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Status atual
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Primeiro registro
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Último registro
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Tempo presente
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Tempo ausente
                    </th>
                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Motivos de ausência
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dailyRows.map((row, idx) => (
                    <tr key={row.dateKey} className={idx % 2 === 0 ? "hover:bg-blue-50" : "bg-blue-50 hover:bg-blue-100"}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {row.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            Chave: {row.dateKey}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {row.currentStatus === "none" ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <span className="w-2 h-2 mr-1.5 bg-gray-400 rounded-full" />
                            Sem registros
                          </span>
                        ) : (
                          <span
                            className={
                              row.currentStatus === "online"
                                ? "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                : "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                            }
                          >
                            <span
                              className={
                                row.currentStatus === "online"
                                  ? "w-2 h-2 mr-1.5 bg-green-500 rounded-full"
                                  : "w-2 h-2 mr-1.5 bg-red-500 rounded-full"
                              }
                            />
                            {row.currentStatus === "online" ? "Online" : "Ausente"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {row.firstEventTime ? row.firstEventTime : "-"}
                      </td>
                      <td className="px-6 py-4">
                        {row.lastEventTime ? row.lastEventTime : "-"}
                      </td>
                      <td className="px-6 py-4 text-green-600 font-medium">
                        {formatMinutes(row.totalPresentMinutes)}
                      </td>
                      <td className="px-6 py-4 text-red-600 font-medium">
                        {formatMinutes(row.totalAwayMinutes)}
                      </td>
                      <td className="px-6 py-4">
                        {row.reasons.length === 0 ? (
                          <span className="text-xs text-gray-400">Sem motivo informado</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.reasons.map((reason) => (
                              <span
                                key={reason}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
