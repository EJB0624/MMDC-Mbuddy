(function () {
  const config = window.MBUDDY_CONFIG || {};
  const configured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
  let client = null;
  let currentUser = null;
  let buddyFeaturesAvailable = true;
  const profileFields = 'id, user_id, first_name, course_specialization, year_level, term, goal, work_style, classes, time_slot, created_at';
  const legacyProfileFields = 'id, user_id, first_name, course_specialization, year_level, goal, work_style, classes, time_slot, created_at';

  function requireClient() {
    if (!configured) throw new Error('Supabase is not configured');
    if (!client) throw new Error('Supabase has not been initialized');
  }

  function requireUser() {
    requireClient();
    if (!currentUser) throw new Error('Sign in to continue');
  }

  async function init() {
    if (!configured) return { configured: false, user: null };
    if (!window.supabase?.createClient) throw new Error('Supabase client failed to load');
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
    return { configured: true, user: currentUser };
  }

  async function signUp(email, password) {
    requireClient();
    const emailRedirectTo = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo }
    });
    if (error) throw error;
    currentUser = data.session?.user || null;
    return { user: data.user, session: data.session };
  }

  async function signIn(email, password) {
    requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data.user;
  }

  async function signOut() {
    requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    currentUser = null;
  }

  async function listProfiles() {
    requireClient();
    let { data, error } = await client
      .from('profiles')
      .select(profileFields)
      .order('created_at', { ascending: false });
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      ({ data, error } = await client.from('profiles').select(legacyProfileFields).order('created_at', { ascending: false }));
      data = data?.map(profile => ({ ...profile, term: null }));
    }
    if (error) throw error;
    return data;
  }

  async function createProfile(profile) {
    requireUser();
    let { data, error } = await client
      .from('profiles')
      .upsert({ user_id: currentUser.id, ...profile }, { onConflict: 'user_id' })
      .select(profileFields)
      .single();
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      const { term, ...legacyProfile } = profile;
      ({ data, error } = await client
        .from('profiles')
        .upsert({ user_id: currentUser.id, ...legacyProfile }, { onConflict: 'user_id' })
        .select(legacyProfileFields)
        .single());
      if (data) data.term = term;
    }
    if (error) throw error;
    return data;
  }

  function buddySchemaError(error) {
    return error?.code === '42883' || error?.code === 'PGRST202' || error?.code === 'PGRST205';
  }

  async function listBuddyRequests() {
    requireUser();
    const { data, error } = await client.rpc('list_buddy_requests');
    if (error && buddySchemaError(error)) {
      buddyFeaturesAvailable = false;
      return [];
    }
    if (error) throw error;
    buddyFeaturesAvailable = true;
    return data || [];
  }

  async function sendBuddyRequest(profileId) {
    requireUser();
    if (!buddyFeaturesAvailable) throw new Error('Run the latest Supabase schema to enable BuddyUp');
    const { error } = await client.rpc('send_buddy_request', { target_profile_id: profileId });
    if (error) {
      if (buddySchemaError(error)) {
        buddyFeaturesAvailable = false;
        throw new Error('Run the latest Supabase schema to enable BuddyUp');
      }
      throw error;
    }
  }

  async function respondToBuddyRequest(requestId, accept) {
    requireUser();
    const { error } = await client.rpc('respond_to_buddy_request', {
      target_request_id: requestId,
      accept_request: accept
    });
    if (error) throw error;
  }

  async function isAdmin() {
    requireUser();
    const { data, error } = await client
      .from('admins')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return false;
      throw error;
    }
    return Boolean(data);
  }

  async function deleteProfile(profileId) {
    requireUser();
    const { data, error } = await client
      .from('profiles')
      .delete()
      .eq('id', profileId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Profile could not be deleted');
  }

  async function listSavedProfileIds() {
    requireUser();
    const { data, error } = await client.from('saved_buddies').select('profile_id');
    if (error) throw error;
    return data.map(row => row.profile_id);
  }

  async function saveProfile(profileId) {
    requireUser();
    const { error } = await client
      .from('saved_buddies')
      .upsert({ user_id: currentUser.id, profile_id: profileId }, { onConflict: 'user_id,profile_id' });
    if (error) throw error;
  }

  async function unsaveProfile(profileId) {
    requireUser();
    const { error } = await client
      .from('saved_buddies')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('profile_id', profileId);
    if (error) throw error;
  }

  window.mbuddyDb = {
    configured,
    init,
    signUp,
    signIn,
    signOut,
    getUser: () => currentUser,
    listProfiles,
    createProfile,
    isAdmin,
    deleteProfile,
    listSavedProfileIds,
    saveProfile,
    unsaveProfile,
    listBuddyRequests,
    sendBuddyRequest,
    respondToBuddyRequest,
    buddyFeaturesAvailable: () => buddyFeaturesAvailable
  };
}());
