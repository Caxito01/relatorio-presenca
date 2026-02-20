import { supabase } from '@/lib/supabaseClient';
import type { IntercomAttendance } from '@/types/intercom';

export const attendanceService = {
  async getByDateRange(startDate: string, endDate: string): Promise<IntercomAttendance[]> {
    const { data, error } = await supabase
      .from('intercom_attendance')
      .select('*')
      .gte('date', `${startDate}T00:00:00`)
      .lte('date', `${endDate}T23:59:59`)
      .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getByUser(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<IntercomAttendance[]> {
    let query = supabase
      .from('intercom_attendance')
      .select('*')
      .eq('id_user', userId)
      .order('date', { ascending: true });

    if (startDate) query = query.gte('date', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('date', `${endDate}T23:59:59`);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getUniqueAttendants(): Promise<{ id_user: string; name: string; email: string }[]> {
    const { data, error } = await supabase
      .from('intercom_attendance')
      .select('id_user, name, email')
      .order('name');

    if (error) throw error;

    const unique = [...new Map((data || []).map((i) => [i.id_user, i])).values()];
    return unique as { id_user: string; name: string; email: string }[];
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
