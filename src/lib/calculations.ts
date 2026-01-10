import type { IntercomAttendance, AttendanceSummary, TimelineEvent } from '@/types/intercom';

export function calculateAttendance(records: IntercomAttendance[]): AttendanceSummary[] {
  const grouped = records.reduce<Record<string, IntercomAttendance[]>>((acc, record) => {
    if (!acc[record.id_user]) acc[record.id_user] = [];
    acc[record.id_user].push(record);
    return acc;
  }, {});

  return Object.entries(grouped).map<AttendanceSummary>(([userId, userRecords]) => {
    const sorted = [...userRecords].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Compactar registros que ocorrem no mesmo minuto (HH:MM),
    // mantendo apenas o último registro desse minuto.
    const minuteCompacted: IntercomAttendance[] = [];
    for (const rec of sorted) {
      const minuteKey = rec.date.slice(0, 16); // "YYYY-MM-DDTHH:MM"
      const last = minuteCompacted[minuteCompacted.length - 1];
      if (last && last.date.slice(0, 16) === minuteKey) {
        minuteCompacted[minuteCompacted.length - 1] = rec;
      } else {
        minuteCompacted.push(rec);
      }
    }

    let totalPresent = 0;
    let totalAway = 0;
    const timeline: TimelineEvent[] = [];

    for (let i = 0; i < minuteCompacted.length; i++) {
      const current = minuteCompacted[i];
      const next = minuteCompacted[i + 1];

      const event: TimelineEvent = {
        timestamp: current.date,
        type: current.away_mode_enabled === 1 ? 'exit' : 'entry',
        reason: current.away_status_reason,
      };

      if (next) {
        const duration =
          (new Date(next.date).getTime() - new Date(current.date).getTime()) / 60000;
        event.durationMinutes = duration;

        if (current.away_mode_enabled === 1) {
          totalAway += duration;
        } else {
          totalPresent += duration;
        }
      }

      timeline.push(event);
    }

    const lastRecord = minuteCompacted[minuteCompacted.length - 1];
    const total = totalPresent + totalAway;

    return {
      id_user: userId,
      name: userRecords[0].name,
      email: userRecords[0].email,
      totalPresentMinutes: totalPresent,
      totalAwayMinutes: totalAway,
      currentStatus: lastRecord?.away_mode_enabled === 1 ? 'away' : 'online',
      currentReason: lastRecord?.away_status_reason || null,
      availabilityPercent: total > 0 ? Math.round((totalPresent / total) * 100) : 100,
      timeline,
    };
  });
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '0m';
  // Arredonda o total de minutos primeiro para evitar casos como 7h 60m
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
