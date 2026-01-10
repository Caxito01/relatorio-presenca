"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, User, Users, ArrowLeft } from "lucide-react";

import { attendanceService } from "@/services/attendanceService";
import type { IntercomAttendance } from "@/types/intercom";
import { formatMinutes } from "@/lib/calculations";
import {
  processAttendanceRecords,
  type ShiftPeriod,
} from "@/lib/attendanceShifts";

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

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateKeyFromString(dateStr: string): string {
  if (!dateStr) return "";
  const [datePart] = dateStr.split("T");
  return datePart && datePart.length >= 10
    ? datePart.slice(0, 10)
    : dateStr.slice(0, 10);
}

function getDisplayTime(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("T");
  if (parts.length < 2) return "-";
  const timePart = parts[1];
  const [hour, minute] = timePart.split(":");
  if (!hour || !minute) return "-";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

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
      const key = getDateKeyFromString(rec.date); // YYYY-MM-DD igual ao banco
      if (!acc[key]) acc[key] = [];
      acc[key].push(rec);
      return acc;
    },
    {},
  );

  const rows: DailyRow[] = [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = getDateKey(d);
    const dayRecords = byDay[key] ?? [];

    if (dayRecords.length === 0) {
      const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
      const formattedDate = d.toLocaleDateString("pt-BR");

      rows.push({
        dateKey: key,
        label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${formattedDate}`,
        weekday,
        totalPresentMinutes: 0,
        totalAwayMinutes: 0,
        firstEventTime: null,
        lastEventTime: null,
        currentStatus: "none",
        reasons: [],
      });
      continue;
    }

    const sorted = [...dayRecords].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    let totalPresent = 0;
    let totalAway = 0;
    let firstEventTime: string | null = null;
    let lastEventTime: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      const currentDate = new Date(current.date);
      const currentTime = getDisplayTime(current.date);
      if (!firstEventTime) {
        firstEventTime = currentTime;
      }
      lastEventTime = currentTime;

      if (next) {
        const diffMinutes =
          (new Date(next.date).getTime() - currentDate.getTime()) / 60000;
        if (current.away_mode_enabled === 1) totalAway += diffMinutes;
        else totalPresent += diffMinutes;
      }
    }

    const anyRecord = sorted[sorted.length - 1];
    const weekday = d.toLocaleDateString("pt-BR", {
      weekday: "long",
    });
    const formattedDate = d.toLocaleDateString("pt-BR");

    const reasonsSet = new Set(
      sorted
        .map((r) => r.away_status_reason)
        .filter((r): r is string => !!r),
    );

    rows.push({
      dateKey: key,
      label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${formattedDate}`,
      weekday,
      totalPresentMinutes: totalPresent,
      totalAwayMinutes: totalAway,
      firstEventTime,
      lastEventTime,
      currentStatus: anyRecord.away_mode_enabled === 1 ? "away" : "online",
      reasons: Array.from(reasonsSet),
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
  const [hasAnyRecordInPeriod, setHasAnyRecordInPeriod] = useState(false);

  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(
    oneWeekAgo.toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await attendanceService.getByDateRange(startDate, endDate);

      setHasAnyRecordInPeriod((data ?? []).length > 0);

      // gerar lista de atendentes únicos apenas dentro do período selecionado
      const uniqueAttendantsMap = new Map<string, AttendantOption>();
      for (const rec of data) {
        if (!uniqueAttendantsMap.has(rec.id_user)) {
          uniqueAttendantsMap.set(rec.id_user, {
            id_user: rec.id_user,
            name: rec.name,
          });
        }
      }
      const uniqueAttendants = Array.from(uniqueAttendantsMap.values());
      setAttendants(uniqueAttendants);

      // se ainda não houver atendente selecionado, selecionar o primeiro da lista
      let effectiveUserId = selectedUserId;
      if (!effectiveUserId && uniqueAttendants.length > 0) {
        effectiveUserId = uniqueAttendants[0].id_user;
        setSelectedUserId(effectiveUserId);
      }

      // filtrar registros do atendente selecionado
      if (effectiveUserId) {
        setRecords(data.filter((rec) => rec.id_user === effectiveUserId));
      } else {
        setRecords([]);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? "Erro ao carregar registros");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, startDate, endDate]);

  const dailyRows = useMemo(
    () => buildDailyRows(records, startDate, endDate),
    [records, startDate, endDate],
  );

  const shiftRows = useMemo(() => {
    if (records.length === 0) return [] as {
      dateKey: string;
      dateLabel: string;
      shift: ShiftPeriod["shift"];
      shiftLabel: string;
      entryTime: string;
      exitTime: string;
      presentMinutes: number;
      awayMinutes: number;
      totalPresentMinutes: number;
      totalAwayMinutes: number;
    }[];

    const summaries = processAttendanceRecords(records);

    const rows: {
      dateKey: string;
      dateLabel: string;
      shift: ShiftPeriod["shift"];
      shiftLabel: string;
      entryTime: string;
      exitTime: string;
      presentMinutes: number;
      awayMinutes: number;
      totalPresentMinutes: number;
      totalAwayMinutes: number;
    }[] = [];

    summaries.forEach((summary) => {
      summary.shifts.forEach((shift) => {
        rows.push({
          dateKey: summary.date,
          dateLabel: formatFilterDate(summary.date),
          shift: shift.shift,
          shiftLabel: `${shift.shiftIcon} ${shift.shift}`,
          entryTime: shift.entryFormatted,
          exitTime: shift.exitFormatted,
          presentMinutes: shift.presentMinutes,
          awayMinutes: shift.awayMinutes,
          totalPresentMinutes: shift.presentMinutes,
          totalAwayMinutes: shift.awayMinutes,
        });
      });
    });

    // ordenar por data e ordem de turno
    const order: ShiftPeriod["shift"][] = ["Manhã", "Tarde", "Noite"];

    rows.sort((a, b) => {
      if (a.dateKey === b.dateKey) {
        return order.indexOf(a.shift) - order.indexOf(b.shift);
      }
      return a.dateKey < b.dateKey ? -1 : 1;
    });

    return rows;
  }, [records, startDate, endDate]);

  const selectedUser = useMemo(
    () => attendants.find((a) => a.id_user === selectedUserId) || null,
    [attendants, selectedUserId],
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6 flex-1">
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
        {!loading && !error && !hasAnyRecordInPeriod && (
          <section className="flex items-center justify-center py-16">
            <div className="text-center text-gray-500 text-sm">
              Período selecionado sem registro
            </div>
          </section>
        )}

        {selectedUser && records.length > 0 && hasAnyRecordInPeriod && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Presença por turno
              </h2>
              <span className="text-sm text-gray-500">
                Agrupado por data e turno · Período: {formatFilterDate(startDate)} - {formatFilterDate(endDate)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Atendente
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Data
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Turno
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Entrada
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Saída
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Presente
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Ausente
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shiftRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        Nenhum registro para o período selecionado.
                      </td>
                    </tr>
                  )}
                  {(() => {
                    let lastDateKey: string | null = null;
                    let useAltColor = false;

                    return shiftRows.map((row, index) => {
                      if (row.dateKey !== lastDateKey) {
                        useAltColor = !useAltColor;
                        lastDateKey = row.dateKey;
                      }

                      const rowBgClass = useAltColor
                        ? "bg-gray-50"
                        : "bg-white";

                      return (
                        <tr
                          key={`${row.dateKey}-${row.shift}-${index}`}
                          className={rowBgClass}
                        >
                          <td className="px-4 py-2 text-gray-700 font-medium">
                            {selectedUser?.name}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {row.dateLabel}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {row.shiftLabel}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {row.entryTime ?? "-"}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {row.exitTime ?? "-"}
                          </td>
                          <td className="px-4 py-2 text-green-600 font-medium">
                            {formatMinutes(row.totalPresentMinutes)}
                          </td>
                          <td className="px-4 py-2 text-red-600 font-medium">
                            {formatMinutes(row.totalAwayMinutes)}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selectedUser && records.length > 0 && hasAnyRecordInPeriod && (
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

        {hasAnyRecordInPeriod && (
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
                  {dailyRows.map((row) => (
                    <tr key={row.dateKey} className="hover:bg-gray-50">
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
        )}
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-gray-500">
          © 2026 CECM - Relatório de Presença Botconversa
        </div>
      </footer>
    </div>
  );
}
