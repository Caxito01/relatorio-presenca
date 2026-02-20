import { supabase } from '@/lib/supabaseClient';
import type { IntercomAttendance } from '@/types/intercom';

export const attendanceService = {
  async getByDateRange(startDate: string, endDate: string): Promise<IntercomAttendance[]> {
    const all: IntercomAttendance[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('intercom_attendance')
        .select('*')
        .gte('date', `${startDate}T00:00:00`)
        .lte('date', `${endDate}T23:59:59`)
        .order('date', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as IntercomAttendance[]));
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  },

  async getByUser(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<IntercomAttendance[]> {
    const all: IntercomAttendance[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      let query = supabase
        .from('intercom_attendance')
        .select('*')
        .eq('id_user', userId)
        .order('date', { ascending: true });

      if (startDate) query = query.gte('date', `${startDate}T00:00:00`);
      if (endDate) query = query.lte('date', `${endDate}T23:59:59`);

      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as IntercomAttendance[]));
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  },

  async getUniqueAttendants(): Promise<{ id_user: string; name: string; email: string }[]> {
    const allData: { id_user: string; name: string; email: string }[] = [];
    const pageSize = 1000; // Supabase anon key limita 1000 linhas por request
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from('intercom_attendance')
        .select('id_user, name, email')
        .order('id_user')
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allData.push(...(data as { id_user: string; name: string; email: string }[]));
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const unique = [...new Map(allData.map((i) => [i.id_user, i])).values()];
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getByName(
    name: string,
    startDate?: string,
    endDate?: string,
  ): Promise<IntercomAttendance[]> {
    let query = supabase
      .from('intercom_attendance')
      .select('*')
      .ilike('name', `%${name}%`)
      .order('date', { ascending: true });

    if (startDate) query = query.gte('date', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('date', `${endDate}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getCurrentStatus(): Promise<IntercomAttendance[]> {
    const { data, error } = await supabase
      .from('intercom_attendance')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;

    const latestByUser = (data || []).reduce<Record<string, IntercomAttendance>>(
      (acc, curr) => {
        if (!acc[curr.id_user]) acc[curr.id_user] = curr as IntercomAttendance;
        return acc;
      },
      {},
    );

    return Object.values(latestByUser);
  },
};
