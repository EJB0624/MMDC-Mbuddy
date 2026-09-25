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
      id: data.seedOwnerIds?.[normalizedEmail] || id('user'),
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
