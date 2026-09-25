(function () {
  const data = window.MBUDDY_DATA;
  let currentUser = null;
  const knownEmails = new Map();

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

  function cryptoProvider() {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
      throw new Error('Open MBuddy on localhost or HTTPS to use accounts');
    }
    return globalThis.crypto;
  }

  function hex(bytes) {
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function fromHex(value) {
    return Uint8Array.from(value.match(/.{2}/g), pair => parseInt(pair, 16));
  }

  async function emailHash(email) {
    const digest = await cryptoProvider().subtle.digest('SHA-256', new TextEncoder().encode(emailKey(email)));
    return hex(digest);
  }

  async function passwordHash(password, salt) {
    const crypto = cryptoProvider();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2', salt: fromHex(salt), iterations: 120000, hash: 'SHA-256'
    }, key, 256);
    return hex(bits);
  }

  async function init() {
    return { configured: true, user: currentUser };
  }

  async function signUp(email, password) {
    const normalizedEmail = emailKey(email);
    const hashedEmail = await emailHash(normalizedEmail);
    if (data.users.some(user => user.emailHash === hashedEmail)) {
      throw new Error('An account with this email already exists');
    }
    const salt = hex(cryptoProvider().getRandomValues(new Uint8Array(16)));
    const user = {
      id: id('user'),
      emailHash: hashedEmail,
      passwordSalt: salt,
      passwordHash: await passwordHash(password, salt)
    };
    data.users.push(user);
    knownEmails.set(user.id, normalizedEmail);
    currentUser = { id: user.id, email: normalizedEmail };
    return { user: copy(currentUser), session: { user: copy(currentUser) } };
  }

  async function signIn(email, password) {
    const normalizedEmail = emailKey(email);
    const hashedEmail = await emailHash(normalizedEmail);
    const user = data.users.find(account => account.emailHash === hashedEmail);
    const hash = user && await passwordHash(password, user.passwordSalt);
    if (!user || user.passwordHash !== hash) throw new Error('Incorrect email or password');
    knownEmails.set(user.id, normalizedEmail);
    currentUser = { id: user.id, email: normalizedEmail };
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
    return data.adminUserIds.includes(currentUser.id);
  }

  async function deleteProfile(profileId) {
    requireUser();
    const profile = data.profiles.find(item => item.id === profileId);
    if (!profile) throw new Error('Profile could not be found');
    const admin = data.adminUserIds.includes(currentUser.id);
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
