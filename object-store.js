(function () {
  // Saved buddies and requests remain session-only demonstrations.
  const data = { profiles: [], savedBuddies: [], buddyRequests: [] };
  let currentUser = null;
  let sessionToken = null;
  let administrator = false;
  const knownEmails = new Map();
  const copy = value => structuredClone(value);
  const id = prefix => `${prefix}-${crypto.randomUUID()}`;
  function requireUser() {
    if (!currentUser) throw new Error('Sign in to continue');
  }
  async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...options.headers }
      });
    } catch {
      throw new Error('Cannot reach MBuddy. Start the server with npm start');
    }
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'Could not complete the request');
    return body;
  }
  async function init() {
    return { configured: true, user: currentUser };
  }
  async function account(path, email, password) {
    const result = await api(path, { method: 'POST', body: JSON.stringify({ email, password }) });
    sessionToken = result.token;
    currentUser = result.user;
    administrator = result.isAdmin;
    knownEmails.set(currentUser.id, currentUser.email);
    return copy(currentUser);
  }
  async function signUp(email, password) {
    const user = await account('/api/accounts', email, password);
    return { user };
  }
  async function signIn(email, password) {
    return account('/api/session', email, password);
  }
  async function signOut() {
    await api('/api/session', { method: 'DELETE' });
    currentUser = null;
    sessionToken = null;
    administrator = false;
  }
  async function listProfiles() {
    data.profiles = await api('/api/profiles');
    return copy(data.profiles);
  }
  async function createProfile(profile) {
    requireUser();
    const existing = data.profiles.find(item => item.user_id === currentUser.id);
    return api(existing ? `/api/profiles/${encodeURIComponent(existing.id)}` : '/api/profiles', {
      method: existing ? 'PUT' : 'POST', body: JSON.stringify(profile)
    });
  }
  async function isAdmin() {
    requireUser();
    return administrator;
  }
  async function deleteProfile(profileId) {
    requireUser();
    await api(`/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
    data.profiles = data.profiles.filter(item => item.id !== profileId);
    data.savedBuddies = data.savedBuddies.filter(item => item.profileId !== profileId);
    data.buddyRequests = data.buddyRequests.filter(request => request.senderProfileId !== profileId && request.receiverProfileId !== profileId);
  }

  async function listSavedProfileIds() {
    requireUser();
    return data.savedBuddies.filter(item => item.userId === currentUser.id).map(item => item.profileId);
  }

  async function saveProfile(profileId) {
    requireUser();
    if (!data.profiles.some(profile => profile.id === profileId)) throw new Error('Profile could not be found');
    if (!data.savedBuddies.some(item => item.userId === currentUser.id && item.profileId === profileId)) {
      data.savedBuddies.push({ userId: currentUser.id, profileId });
    }
  }

  async function unsaveProfile(profileId) {
    requireUser();
    data.savedBuddies = data.savedBuddies.filter(item => !(item.userId === currentUser.id && item.profileId === profileId));
  }

  async function sendBuddyRequest(profileId) {
    requireUser();
    const ownProfile = data.profiles.find(profile => profile.user_id === currentUser.id);
    const targetProfile = data.profiles.find(profile => profile.id === profileId);
    if (!ownProfile) throw new Error('Create your profile before sending a BuddyUp request');
    if (!targetProfile) throw new Error('Profile could not be found');
    if (targetProfile.user_id === currentUser.id) throw new Error('You cannot send a request to yourself');
    const duplicate = data.buddyRequests.some(request =>
      request.status !== 'declined' &&
      ((request.senderProfileId === ownProfile.id && request.receiverProfileId === targetProfile.id) ||
       (request.senderProfileId === targetProfile.id && request.receiverProfileId === ownProfile.id))
    );
    if (duplicate) throw new Error('A BuddyUp request already exists');
    data.buddyRequests.push({
      id: id('request'),
      senderProfileId: ownProfile.id,
      receiverProfileId: targetProfile.id,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  }

  async function listBuddyRequests() {
    requireUser();
    const ownProfile = data.profiles.find(profile => profile.user_id === currentUser.id);
    if (!ownProfile) return [];
    return data.buddyRequests
      .filter(request => request.senderProfileId === ownProfile.id || request.receiverProfileId === ownProfile.id)
      .map(request => {
        const incoming = request.receiverProfileId === ownProfile.id;
        const otherProfileId = incoming ? request.senderProfileId : request.receiverProfileId;
        const otherProfile = data.profiles.find(profile => profile.id === otherProfileId);
        return {
          request_id: request.id,
          other_profile_id: otherProfileId,
          other_name: otherProfile?.first_name || 'Unknown student',
          other_email: request.status === 'accepted' ? knownEmails.get(otherProfile?.user_id) || null : null,
          request_status: request.status,
          direction: incoming ? 'incoming' : 'outgoing'
        };
      });
  }

  async function respondToBuddyRequest(requestId, accept) {
    requireUser();
    const ownProfile = data.profiles.find(profile => profile.user_id === currentUser.id);
    const request = data.buddyRequests.find(item => item.id === requestId);
    if (!request || request.receiverProfileId !== ownProfile?.id) throw new Error('Request could not be found');
    request.status = accept ? 'accepted' : 'declined';
  }

  window.mbuddyDb = {
    configured: true,
    init,
    signUp,
    signIn,
    signOut,
    getUser: () => copy(currentUser),
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
    buddyFeaturesAvailable: () => true
  };
}());

