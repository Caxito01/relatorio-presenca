// Lógica de processamento de presença por turnos

import type { IntercomAttendance } from "@/types/intercom";

// =============================================
// TIPOS
// =============================================

// Usamos IntercomAttendance como base dos registros de entrada
export type AttendanceRecord = IntercomAttendance;

export interface ShiftPeriod {
  id_user: string;
  name: string;
  email: string;
  date: string; // YYYY-MM-DD
  shift: "Manhã" | "Tarde" | "Noite";
  shiftIcon: string;
  entry: string; // ISO
  exit: string; // ISO
  entryFormatted: string;
  exitFormatted: string;
  presentMinutes: number;
  awayMinutes: number;
  presentFormatted: string;
  awayFormatted: string;
  availabilityPercent: number;
  status: "normal" | "overtime" | "suspicious" | "checkin_only" | "high_absence";
  statusLabel: string;
}

export interface DailySummary {
  id_user: string;
  name: string;
  email: string;
  date: string; // YYYY-MM-DD
  shifts: ShiftPeriod[];
  totalPresentMinutes: number;
  totalAwayMinutes: number;
  totalPresentFormatted: string;
  totalAwayFormatted: string;
  totalAvailabilityPercent: number;
}

// =============================================
// CONSTANTES - DEFINIÇÃO DOS TURNOS
// =============================================

export const SHIFTS = {
  Manhã: { start: 6 * 60, end: 11 * 60 + 59, icon: "🌅", overtimeAfter: 12 * 60 },
  Tarde: { start: 12 * 60, end: 18 * 60, icon: "☀️", overtimeAfter: 18 * 60 },
  Noite: { start: 18 * 60 + 1, end: 23 * 60 + 59, icon: "🌙", overtimeAfter: 22 * 60 },
} as const;

export type ShiftName = keyof typeof SHIFTS;

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================

