(function () {
  const data = window.MBUDDY_DATA;
  let currentUser = null;

  function id(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function copy(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function emailKey(email) {
    return String(email || '').trim().toLowerCase();
  }

  function requireUser() {
    if (!currentUser) throw new Error('Sign in to continue');
  }

  async function passwordHash(password) {
    if (!globalThis.crypto?.subtle) return `demo-${password}`;
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function init() {
    return { configured: true, user: currentUser };
  }

  async function signUp(email, password) {
    const normalizedEmail = emailKey(email);
    if (data.users.some(user => user.email === normalizedEmail)) {
      throw new Error('An account with this email already exists');
    }
    const user = {
      id: id('user'),
      email: normalizedEmail,
      passwordHash: await passwordHash(password)
    };
    data.users.push(user);
    currentUser = { id: user.id, email: user.email };
    return { user: copy(currentUser), session: { user: copy(currentUser) } };
  }

  async function signIn(email, password) {
    const normalizedEmail = emailKey(email);
    const hash = await passwordHash(password);
    const user = data.users.find(account => account.email === normalizedEmail && account.passwordHash === hash);
    if (!user) throw new Error('Incorrect email or password');
    currentUser = { id: user.id, email: user.email };
    return copy(currentUser);
  }

  async function signOut() {
    currentUser = null;
  }

  async function listProfiles() {
    return copy([...data.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async function createProfile(profile) {
    requireUser();
    const existing = data.profiles.find(item => item.user_id === currentUser.id);
    if (existing) {
      Object.assign(existing, copy(profile), { updated_at: new Date().toISOString() });
      return copy(existing);
    }
    const created = {
      id: id('profile'),
      user_id: currentUser.id,
      ...copy(profile),
      created_at: new Date().toISOString()
    };
    data.profiles.push(created);
    return copy(created);
  }

  async function isAdmin() {
    requireUser();
    return data.adminEmails.map(emailKey).includes(emailKey(currentUser.email));
  }

  async function deleteProfile(profileId) {
    requireUser();
    const profile = data.profiles.find(item => item.id === profileId);
    if (!profile) throw new Error('Profile could not be found');
    const admin = data.adminEmails.map(emailKey).includes(emailKey(currentUser.email));
    if (!admin && profile.user_id !== currentUser.id) throw new Error('You cannot delete this profile');
    data.profiles.splice(data.profiles.indexOf(profile), 1);
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
        const otherUser = data.users.find(user => user.id === otherProfile?.user_id);
        return {
          request_id: request.id,
          other_profile_id: otherProfileId,
          other_name: otherProfile?.first_name || 'Unknown student',
          other_email: request.status === 'accepted' ? otherUser?.email || null : null,
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
