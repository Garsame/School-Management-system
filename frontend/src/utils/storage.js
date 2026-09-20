const USER_KEY = 'user';
const TEACHER_BRANCH_KEY = 'teacherBranchId';

export const getStoredUser = () => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setStoredUser = (user) => {
  const safeUser = { ...(user || {}) };
  delete safeUser.token;
  localStorage.setItem(USER_KEY, JSON.stringify(safeUser));
};

export const clearStoredUser = () => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TEACHER_BRANCH_KEY);
};

export const getStoredTeacherBranchId = () => localStorage.getItem(TEACHER_BRANCH_KEY) || '';
export const setStoredTeacherBranchId = (branchId) => {
  if (branchId) localStorage.setItem(TEACHER_BRANCH_KEY, branchId);
  else localStorage.removeItem(TEACHER_BRANCH_KEY);
};

