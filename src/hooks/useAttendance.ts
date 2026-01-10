import { useCallback, useEffect, useState } from 'react';
import { attendanceService } from '@/services/attendanceService';
import type { IntercomAttendance, AttendanceSummary } from '@/types/intercom';
import { supabase } from '@/lib/supabaseClient';
import { calculateAttendance } from '@/lib/calculations';

export function useAttendance(startDate: string, endDate: string) {
  const [data, setData] = useState<IntercomAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const records = await attendanceService.getByDateRange(startDate, endDate);
      setData(records);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intercom_attendance' },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const summary: AttendanceSummary[] = calculateAttendance(data);

  return { data, summary, loading, error, refetch: fetchData };
}