function getMinutesOfDay(date: Date): number {
  // Usa horário UTC para ser consistente com os timestamps do Supabase
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function formatMinutesLocal(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("T");
  if (parts.length < 2) return "-";
  const timePart = parts[1];
  const [hour, minute] = timePart.split(":");
  if (!hour || !minute) return "-";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function formatTimeFromDate(date: Date): string {
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function extractDateOnly(dateStr: string): string {
  const [datePart] = dateStr.split("T");
  return datePart;
}

function getMinutesOfDayFromString(dateStr: string): number {
  const parts = dateStr.split("T");
  if (parts.length < 2) return 0;
  const timePart = parts[1];
  const [hourStr, minuteStr] = timePart.split(":");
  const hour = parseInt(hourStr ?? "0", 10);
  const minute = parseInt(minuteStr ?? "0", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return hour * 60 + minute;
}

// =============================================
// REGRA 1: CORTE AUTOMÁTICO DE TURNO
// =============================================

function splitPeriodByShifts(
  entry: Date,
  exit: Date,
): { shift: ShiftName; entry: Date; exit: Date; ratio: number }[] {
  const results: { shift: ShiftName; entry: Date; exit: Date; ratio: number }[] = [];
  const totalMinutes = (exit.getTime() - entry.getTime()) / 60000;

  const entryMinutes = getMinutesOfDay(entry);
  const exitMinutes = getMinutesOfDay(exit);

  const shiftsOrder: ShiftName[] = ["Manhã", "Tarde", "Noite"];

  for (const shiftName of shiftsOrder) {
    const shift = SHIFTS[shiftName];

    // Verificar se há sobreposição
    const overlapStart = Math.max(entryMinutes, shift.start);
    const overlapEnd = Math.min(exitMinutes, shift.end);

    if (overlapStart < overlapEnd) {
      const periodEntry = new Date(entry);
      periodEntry.setUTCHours(Math.floor(overlapStart / 60), overlapStart % 60, 0, 0);

      const periodExit = new Date(entry);
      periodExit.setUTCHours(Math.floor(overlapEnd / 60), overlapEnd % 60, 0, 0);

      const periodMinutes = overlapEnd - overlapStart;
      const ratio = totalMinutes > 0 ? periodMinutes / totalMinutes : 0;

      results.push({
        shift: shiftName,
        entry: periodEntry,
        exit: periodExit,
        ratio,
      });
    }
  }

  return results;
}

// =============================================
// REGRA 2: VALIDAÇÃO DE REGISTROS
// =============================================

function validateAndGetStatus(
  presentMinutes: number,
  awayMinutes: number,
  shift: ShiftName,
  exitMinutes: number,
): { status: ShiftPeriod["status"]; label: string } {
  const total = presentMinutes + awayMinutes;
  const availabilityPercent = total > 0 ? (presentMinutes / total) * 100 : 0;

  // Check-in apenas (0 minutos)
  if (total === 0) {
    return { status: "checkin_only", label: "🔄 Check-in" };
  }

  // Registro suspeito (< 5 minutos)
  if (total < 5) {
    return { status: "suspicious", label: "⚠️ Suspeito" };
  }

  // Alta ausência (> 50%)
  if (availabilityPercent < 50) {
    return { status: "high_absence", label: "❌ Alta ausência" };
  }

  // Hora extra
  const overtimeLimit = SHIFTS[shift].overtimeAfter;
  if (exitMinutes > overtimeLimit) {
    return { status: "overtime", label: "+HE" };
  }

  return { status: "normal", label: "✅" };
}

// =============================================
// FUNÇÃO PRINCIPAL: PROCESSAR REGISTROS
// =============================================

export function processAttendanceRecords(records: AttendanceRecord[]): DailySummary[] {
  // 1. Agrupar por usuário
  const byUser: Record<string, AttendanceRecord[]> = {};
  records.forEach((r) => {
    if (!byUser[r.id_user]) byUser[r.id_user] = [];
    byUser[r.id_user].push(r);
  });

  const allDailySummaries: DailySummary[] = [];

  // 2. Processar cada usuário
  Object.entries(byUser).forEach(([userId, userRecords]) => {
    // Agrupar por data (YYYY-MM-DD extraído da string)
    const byDate: Record<string, AttendanceRecord[]> = {};
    userRecords.forEach((r) => {
      const dateOnly = extractDateOnly(r.date);
      if (!byDate[dateOnly]) byDate[dateOnly] = [];
      byDate[dateOnly].push(r);
    });

    // 3. Processar cada dia
    Object.entries(byDate).forEach(([dateOnly, dayRecords]) => {
      const sorted = [...dayRecords].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      if (sorted.length === 0) return;

      // Calcular períodos brutos de presença/ausência
      const rawPeriods: { entry: Date; exit: Date; present: number; away: number }[] = [];

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const entryDate = new Date(current.date);
        const exitDate = new Date(next.date);
        const duration = (exitDate.getTime() - entryDate.getTime()) / 60000;

        if (
          rawPeriods.length === 0 ||
          current.away_mode_enabled !== sorted[i - 1]?.away_mode_enabled
        ) {
          rawPeriods.push({
            entry: entryDate,
            exit: exitDate,
            present: current.away_mode_enabled === 0 ? duration : 0,
            away: current.away_mode_enabled === 1 ? duration : 0,
          });
        } else {
          const last = rawPeriods[rawPeriods.length - 1];
          last.exit = exitDate;
          if (current.away_mode_enabled === 0) {
            last.present += duration;
          } else {
            last.away += duration;
          }
        }
      }

      if (rawPeriods.length === 0) return;

      // 4. Calcular presença/ausência exata por turno via interseção real
      const shiftPresent: Record<ShiftName, number> = { Manhã: 0, Tarde: 0, Noite: 0 };
      const shiftAway: Record<ShiftName, number> = { Manhã: 0, Tarde: 0, Noite: 0 };
      const activeShifts = new Set<ShiftName>();
      const shiftsOrder: ShiftName[] = ["Manhã", "Tarde", "Noite"];

      rawPeriods.forEach((period) => {
        const periodStartMin = getMinutesOfDay(period.entry);
        const periodEndMin = getMinutesOfDay(period.exit);
        const isPresent = period.present > 0;

        for (const shiftName of shiftsOrder) {
          const shift = SHIFTS[shiftName];
          const overlapStart = Math.max(periodStartMin, shift.start);
          const overlapEnd = Math.min(periodEndMin, shift.end);

          if (overlapStart < overlapEnd) {
            activeShifts.add(shiftName);
            if (isPresent) {
              shiftPresent[shiftName] += overlapEnd - overlapStart;
            } else {
              shiftAway[shiftName] += overlapEnd - overlapStart;
            }
          }
        }
      });

      // 5. Montar ShiftPeriods apenas para turnos com atividade real
      const shiftPeriods: Map<string, ShiftPeriod> = new Map();
      const first = sorted[0];

      for (const shiftName of shiftsOrder) {
        if (!activeShifts.has(shiftName)) continue;

        const shiftConfig = SHIFTS[shiftName];
        const presentInShift = Math.round(shiftPresent[shiftName]);
        const awayInShift = Math.round(shiftAway[shiftName]);
        const total = presentInShift + awayInShift;
        const availability = total > 0 ? Math.round((presentInShift / total) * 100) : 0;

        // Encontrar primeiro e último registro do Supabase dentro do turno
        const eventsInShift = sorted.filter((rec) => {
          const minutes = getMinutesOfDayFromString(rec.date);
          return minutes >= shiftConfig.start && minutes <= shiftConfig.end;
        });

        const shiftStartDate = new Date(`${dateOnly}T00:00:00Z`);
        shiftStartDate.setUTCHours(Math.floor(shiftConfig.start / 60), shiftConfig.start % 60, 0, 0);
        const shiftEndDate = new Date(`${dateOnly}T00:00:00Z`);
        shiftEndDate.setUTCHours(Math.floor(shiftConfig.end / 60), shiftConfig.end % 60, 0, 0);

        const displayEntryRaw =
          eventsInShift.length > 0 ? eventsInShift[0].date : shiftStartDate.toISOString();
        const displayExitRaw =
          eventsInShift.length > 0
            ? eventsInShift[eventsInShift.length - 1].date
            : shiftEndDate.toISOString();

        const exitMinutes =
          eventsInShift.length > 0
            ? getMinutesOfDayFromString(eventsInShift[eventsInShift.length - 1].date)
            : shiftConfig.end;

        const { status, label } = validateAndGetStatus(
          presentInShift,
          awayInShift,
          shiftName,
          exitMinutes,
        );

        const key = `${dateOnly}-${shiftName}`;

        shiftPeriods.set(key, {
          id_user: userId,
          name: first.name,
          email: first.email,
          date: dateOnly,
          shift: shiftName,
          shiftIcon: SHIFTS[shiftName].icon,
          entry: displayEntryRaw,
          exit: displayExitRaw,
          entryFormatted: formatTime(displayEntryRaw),
          exitFormatted: formatTime(displayExitRaw),
          presentMinutes: presentInShift,
          awayMinutes: awayInShift,
          presentFormatted: formatMinutesLocal(presentInShift),
          awayFormatted: formatMinutesLocal(awayInShift),
          availabilityPercent: availability,
          status,
          statusLabel: label,
        });
      }

      const shifts = Array.from(shiftPeriods.values());
      const dailyPresent = shifts.reduce((sum, s) => sum + s.presentMinutes, 0);
      const dailyAway = shifts.reduce((sum, s) => sum + s.awayMinutes, 0);
      const dailyTotal = dailyPresent + dailyAway;

      allDailySummaries.push({
        id_user: userId,
        name: first.name,
        email: first.email,
        date: dateOnly,
        shifts,
        totalPresentMinutes: dailyPresent,
        totalAwayMinutes: dailyAway,
        totalPresentFormatted: formatMinutesLocal(dailyPresent),
        totalAwayFormatted: formatMinutesLocal(dailyAway),
        totalAvailabilityPercent:
          dailyTotal > 0 ? Math.round((dailyPresent / dailyTotal) * 100) : 0,
      });
    });
  });

  // Ordenar por data
  return allDailySummaries.sort((a, b) => a.date.localeCompare(b.date));
}
