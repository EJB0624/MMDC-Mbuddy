(function () {
  const config = window.MBUDDY_CONFIG || {};
  const configured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
  let client = null;
  let userId = null;

  function requireClient() {
    if (!configured) throw new Error('Supabase is not configured');
    if (!client || !userId) throw new Error('Supabase has not been initialized');
  }

  async function init() {
    if (!configured) return { configured: false };
    if (!window.supabase?.createClient) throw new Error('Supabase client failed to load');

    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    const { data: sessionData } = await client.auth.getSession();
    let session = sessionData.session;

    if (!session) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    userId = session.user.id;
    return { configured: true, userId };
  }

  async function listProfiles() {
    requireClient();
    const { data, error } = await client
      .from('profiles')
      .select('id, first_name, course_specialization, year_level, goal, work_style, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function createProfile(profile) {
    requireClient();
    const { data, error } = await client
      .from('profiles')
      .upsert({ user_id: userId, ...profile }, { onConflict: 'user_id' })
      .select('id, first_name, course_specialization, year_level, goal, work_style, created_at')
      .single();
    if (error) throw error;
    return data;
  }

  async function listSavedProfileIds() {
    requireClient();
    const { data, error } = await client
      .from('saved_buddies')
      .select('profile_id');
    if (error) throw error;
    return data.map(row => row.profile_id);
  }

  async function saveProfile(profileId) {
    requireClient();
    const { error } = await client
      .from('saved_buddies')
      .upsert({ user_id: userId, profile_id: profileId }, { onConflict: 'user_id,profile_id' });
    if (error) throw error;
  }

  async function unsaveProfile(profileId) {
    requireClient();
    const { error } = await client
      .from('saved_buddies')
      .delete()
      .eq('user_id', userId)
      .eq('profile_id', profileId);
    if (error) throw error;
  }

  window.mbuddyDb = {
    configured,
    init,
    listProfiles,
    createProfile,
    listSavedProfileIds,
    saveProfile,
    unsaveProfile
  };
}());
