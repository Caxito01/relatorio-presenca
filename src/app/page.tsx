"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  ChevronLeft,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  BarChart2,
} from "lucide-react";
import { useAttendance } from "@/hooks/useAttendance";
import type { AttendanceSummary, TimelineEvent } from "@/types/intercom";
import { formatMinutes } from "@/lib/calculations";
import { ThemeToggle } from "@/components/ThemeToggle";

const formatTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("pt-BR");
};

type StatusBadgeProps = {
  status: "online" | "away";
  reason: string | null;
};

const StatusBadge = ({ status, reason }: StatusBadgeProps) => {
  if (status === "online") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <span className="w-2 h-2 mr-1.5 bg-green-500 rounded-full animate-pulse"></span>
        Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <span className="w-2 h-2 mr-1.5 bg-red-500 rounded-full"></span>
      {reason || "Ausente"}
    </span>
  );
};

type SummaryCardProps = {
  icon: LucideIcon;
  title: string;
  value: number | string;
  color: string;
};

const SummaryCard = ({ icon: Icon, title, value, color }: SummaryCardProps) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      </div>
      <div
        className={`p-3 rounded-full ${color
          .replace("text-", "bg-")
          .replace("-600", "-100")}`}
      >
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
    </div>
  </div>
);

type TimelineProps = {
  events: TimelineEvent[];
};

const Timeline = ({ events }: TimelineProps) => (
  <div className="space-y-4">
    {events.map((event, idx) => (
      <div key={idx} className="flex items-start gap-4">
        <div className="flex flex-col items-center">
          <div
            className={`w-3 h-3 rounded-full ${
              event.type === "entry" ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          {idx < events.length - 1 && (
            <div className="w-0.5 h-12 bg-gray-200 mt-1"></div>
          )}
        </div>
        <div className="flex-1 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {formatTime(event.timestamp)}
            </span>
            <span
              className={`text-sm ${
                event.type === "entry" ? "text-green-600" : "text-red-600"
              }`}
            >
              {event.type === "entry" ? "→ Entrou" : "← Saiu"}
            </span>
            {event.reason && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {event.reason}
              </span>
            )}
          </div>
          {event.durationMinutes && (
            <p className="text-sm text-gray-500 mt-1">
              ⏱️ Duração: {formatMinutes(event.durationMinutes)}
            </p>
          )}
        </div>
      </div>
    ))}
  </div>
);

type DashboardProps = {
  summary: AttendanceSummary[];
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onRefresh: () => void;
};

function Dashboard({
  summary,
  startDate,
  endDate,
  onDateChange,
  onRefresh,
}: DashboardProps) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "away">(
    "all",
  );
  const [nameFilter, setNameFilter] = useState("");

  const summaryData = useMemo(() => summary, [summary]);

  const filteredData = useMemo(
    () =>
      summaryData.filter((user) => {
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "online" && user.currentStatus === "online") ||
          (statusFilter === "away" && user.currentStatus === "away");
        const matchesName =
          nameFilter.trim() === "" ||
          user.name.toLowerCase().includes(nameFilter.trim().toLowerCase());
        return matchesStatus && matchesName;
      }),
    [summaryData, statusFilter, nameFilter],
  );

  const stats = useMemo(
    () => ({
      total: summaryData.length,
      online: summaryData.filter((u) => u.currentStatus === "online").length,
      away: summaryData.filter((u) => u.currentStatus === "away").length,
    }),
    [summaryData],
  );

  if (selectedUser) {
    const user = summaryData.find((u) => u.id_user === selectedUser);
    if (!user) return null;

    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setSelectedUser(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Voltar ao Dashboard
          </button>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
                <p className="text-gray-500 mt-1">{user.email}</p>
                <p className="text-sm text-gray-400 mt-1">ID: {user.id_user}</p>
              </div>
              <StatusBadge
                status={user.currentStatus}
                reason={user.currentReason}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-sm text-gray-500">Presente</p>
              <p className="text-2xl font-bold text-green-600">
                {formatMinutes(user.totalPresentMinutes)}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-sm text-gray-500">Ausente</p>
              <p className="text-2xl font-bold text-red-600">
                {formatMinutes(user.totalAwayMinutes)}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-sm text-gray-500">Disponibilidade</p>
              <p className="text-2xl font-bold text-blue-600">
                {user.availabilityPercent}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Timeline - {formatDate(startDate)}
            </h2>
            <Timeline events={user.timeline} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              📊 Relatório de Presença
            </h1>
            <p className="text-sm text-gray-500">Intercom - BotConversa</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/relatorios/atendente"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold tracking-wide"
            >
              <BarChart2 className="w-4 h-4" />
              RELATÓRIO DIÁRIO POR ATENDENTE
            </Link>
            <ThemeToggle />
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500">De</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const newStart = e.target.value;
                  onDateChange(newStart, endDate);
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500 ml-2">Até</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  const newEnd = e.target.value;
                  onDateChange(startDate, newEnd);
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar atendente..."
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | "online" | "away")
                }
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos os status</option>
                <option value="online">Online</option>
                <option value="away">Ausentes</option>
              </select>
            </div>
            {/* Botão de atualizar usando o hook */}
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard
            icon={Users}
            title="Total Atendentes"
            value={stats.total}
            color="text-blue-600"
          />
          <SummaryCard
            icon={UserCheck}
            title="Online"
            value={stats.online}
            color="text-green-600"
          />
          <SummaryCard
            icon={UserX}
            title="Ausentes"
            value={stats.away}
            color="text-red-600"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Atendentes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Atendente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Presente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ausente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Disponibilidade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredData.map((user) => (
                  <tr
                    key={user.id_user}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge
                        status={user.currentStatus}
                        reason={user.currentReason}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-green-600 font-medium">
                        {formatMinutes(user.totalPresentMinutes)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-red-600 font-medium">
                        {formatMinutes(user.totalAwayMinutes)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${user.availabilityPercent}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-600">
                          {user.availabilityPercent}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedUser(user.id_user)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                      >
                        Ver detalhes →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(oneWeekAgo.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const { summary, loading, error, refetch } = useAttendance(
    startDate,
    endDate,
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Erro: {error.message}</div>
      </div>
    );
  }

  return (
    <Dashboard
      summary={summary}
      startDate={startDate}
      endDate={endDate}
      onDateChange={(start, end) => {
        setStartDate(start);
        setEndDate(end);
      }}
      onRefresh={refetch}
    />
  );
}
